import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';
import { calculateDocHealth } from '@/lib/doc-health';
import { calculateHealthScore } from '@/lib/health-score';
import { isHealthProfileId } from '@/lib/health-profiles';
import { normalizeRepoRow } from '@/lib/numeric';
import logger from '@/lib/log';

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ name: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = await props.params;
    const repoName = params.name;
    const denied = await denyIfNoRepoAccess(repoName, session);
    if (denied) return denied;

    const { profile } = await request.json();
    if (!isHealthProfileId(profile)) {
      return NextResponse.json({ error: 'Invalid health profile' }, { status: 400 });
    }

    const db = getNeonClient();
    await ensureSchema(db);

    const [repo] = await db`
      SELECT * FROM repos WHERE name = ${repoName} LIMIT 1
    `;
    if (!repo) {
      return NextResponse.json({ error: `Repository ${repoName} not found` }, { status: 404 });
    }

    await db`
      UPDATE repos
      SET health_profile = ${profile}, updated_at = NOW()
      WHERE id = ${repo.id}
    `;

    const [docStatusRows, bestPracticeRows, communityStandardRows, metricRows] = await Promise.all([
      db`SELECT * FROM doc_status WHERE repo_id = ${repo.id}`,
      db`SELECT * FROM best_practices WHERE repo_id = ${repo.id}`,
      db`SELECT * FROM community_standards WHERE repo_id = ${repo.id}`,
      db`SELECT * FROM metrics WHERE repo_id = ${repo.id}`,
    ]);
    const docStatuses = docStatusRows as Array<{ doc_type: string; exists: boolean }>;
    const bestPractices = bestPracticeRows as Array<{ practice_type: string; status: string }>;
    const communityStandards = communityStandardRows as Array<{ status: string }>;
    const metrics = metricRows as Array<{ metric_name?: string; value?: number }>;

    const docHealth = calculateDocHealth(docStatuses, repo.repo_type || 'tool');
    const coverage = metrics.find((m: { metric_name?: string }) =>
      m.metric_name?.toLowerCase().includes('coverage')
    );
    const hasTests = bestPractices.some(
      (bp: { practice_type: string; status: string }) =>
        bp.practice_type === 'testing_framework' && bp.status === 'healthy'
    );
    const hasCI = bestPractices.some(
      (bp: { practice_type: string; status: string }) =>
        bp.practice_type === 'ci_cd' && bp.status === 'healthy'
    );
    const ciPassing: boolean | undefined =
      repo.ci_status === 'passing' ? true :
      repo.ci_status === 'failing' ? false :
      undefined;

    const daysSinceCommit = repo.last_commit_date
      ? Math.floor((Date.now() - new Date(repo.last_commit_date).getTime()) / (1000 * 60 * 60 * 24))
      : 365;

    const healthScore = calculateHealthScore({
      healthProfile: profile,
      docHealth: docHealth.score,
      hasTests,
      codeCoverage: coverage?.value,
      bestPracticesCount: bestPractices.length,
      bestPracticesHealthy: bestPractices.filter((bp: { status: string }) => bp.status === 'healthy').length,
      communityStandardsCount: communityStandards.length,
      communityStandardsHealthy: communityStandards.filter((cs: { status: string }) => cs.status === 'healthy').length,
      hasCI,
      ciPassing,
      lastCommitDays: daysSinceCommit,
      openIssuesCount: repo.open_issues ?? 0,
      openPRsCount: repo.open_prs ?? 0,
      vulnCriticalCount: repo.vuln_critical_count ?? 0,
      vulnHighCount: repo.vuln_high_count ?? 0,
      codeScanningAlertCount: repo.code_scanning_alert_count ?? 0,
      secretScanningAlertCount: repo.secret_scanning_alert_count ?? 0,
      hasSecurityPolicy: repo.has_security_policy ?? false,
      hasSecurityAdvisories: repo.has_security_advisories ?? false,
      privateVulnerabilityReportingEnabled: repo.private_vuln_reporting_enabled ?? false,
      dependabotAlertsEnabled: repo.dependabot_alerts_enabled ?? false,
      codeScanningEnabled: repo.code_scanning_enabled ?? false,
      secretScanningEnabled: repo.secret_scanning_enabled ?? false,
      openIssuesCountDetailed: repo.open_issues_count ?? 0,
    });

    await db`
      UPDATE repos
      SET health_score = ${healthScore.total}, updated_at = NOW()
      WHERE id = ${repo.id}
    `;

    const [updatedRepo] = await db`SELECT * FROM repos WHERE id = ${repo.id} LIMIT 1`;
    return NextResponse.json({
      success: true,
      profile,
      healthScore,
      updatedRepo: normalizeRepoRow(updatedRepo),
    });
  } catch (error: unknown) {
    logger.warn('Error updating health profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
