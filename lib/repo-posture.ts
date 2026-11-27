// What an anonymous visitor may see of a repo. Protection settings and alert
// counts are only served to a signed-in user who passes canAccessRepo
// (lib/repo-access.ts); signed-out demo views get these rows with them removed.

/** `repos` columns that describe a repo's protections or open alerts. */
export const POSTURE_REPO_COLUMNS = [
    'has_security_policy',
    'has_security_advisories',
    'private_vuln_reporting_enabled',
    'dependabot_alerts_enabled',
    'dependabot_alert_count',
    'code_scanning_enabled',
    'code_scanning_alert_count',
    'secret_scanning_enabled',
    'secret_scanning_alert_count',
    'security_last_checked',
    'vuln_alert_count',
    'vuln_critical_count',
    'vuln_high_count',
    'vuln_last_checked',
] as const;

// Allowlists, so a practice or standard added later stays hidden by default.
const PUBLIC_PRACTICE_TYPES = new Set(['testing_framework', 'ci_cd', 'journeys']);
const PUBLIC_STANDARD_TYPES = new Set([
    'code_of_conduct',
    'contributing',
    'license',
    'changelog',
    'issue_template',
    'pr_template',
    'copilot_instructions',
    'flow_tasks_prompt',
    'handoff_prompt',
    'codeowners',
    'funding',
]);

export function toPublicRepoRow<T extends Record<string, unknown>>(row: T): T {
    const out: Record<string, unknown> = { ...row };
    for (const column of POSTURE_REPO_COLUMNS) delete out[column];
    return out as T;
}

export function publicPractices<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows.filter((r) => PUBLIC_PRACTICE_TYPES.has(String(r.practice_type)));
}

export function publicStandards<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows.filter((r) => PUBLIC_STANDARD_TYPES.has(String(r.standard_type)));
}
