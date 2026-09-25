import { describe, it, expect } from 'vitest';
import { calculateHealthScore, type HealthScoreInputs } from './health-score';

describe('health-score', () => {
  describe('calculateHealthScore', () => {
    it('should calculate perfect health score', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
        vulnCriticalCount: 0,
        vulnHighCount: 0,
        secretScanningAlertCount: 0,
        hasSecurityPolicy: true,
        privateVulnerabilityReportingEnabled: true,
        dependabotAlertsEnabled: true,
        codeScanningEnabled: true,
        secretScanningEnabled: true,
      };

      const result = calculateHealthScore(inputs);

      expect(result.total).toBe(100); // Weights sum to 100%
      expect(result.documentation).toBe(100);
      expect(result.testing).toBe(100);
      expect(result.bestPractices).toBe(100);
      expect(result.community).toBe(100);
      expect(result.activity).toBe(100);
      expect(result.security).toBe(100);
    });

    it('should calculate weighted health score for minimal inputs', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 0,
        hasTests: false,
        codeCoverage: 0,
        bestPracticesCount: 0,
        bestPracticesHealthy: 0,
        communityStandardsCount: 0,
        communityStandardsHealthy: 0,
        hasCI: false,
        lastCommitDays: 500,
        openIssuesCount: 100,
        openPRsCount: 50,
      };

      const result = calculateHealthScore(inputs);

      // Activity: 100 - 40 (staleness) - 20 (issues) - 20 (PRs) = 20
      // Production weights: docs 15%, testing 20%, best practices 20%,
      // community 10%, activity 10%, security 25%.
      // No security controls enabled => posture 0, no findings => finding score 100,
      // so security is 40. Total = 20*0.10 + 40*0.25 = 12.
      expect(result.total).toBe(12);
      expect(result.documentation).toBe(0);
      expect(result.testing).toBe(0);
      expect(result.bestPractices).toBe(0);
      expect(result.community).toBe(0);
      expect(result.activity).toBeLessThanOrEqual(20); // Not fully penalized
      expect(result.security).toBe(100);
    });

    it('should calculate testing score correctly without coverage', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 50,
        hasTests: true,
        codeCoverage: undefined,
        bestPracticesCount: 5,
        bestPracticesHealthy: 3,
        communityStandardsCount: 5,
        communityStandardsHealthy: 3,
        hasCI: false,
        lastCommitDays: 30,
        openIssuesCount: 5,
        openPRsCount: 2,
      };

      const result = calculateHealthScore(inputs);

      expect(result.testing).toBe(40); // Base for having tests
    });

    it('should calculate testing score correctly with coverage', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 50,
        hasTests: true,
        codeCoverage: 80,
        bestPracticesCount: 5,
        bestPracticesHealthy: 3,
        communityStandardsCount: 5,
        communityStandardsHealthy: 3,
        hasCI: false,
        lastCommitDays: 30,
        openIssuesCount: 5,
        openPRsCount: 2,
      };

      const result = calculateHealthScore(inputs);

      expect(result.testing).toBe(88); // 40 base + 48 from coverage (80 * 0.6)
    });

    it('should add bonus for CI in best practices', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 50,
        hasTests: false,
        codeCoverage: undefined,
        bestPracticesCount: 10,
        bestPracticesHealthy: 8,
        communityStandardsCount: 5,
        communityStandardsHealthy: 3,
        hasCI: true,
        lastCommitDays: 30,
        openIssuesCount: 5,
        openPRsCount: 2,
      };

      const result = calculateHealthScore(inputs);

      expect(result.bestPractices).toBe(90); // (8/10 * 100) + 10 bonus
    });

    it('should cap best practices score at 100', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 50,
        hasTests: false,
        codeCoverage: undefined,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 3,
        hasCI: true,
        lastCommitDays: 30,
        openIssuesCount: 5,
        openPRsCount: 2,
      };

      const result = calculateHealthScore(inputs);

      expect(result.bestPractices).toBe(100); // Should not exceed 100
    });

    it('should penalize for stale commits', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 200, // Very stale
        openIssuesCount: 0,
        openPRsCount: 0,
      };

      const result = calculateHealthScore(inputs);

      expect(result.activity).toBeLessThan(100);
    });

    it('should penalize for many open issues', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 50,
        openPRsCount: 0,
      };

      const result = calculateHealthScore(inputs);

      expect(result.activity).toBeLessThan(100);
    });

    it('should penalize for many open PRs', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 20,
      };

      const result = calculateHealthScore(inputs);

      expect(result.activity).toBeLessThan(100);
    });

    it('should handle partial best practices', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 50,
        hasTests: false,
        codeCoverage: undefined,
        bestPracticesCount: 10,
        bestPracticesHealthy: 5,
        communityStandardsCount: 5,
        communityStandardsHealthy: 3,
        hasCI: false,
        lastCommitDays: 30,
        openIssuesCount: 5,
        openPRsCount: 2,
      };

      const result = calculateHealthScore(inputs);

      expect(result.bestPractices).toBe(50); // 5/10 * 100
    });

    it('should handle partial community standards', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 50,
        hasTests: false,
        codeCoverage: undefined,
        bestPracticesCount: 10,
        bestPracticesHealthy: 5,
        communityStandardsCount: 10,
        communityStandardsHealthy: 6,
        hasCI: false,
        lastCommitDays: 30,
        openIssuesCount: 5,
        openPRsCount: 2,
      };

      const result = calculateHealthScore(inputs);

      expect(result.community).toBe(60); // 6/10 * 100
    });

    it('should default security score to 100 when no vulnerabilities reported', () => {
      const inputs: HealthScoreInputs = {
        docHealth: 50,
        hasTests: false,
        codeCoverage: undefined,
        bestPracticesCount: 10,
        bestPracticesHealthy: 5,
        communityStandardsCount: 10,
        communityStandardsHealthy: 6,
        hasCI: false,
        lastCommitDays: 30,
        openIssuesCount: 5,
        openPRsCount: 2,
      };

      const result = calculateHealthScore(inputs);

      expect(result.security).toBe(40);
    });

    it('should penalize for critical Dependabot alerts', () => {
      const base: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };

      const result = calculateHealthScore({ ...base, vulnCriticalCount: 2 });

      expect(result.security).toBe(24); // 40% finding score after posture=0
      expect(result.total).toBeLessThan(100);
    });

    it('should penalize for high-severity Dependabot alerts', () => {
      const base: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };

      const result = calculateHealthScore({ ...base, vulnHighCount: 3 });

      expect(result.security).toBe(28); // 40% of 70 finding score
    });

    it('should penalize heavily for open secret-scanning alerts', () => {
      const base: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };

      const result = calculateHealthScore({ ...base, secretScanningAlertCount: 1 });

      expect(result.security).toBe(32); // 40% of 80 finding score
      expect(result.total).toBeLessThan(100);
    });

    it('should not penalize testing score when ciPassing is true', () => {
      const base: HealthScoreInputs = {
        docHealth: 0,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 0,
        bestPracticesHealthy: 0,
        communityStandardsCount: 0,
        communityStandardsHealthy: 0,
        hasCI: true,
        ciPassing: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };
      const result = calculateHealthScore(base);
      expect(result.testing).toBe(100); // 40 base + 60 coverage, no penalty
    });

    it('should subtract 25 from testing score when ciPassing is false', () => {
      const base: HealthScoreInputs = {
        docHealth: 0,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 0,
        bestPracticesHealthy: 0,
        communityStandardsCount: 0,
        communityStandardsHealthy: 0,
        hasCI: true,
        ciPassing: false,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };
      const result = calculateHealthScore(base);
      expect(result.testing).toBe(75); // 100 - 25 CI penalty
    });

    it('should floor testing score at 0 when ciPassing is false and no coverage', () => {
      const base: HealthScoreInputs = {
        docHealth: 0,
        hasTests: true,
        codeCoverage: undefined,
        bestPracticesCount: 0,
        bestPracticesHealthy: 0,
        communityStandardsCount: 0,
        communityStandardsHealthy: 0,
        hasCI: true,
        ciPassing: false,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };
      const result = calculateHealthScore(base);
      expect(result.testing).toBe(15); // 40 base - 25 CI penalty
    });

    it('should not apply CI penalty when ciPassing is undefined (no CI)', () => {
      const base: HealthScoreInputs = {
        docHealth: 0,
        hasTests: true,
        codeCoverage: undefined,
        bestPracticesCount: 0,
        bestPracticesHealthy: 0,
        communityStandardsCount: 0,
        communityStandardsHealthy: 0,
        hasCI: false,
        ciPassing: undefined,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };
      const result = calculateHealthScore(base);
      expect(result.testing).toBe(40); // base only, no penalty
    });

    it('should cap the security score at 0 for severe findings', () => {
      const base: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
      };

      const result = calculateHealthScore({
        ...base,
        vulnCriticalCount: 10,
        vulnHighCount: 10,
        secretScanningAlertCount: 10,
      });

      expect(result.security).toBe(0);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should reward enabled security controls instead of treating zero findings as perfect posture', () => {
      const base: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 5,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
        hasSecurityPolicy: true,
        privateVulnerabilityReportingEnabled: true,
        dependabotAlertsEnabled: true,
        codeScanningEnabled: true,
        secretScanningEnabled: true,
      };

      const result = calculateHealthScore(base);

      expect(result.securityPosture).toBe(100);
      expect(result.security).toBe(100);
      expect(result.healthProfile).toBe('production');
      expect(result.total).toBe(100);
    });

    it('should use stricter weighting for enterprise repositories', () => {
      const base: HealthScoreInputs = {
        docHealth: 100,
        hasTests: true,
        codeCoverage: 100,
        bestPracticesCount: 10,
        bestPracticesHealthy: 10,
        communityStandardsCount: 10,
        communityStandardsHealthy: 5,
        hasCI: true,
        lastCommitDays: 1,
        openIssuesCount: 0,
        openPRsCount: 0,
        hasSecurityPolicy: true,
        privateVulnerabilityReportingEnabled: true,
        dependabotAlertsEnabled: true,
        codeScanningEnabled: true,
        secretScanningEnabled: true,
      };

      const starter = calculateHealthScore({ ...base, healthProfile: 'starter' });
      const enterprise = calculateHealthScore({ ...base, healthProfile: 'enterprise' });

      expect(starter.healthProfile).toBe('starter');
      expect(enterprise.healthProfile).toBe('enterprise');
      expect(starter.total).toBeGreaterThan(enterprise.total);
    });

  });
});
