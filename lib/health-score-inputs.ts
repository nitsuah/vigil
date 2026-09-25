// lib/health-score-inputs.ts
//
// The one place that turns a repo's stored rows into calculateHealthScore
// inputs. Sync, the health-profile route and the dashboard breakdown all go
// through here, so a profile change or a popup recompute scores a repo exactly
// the way the last sync did.

import { calculateDocHealth } from './doc-health';
import type { HealthScoreInputs } from './health-score';
import { isHealthProfileId } from './health-profiles';

/** The repos columns the score reads. */
export interface RepoHealthFields {
    repo_type?: string | null;
    health_profile?: string | null;
    ci_status?: string | null;
    last_commit_date?: string | Date | null;
    open_issues?: number | null;
    open_issues_count?: number | null;
    stale_issues_count?: number | null;
    open_prs?: number | null;
    vuln_critical_count?: number | null;
    vuln_high_count?: number | null;
    code_scanning_alert_count?: number | null;
    secret_scanning_alert_count?: number | null;
    has_security_policy?: boolean | null;
    has_security_advisories?: boolean | null;
    private_vuln_reporting_enabled?: boolean | null;
    dependabot_alerts_enabled?: boolean | null;
    code_scanning_enabled?: boolean | null;
    secret_scanning_enabled?: boolean | null;
}

/** The per-repo detail rows the score reads. */
export interface RepoHealthRows {
    docStatuses: Array<{ doc_type: string; exists: boolean }>;
    bestPractices: Array<{ practice_type: string; status: string }>;
    communityStandards: Array<{ status: string }>;
    // DB rows carry metric_name; the repo-details API renames it to name.
    metrics: Array<{ metric_name?: string | null; name?: string | null; value?: number | string | null }>;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function isHealthy(practices: RepoHealthRows['bestPractices'], type: string): boolean {
    return practices.some((bp) => bp.practice_type === type && bp.status === 'healthy');
}

export function buildHealthScoreInputs(
    repo: RepoHealthFields,
    rows: RepoHealthRows,
    now: number = Date.now()
): HealthScoreInputs {
    const coverage = rows.metrics.find((m) =>
        (m.metric_name ?? m.name)?.toLowerCase().includes('coverage')
    );
    const coverageValue = coverage?.value == null ? undefined : Number(coverage.value);
    // Sync writes open_issues_count and stale_issues_count together, and leaves
    // stale_issues_count NULL when the issue scan didn't run. Rows synced before
    // that carry open_issues_count's legacy DEFAULT 0, so NULL here means "no
    // scan": fall back to open_issues rather than scoring zero issues.
    const issuesScanned = repo.stale_issues_count != null;

    return {
        healthProfile: isHealthProfileId(repo.health_profile) ? repo.health_profile : undefined,
        docHealth: calculateDocHealth(rows.docStatuses, repo.repo_type || 'tool').score,
        hasTests: isHealthy(rows.bestPractices, 'testing_framework'),
        codeCoverage: Number.isFinite(coverageValue) ? coverageValue : undefined,
        bestPracticesCount: rows.bestPractices.length,
        bestPracticesHealthy: rows.bestPractices.filter((bp) => bp.status === 'healthy').length,
        communityStandardsCount: rows.communityStandards.length,
        communityStandardsHealthy: rows.communityStandards.filter((cs) => cs.status === 'healthy').length,
        hasCI: isHealthy(rows.bestPractices, 'ci_cd'),
        // true = passing, false = actively failing, undefined = unknown/no CI.
        ciPassing: repo.ci_status === 'passing' ? true : repo.ci_status === 'failing' ? false : undefined,
        lastCommitDays: repo.last_commit_date
            ? Math.floor((now - new Date(repo.last_commit_date).getTime()) / DAY_MS)
            : 365,
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
        openIssuesCountDetailed: issuesScanned ? (repo.open_issues_count ?? undefined) : undefined,
        staleIssuesCount: issuesScanned ? (repo.stale_issues_count ?? undefined) : undefined,
    };
}
