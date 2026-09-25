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
    healthProfile?: HealthProfileId;
    hasSecurityPolicy?: boolean;
    hasSecurityAdvisories?: boolean;
    privateVulnerabilityReportingEnabled?: boolean;
    dependabotAlertsEnabled?: boolean;
    codeScanningEnabled?: boolean;
    codeScanningAlertCount?: number;
    secretScanningEnabled?: boolean;
}

export interface HealthScoreBreakdown {
    total: number; // 0-100
    documentation: number;
    testing: number;
    bestPractices: number;
    community: number;
    activity: number;
    security: number;
    securityPosture: number;
    healthProfile: HealthProfileId;
}

/**
 * Calculate overall repository health score (0-100).
 *
 * The selected maturity profile changes the relative importance of each
 * component. Security also measures control enablement, not only findings,
 * so a repository with zero known alerts cannot receive a perfect security
 * score while its detection controls are disabled.
 */
export function calculateHealthScore(inputs: HealthScoreInputs): HealthScoreBreakdown {
    const profile = getHealthProfile(inputs.healthProfile);
    const docScore = inputs.docHealth;

    let testScore = 0;
    if (inputs.hasTests) {
        testScore = 40;
        if (inputs.codeCoverage !== undefined) {
            testScore += Math.min(inputs.codeCoverage * 0.6, 60);
        }
    }
    if (inputs.ciPassing === false) {
        testScore = Math.max(testScore - 25, 0);
    }

    let bestPracticesScore = 0;
    if (inputs.bestPracticesCount > 0) {
        const ratio = inputs.bestPracticesHealthy / inputs.bestPracticesCount;
        bestPracticesScore = ratio * 100;
        if (inputs.hasCI) {
            bestPracticesScore = Math.min(bestPracticesScore + 10, 100);
        }
    }

    let communityScore = 0;
    if (inputs.communityStandardsCount > 0) {
        const ratio = inputs.communityStandardsHealthy / inputs.communityStandardsCount;
        communityScore = ratio * 100;
    }

    let activityScore = 100;
    if (inputs.lastCommitDays > 90) {
        activityScore -= Math.min((inputs.lastCommitDays - 90) / 3, 40);
    }

    const effectiveOpenIssues = inputs.openIssuesCountDetailed ?? inputs.openIssuesCount;
    if (effectiveOpenIssues > 10) {
        activityScore -= Math.min((effectiveOpenIssues - 10) * 2, 20);
    }

    if ((inputs.staleIssuesCount ?? 0) > 5) {
        activityScore -= Math.min((inputs.staleIssuesCount! - 5) * 2, 15);
    }

    if (inputs.openPRsCount > 5) {
        activityScore -= Math.min((inputs.openPRsCount - 5) * 3, 20);
    }

    activityScore = Math.max(activityScore, 0);

    const securityControls: Record<string, boolean> = {
        securityPolicy: inputs.hasSecurityPolicy ?? false,
        privateVulnerabilityReporting: inputs.privateVulnerabilityReportingEnabled ?? false,
        dependabotAlerts: inputs.dependabotAlertsEnabled ?? false,
        codeScanning: inputs.codeScanningEnabled ?? false,
        secretScanning: inputs.secretScanningEnabled ?? false,
    };
    const requiredControls = profile.requiredSecurityControls;
    const enabledRequiredControls = requiredControls.filter((control) => securityControls[control]).length;
    const securityPosture = requiredControls.length > 0
        ? (enabledRequiredControls / requiredControls.length) * 100
        : 100;

    let findingScore = 100;
    findingScore -= Math.min((inputs.vulnCriticalCount ?? 0) * 20, 70);
    findingScore -= Math.min((inputs.vulnHighCount ?? 0) * 10, 45);
    findingScore -= Math.min((inputs.codeScanningAlertCount ?? 0) * 5, 25);
    findingScore -= Math.min((inputs.secretScanningAlertCount ?? 0) * 20, 60);
    findingScore = Math.max(findingScore, 0);

    const securityScore = Math.round(securityPosture * 0.6 + findingScore * 0.4);

    const total = Math.round(
        docScore * (profile.weights.documentation / 100) +
        testScore * (profile.weights.testing / 100) +
        bestPracticesScore * (profile.weights.bestPractices / 100) +
        communityScore * (profile.weights.community / 100) +
        activityScore * (profile.weights.activity / 100) +
        securityScore * (profile.weights.security / 100)
    );

    return {
        total,
        documentation: Math.round(docScore),
        testing: Math.round(testScore),
        bestPractices: Math.round(bestPracticesScore),
        community: Math.round(communityScore),
        activity: Math.round(activityScore),
        security: securityScore,
        securityPosture: Math.round(securityPosture),
        healthProfile: profile.id,
    };
}

export function getHealthGrade(score: number): { grade: string; color: string } {
    if (score >= 90) return { grade: 'A', color: 'text-green-400' };
    if (score >= 80) return { grade: 'B', color: 'text-blue-400' };
    if (score >= 70) return { grade: 'C', color: 'text-yellow-400' };
    if (score >= 60) return { grade: 'D', color: 'text-orange-400' };
    return { grade: 'F', color: 'text-red-400' };
}
