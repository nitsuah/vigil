import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { auth } from '@/auth';
import { DEFAULT_REPOS } from '@/lib/default-repos';
import { canAccessRepo } from '@/lib/repo-access';
import { normalizeRepoRow, normalizeMetricRow } from '@/lib/numeric';
import logger from '@/lib/log';
import type { SecurityConfig, SecurityDisplayStatus } from '@/types/repo';

const toSecurityDisplayStatus = (value: unknown): SecurityDisplayStatus =>
    value === true || value === false ? value : 'unknown';

export async function GET(
    request: NextRequest,
    props: { params: Promise<{ name: string }> }
) {
    const params = await props.params;
    try {
        const session = await auth();
        const repoName = params.name;

        if (!repoName) {
            return NextResponse.json({ error: 'Repo name required' }, { status: 400 });
        }

        const db = getNeonClient();
        await ensureSchema(db);

        // Round trip 1: get the repo row so we can auth-check and get repo.id.
        const repoRows = await db`SELECT * FROM repos WHERE name = ${repoName} LIMIT 1`;

        if (repoRows.length === 0) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }

        // NUMERIC columns arrive as strings; give the client real numbers.
        const repo = normalizeRepoRow(repoRows[0]);

        // If not authenticated, only allow access to default repos
        if (!session) {
            const defaultRepoNames = DEFAULT_REPOS.map(r => r.name);
            if (!defaultRepoNames.includes(repo.name)) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        } else if (!(await canAccessRepo(db, repo as { id: string; full_name?: string; private_repo?: boolean; visibility_verified?: boolean }, session.userId))) {
            // Signed in, but this repo is private and not theirs (CWE-639):
            // `repos` has no per-row owner, so being authenticated at all
            // isn't proof of access to *this* repo. 404 (not 403) so its
            // existence isn't confirmed to a caller who can't see it.
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }

        // Round trip 2: fetch all seven detail tables in a single HTTP transaction
        // so the dashboard panel resolves in one round trip instead of seven.
        const [
            tasks,
            roadmapItems,
            metricsRows,
            features,
            docStatuses,
            bestPractices,
            communityStandards,
        ] = await db.transaction([
            db`SELECT * FROM tasks WHERE repo_id = ${repo.id} ORDER BY created_at DESC`,
            db`SELECT * FROM roadmap_items WHERE repo_id = ${repo.id} ORDER BY created_at DESC`,
            db`SELECT * FROM metrics WHERE repo_id = ${repo.id} ORDER BY timestamp DESC`,
            db`SELECT * FROM features WHERE repo_id = ${repo.id} ORDER BY created_at ASC`,
            db`SELECT * FROM doc_status WHERE repo_id = ${repo.id}`,
            db`SELECT * FROM best_practices WHERE repo_id = ${repo.id}`,
            db`SELECT * FROM community_standards WHERE repo_id = ${repo.id}`,
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metrics = metricsRows.map(normalizeMetricRow).map((m: any) => ({
            name: m.metric_name,
            value: m.value,
            unit: m.unit
        }));

        // Build display security config without coercing unknown to disabled.
        const securityStatusFields = [
            repo.has_security_policy,
            repo.has_security_advisories,
            repo.private_vuln_reporting_enabled,
            repo.dependabot_alerts_enabled,
            repo.code_scanning_enabled,
            repo.secret_scanning_enabled,
        ];
        let securityConfig: SecurityConfig | null = null;
        if (securityStatusFields.some((value) => value !== undefined)) {
            securityConfig = {
                hasSecurityPolicy: toSecurityDisplayStatus(repo.has_security_policy),
                hasSecurityAdvisories: toSecurityDisplayStatus(repo.has_security_advisories),
                privateVulnerabilityReportingEnabled: toSecurityDisplayStatus(repo.private_vuln_reporting_enabled),
                dependabotAlertsEnabled: toSecurityDisplayStatus(repo.dependabot_alerts_enabled),
                dependabotAlertCount: repo.dependabot_alert_count ?? 0,
                codeScanningEnabled: toSecurityDisplayStatus(repo.code_scanning_enabled),
                codeScanningAlertCount: repo.code_scanning_alert_count ?? 0,
                secretScanningEnabled: toSecurityDisplayStatus(repo.secret_scanning_enabled),
                secretScanningAlertCount: repo.secret_scanning_alert_count ?? 0,
            };
        }

        return NextResponse.json({
            repo,
            tasks,
            roadmapItems,
            metrics,
            features,
            docStatuses,
            bestPractices,
            communityStandards,
            securityConfig
        });
    } catch (error: unknown) {
        logger.warn('Error fetching repo details:', error);
        return NextResponse.json({ error: 'Failed to fetch repo details' }, { status: 500 });
    }
}
