// lib/health-score.ts

export interface HealthScoreInputs {
    docHealth: number; // 0-100 from doc-health calculation
    hasTests: boolean;
    codeCoverage?: number; // 0-100
    bestPracticesCount: number;
    bestPracticesHealthy: number;
    communityStandardsCount: number;
    communityStandardsHealthy: number;
    hasCI: boolean;
    ciPassing?: boolean; // true = CI passing, false = CI configured but failing, undefined = no CI
    lastCommitDays: number;
    openIssuesCount: number;
    openPRsCount: number;
    vulnCriticalCount?: number;
    vulnHighCount?: number;
    secretScanningAlertCount?: number;
    // Issue tracking
    openIssuesCountDetailed?: number; // Total open issues (excluding PRs)
    staleIssuesCount?: number; // Issues not updated in 90+ days
    issueLabels?: string[]; // Labels on open issues (for categorization)
}

export interface HealthScoreBreakdown {
    total: number; // 0-100
    documentation: number;
    testing: number;
    bestPractices: number;
    community: number;
    activity: number;
    security: number;
}

/**
 * Calculate overall repository health score (0-100)
 *
 * Weights:
 * - Security: 30%
 * - Testing: 25%  (elevated: coverage + CI state are strong quality signals)
 * - Best Practices: 25%
 * - Documentation: 10%
 * - Community Standards: 5%
 * - Activity: 5%
 */
export function calculateHealthScore(inputs: HealthScoreInputs): HealthScoreBreakdown {
    // Documentation Score (0-100)
    const docScore = inputs.docHealth; // Already 0-100

    // Testing Score (0-100)
    // Coverage carries more weight here because low coverage is a reliable
    // predictor of latent bugs. A failing CI build is treated as a test
    // failure and penalizes the score directly.
    let testScore = 0;
    if (inputs.hasTests) {
        testScore = 40; // Base for having tests
        if (inputs.codeCoverage !== undefined) {
            testScore += Math.min(inputs.codeCoverage * 0.6, 60); // Up to 60 points for coverage
        }
    }
    // A CI build that is actively failing is a broken test suite
    if (inputs.ciPassing === false) {
        testScore = Math.max(testScore - 25, 0);
    }

    // Best Practices Score (0-100)
    let bestPracticesScore = 0;
    if (inputs.bestPracticesCount > 0) {
        const ratio = inputs.bestPracticesHealthy / inputs.bestPracticesCount;
        bestPracticesScore = ratio * 100;

        // Bonus for CI/CD
        if (inputs.hasCI) {
            bestPracticesScore = Math.min(bestPracticesScore + 10, 100);
        }
    }

    // Community Standards Score (0-100)
    let communityScore = 0;
    if (inputs.communityStandardsCount > 0) {
        const ratio = inputs.communityStandardsHealthy / inputs.communityStandardsCount;
        communityScore = ratio * 100;
    }

    // Activity Score (0-100)
    let activityScore = 100;

    // Deduct points for staleness
    if (inputs.lastCommitDays > 90) {
        activityScore -= Math.min((inputs.lastCommitDays - 90) / 3, 40); // Up to -40 for being very stale
    }

    // Deduct points for many open issues (using detailed count if available)
    const effectiveOpenIssues = inputs.openIssuesCountDetailed ?? inputs.openIssuesCount;
    if (effectiveOpenIssues > 10) {
        activityScore -= Math.min((effectiveOpenIssues - 10) * 2, 20); // Up to -20 for many issues
    }

    // Deduct points for stale issues (not updated in 90+ days)
    if ((inputs.staleIssuesCount ?? 0) > 5) {
        activityScore -= Math.min((inputs.staleIssuesCount! - 5) * 2, 15); // Up to -15 for stale issues
    }

    // Deduct points for stale PRs
    if (inputs.openPRsCount > 5) {
        activityScore -= Math.min((inputs.openPRsCount - 5) * 3, 20); // Up to -20 for many open PRs
    }

    activityScore = Math.max(activityScore, 0);

    // Security Score (0-100)
    // Critical/high Dependabot vulnerability alerts and open secret-scanning
    // alerts each reduce the score, with secrets weighted heaviest since an
    // exposed credential is an active incident rather than a latent risk.
    // Penalties are intentionally steep: a single critical vuln is a serious risk.
    let securityScore = 100;
    securityScore -= Math.min((inputs.vulnCriticalCount ?? 0) * 20, 70); // was 15/cap-60
    securityScore -= Math.min((inputs.vulnHighCount ?? 0) * 10, 45);     // was 8/cap-30
    securityScore -= Math.min((inputs.secretScanningAlertCount ?? 0) * 20, 60);
    securityScore = Math.max(securityScore, 0);

    // Weighted Total
    const total = Math.round(
        docScore * 0.10 +
        testScore * 0.25 +
        bestPracticesScore * 0.25 +
        communityScore * 0.05 +
        activityScore * 0.05 +
        securityScore * 0.30
    );

    return {
        total,
        documentation: Math.round(docScore),
        testing: Math.round(testScore),
        bestPractices: Math.round(bestPracticesScore),
        community: Math.round(communityScore),
        activity: Math.round(activityScore),
        security: Math.round(securityScore),
    };
}

export function getHealthGrade(score: number): { grade: string; color: string } {
    if (score >= 90) return { grade: 'A', color: 'text-green-400' };
    if (score >= 80) return { grade: 'B', color: 'text-blue-400' };
    if (score >= 70) return { grade: 'C', color: 'text-yellow-400' };
    if (score >= 60) return { grade: 'D', color: 'text-orange-400' };
    return { grade: 'F', color: 'text-red-400' };
}
