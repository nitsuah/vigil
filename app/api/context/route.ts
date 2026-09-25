/**
 * GET /api/context — LLM-optimized context dump for AI agent consumption.
 *
 * Returns structured JSON designed to be passed directly as context to an LLM
 * or MCP agent so it can answer questions about this repository portfolio.
 *
 * Query params:
 *   ?repo=<name>   Single-repo context (name or owner/repo)
 *   (none)         Full portfolio context
 *
 * Auth (checked in order):
 *   1. Authorization: Bearer <MCP_API_KEY>  →  full portfolio access
 *   2. NextAuth session cookie              →  repos this user may access
 *   3. No auth                              →  default repos only
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { auth } from '@/auth';
import { DEFAULT_REPOS } from '@/lib/default-repos';
import { canAccessRepo, getAccessibleRepoIds } from '@/lib/repo-access';
import logger from '@/lib/log';
import { healthGrade, buildGradeDist, buildCiDist } from '@/lib/health-grade';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function describeIssues(r: Row): string {
  const issues: string[] = [];
  if ((r.vuln_critical_count  ?? 0) > 0) issues.push(`${r.vuln_critical_count} critical vulns`);
  if ((r.secret_scanning_alert_count ?? 0) > 0) issues.push(`${r.secret_scanning_alert_count} secret alerts`);
  if (r.ci_status && r.ci_status !== 'passing' && r.ci_status !== 'unknown') issues.push('CI failing');
  return issues.length ? issues.join(', ') : 'low health score';
}

function isAuthenticated(req: NextRequest): boolean {
  const apiKey = process.env.MCP_API_KEY;
  if (apiKey) {
    const authHeader = req.headers.get('authorization');
    if (authHeader === `Bearer ${apiKey}`) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const repoName = searchParams.get('repo');

    // Determine auth level: Bearer token > session > guest
    const bearerOk  = isAuthenticated(req);
    const session   = bearerOk ? null : await auth();
    const authed    = bearerOk || !!session;

    const defaultNames = DEFAULT_REPOS.map((r: { name: string }) => r.name);
    const db = getNeonClient();
    await ensureSchema(db);

    // -----------------------------------------------------------------------
    // Single-repo context
    // -----------------------------------------------------------------------
    if (repoName) {
      const repoRows = (await db`
        SELECT * FROM repos
        WHERE (name = ${repoName} OR full_name = ${repoName})
          AND is_hidden = false
        LIMIT 1
      `) as Row[];

      // A session (unlike the bearer key, which is the portfolio admin) is not
      // itself proof of access to this repo (CWE-639).
      const denied =
        repoRows.length > 0 && session &&
        !(await canAccessRepo(db, repoRows[0] as unknown as { id: string }, session.userId));

      if (
        repoRows.length === 0 ||
        denied ||
        (!authed && !defaultNames.includes(repoRows[0].name))
      ) {
        return NextResponse.json({ error: `Repository "${repoName}" not found` }, { status: 404 });
      }

      const repo = repoRows[0];

      const [tasks, roadmapItems, docStatuses, bestPractices, communityStandards] =
        await db.transaction([
          db`SELECT title, status, section FROM tasks WHERE repo_id = ${repo.id} ORDER BY created_at DESC LIMIT 50`,
          db`SELECT title, quarter, status FROM roadmap_items WHERE repo_id = ${repo.id} ORDER BY created_at DESC LIMIT 30`,
          db`SELECT doc_type, "exists", health_state FROM doc_status WHERE repo_id = ${repo.id}`,
          db`SELECT practice_type, status FROM best_practices WHERE repo_id = ${repo.id}`,
          db`SELECT standard_type, status FROM community_standards WHERE repo_id = ${repo.id}`,
        ]);

      const t  = tasks             as Row[];
      const ri = roadmapItems      as Row[];
      const bp = bestPractices     as Row[];
      const cs = communityStandards as Row[];

      return NextResponse.json({
        context_type: 'single_repo',
        generated_at: new Date().toISOString(),
        instructions:
          "Structured context about a GitHub repository tracked in Vigil. " +
          "Use it to answer questions about health, tasks, roadmap, documentation, and security.",
        repo: {
          name:             repo.name,
          full_name:        repo.full_name,
          description:      repo.description,
          url:              repo.url,
          language:         repo.language,
          repo_type:        repo.repo_type,
          stars:            repo.stars,
          forks:            repo.forks,
          last_commit_date: repo.last_commit_date,
          ci_status:        repo.ci_status,
          open_prs:         repo.open_prs ?? 0,
          open_issues:      repo.open_issues_count ?? 0,
        },
        health: {
          score:  repo.health_score ?? null,
          profile: repo.health_profile ?? 'production',
          grade:  healthGrade(repo.health_score ?? 0),
          security: {
            vuln_critical:  repo.vuln_critical_count  ?? 0,
            vuln_high:      repo.vuln_high_count      ?? 0,
            secret_alerts:  repo.secret_scanning_alert_count ?? 0,
            controls: {
              security_policy: repo.has_security_policy ?? false,
              private_vulnerability_reporting: repo.private_vuln_reporting_enabled ?? false,
              dependabot_alerts: repo.dependabot_alerts_enabled ?? false,
              code_scanning: repo.code_scanning_enabled ?? false,
              secret_scanning: repo.secret_scanning_enabled ?? false,
            },
          },
          testing: {
            status:   repo.testing_status,
            coverage: repo.coverage_score ?? null,
          },
        },
        tasks: {
          summary: `${t.filter(x => x.status === 'todo').length} todo · ${t.filter(x => x.status === 'in-progress').length} in progress · ${t.filter(x => x.status === 'done').length} done`,
          items:   t,
        },
        roadmap: {
          summary: `${ri.filter(x => x.status === 'planned').length} planned · ${ri.filter(x => x.status === 'in-progress').length} in progress · ${ri.filter(x => x.status === 'completed').length} completed`,
          items:   ri,
        },
        documentation: {
          statuses: docStatuses,
          present:  (docStatuses as Row[]).filter(d => d.exists).map(d => d.doc_type),
          missing:  (docStatuses as Row[]).filter(d => !d.exists).map(d => d.doc_type),
        },
        best_practices: {
          summary: `${bp.filter(p => p.status === 'healthy').length}/${bp.length} healthy`,
          items:   bp,
        },
        community_standards: {
          summary: `${cs.filter(s => s.status === 'healthy').length}/${cs.length} healthy`,
          items:   cs,
        },
      });
    }

    // -----------------------------------------------------------------------
    // Portfolio context
    // -----------------------------------------------------------------------
    const allRows = (await db`
      SELECT id, name, full_name, description, url, language, repo_type, health_score,
             ci_status, open_prs, open_issues_count, vuln_critical_count, vuln_high_count,
             secret_scanning_alert_count, last_commit_date, stars, testing_status,
             coverage_score, last_synced
      FROM repos
      WHERE is_hidden = false
      ORDER BY health_score ASC NULLS LAST
    `) as Row[];

    // Bearer key = portfolio admin (full portfolio); a session only sees repos
    // it may access (CWE-639); guests only see the defaults.
    const accessibleIds = session ? await getAccessibleRepoIds(db, session.userId) : null;
    const repos = bearerOk
      ? allRows
      : accessibleIds
        ? allRows.filter(r => accessibleIds.has((r as unknown as { id: string }).id))
        : allRows.filter(r => defaultNames.includes(r.name));

    const avgHealth = repos.length
      ? Math.round(repos.reduce((s, r) => s + (r.health_score ?? 0), 0) / repos.length)
      : 0;

    return NextResponse.json({
      context_type: 'portfolio',
      generated_at: new Date().toISOString(),
      instructions:
        "Structured context about a portfolio of GitHub repositories tracked in Vigil. " +
        "Use it to answer questions about repository health, project status, security posture, " +
        "what needs attention, and cross-repo patterns.",
      summary: {
        total_repos:         repos.length,
        average_health_score: avgHealth,
        average_health_grade: healthGrade(avgHealth),
        grade_distribution:   buildGradeDist(repos),
        ci_distribution:      buildCiDist(repos),
        total_open_prs:       repos.reduce((s, r) => s + (r.open_prs ?? 0), 0),
        total_open_issues:    repos.reduce((s, r) => s + (r.open_issues_count ?? 0), 0),
        total_critical_vulns: repos.reduce((s, r) => s + (r.vuln_critical_count ?? 0), 0),
      },
      repos: repos.map(r => ({
        name:         r.name,
        description:  r.description,
        language:     r.language,
        type:         r.repo_type,
        url:          r.url,
        health: {
          score: r.health_score ?? null,
          grade: healthGrade(r.health_score ?? 0),
        },
        ci_status:    r.ci_status,
        open_prs:     r.open_prs ?? 0,
        open_issues:  r.open_issues_count ?? 0,
        security: {
          critical:  r.vuln_critical_count ?? 0,
          high:      r.vuln_high_count ?? 0,
          secrets:   r.secret_scanning_alert_count ?? 0,
        },
        last_active:  r.last_commit_date,
        last_synced:  r.last_synced,
      })),
      needs_attention: repos
        .filter(r => (r.health_score ?? 0) < 60)
        .map(r => ({
          name:         r.name,
          health_score: r.health_score,
          health_grade: healthGrade(r.health_score ?? 0),
          reason:       describeIssues(r),
        })),
      security_alerts: repos
        .filter(r => (r.vuln_critical_count ?? 0) > 0 || (r.secret_scanning_alert_count ?? 0) > 0)
        .map(r => ({
          name:     r.name,
          critical: r.vuln_critical_count ?? 0,
          secrets:  r.secret_scanning_alert_count ?? 0,
        })),
      ci_failing: repos
        .filter(r => r.ci_status && r.ci_status !== 'passing' && r.ci_status !== 'unknown')
        .map(r => ({ name: r.name, ci_status: r.ci_status })),
    });
  } catch (error) {
    logger.error('[context] Failed to generate context:', error);
    return NextResponse.json(
      { error: 'Failed to generate context' },
      { status: 500 }
    );
  }
}
