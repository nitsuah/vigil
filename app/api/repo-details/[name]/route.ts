import { NextRequest, NextResponse } from 'next/server';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessRepo, isDefaultRepo } from '@/lib/repo-access';
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

        // Round trip 1: get the repo row(s) so we can auth-check and get repo.id.
        // `name` is not unique across owners, so pick the row this caller may
        // actually see (default repos only for anonymous callers).
        const candidateRows = await db`SELECT * FROM repos WHERE name = ${repoName} ORDER BY full_name LIMIT 25`;

        let selected: (typeof candidateRows)[number] | undefined;
        for (const row of candidateRows) {
            const visible = session
                ? await canAccessRepo(db, row as { id: string; full_name?: string; private_repo?: boolean; visibility_verified?: boolean }, session.userId)
                : isDefaultRepo(row.full_name);
            if (visible) {
                selected = row;
                break;
            }
        }

        if (!selected) {
            // Nothing visible: 404 for unknown or private-to-others repos (so
            // existence isn't confirmed); anonymous callers get 401 when the
            // name matches a non-default repo.
            if (!session && candidateRows.length > 0) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }

        // NUMERIC columns arrive as strings; give the client real numbers.
        const repo = normalizeRepoRow(selected);

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
