import { describe, it, expect } from 'vitest';
import { buildHealthScoreInputs, type RepoHealthRows } from './health-score-inputs';

const NOW = Date.parse('2026-09-25T00:00:00Z');

const rows: RepoHealthRows = {
    docStatuses: [{ doc_type: 'readme', exists: true }],
    bestPractices: [
        { practice_type: 'testing_framework', status: 'healthy' },
        { practice_type: 'ci_cd', status: 'healthy' },
        { practice_type: 'license', status: 'missing' },
    ],
    communityStandards: [{ status: 'healthy' }, { status: 'missing' }],
    metrics: [{ metric_name: 'Code Coverage', value: '82.5' }],
};

describe('buildHealthScoreInputs', () => {
    it('derives CI and tests from best practices, coverage from metrics', () => {
        const inputs = buildHealthScoreInputs({ ci_status: 'failing' }, rows, NOW);
        expect(inputs.hasTests).toBe(true);
        expect(inputs.hasCI).toBe(true);
        expect(inputs.ciPassing).toBe(false);
        expect(inputs.codeCoverage).toBe(82.5);
        expect(inputs.bestPracticesHealthy).toBe(2);
        expect(inputs.communityStandardsHealthy).toBe(1);
    });

    it('reads coverage from the API shape (name instead of metric_name)', () => {
        const inputs = buildHealthScoreInputs({}, { ...rows, metrics: [{ name: 'coverage', value: 40 }] }, NOW);
        expect(inputs.codeCoverage).toBe(40);
    });

    it('ignores issue-scan counts until sync has recorded stale_issues_count', () => {
        const legacy = buildHealthScoreInputs({ open_issues: 30, open_issues_count: 0, stale_issues_count: null }, rows, NOW);
        expect(legacy.openIssuesCount).toBe(30);
        expect(legacy.openIssuesCountDetailed).toBeUndefined();
        expect(legacy.staleIssuesCount).toBeUndefined();

        const scanned = buildHealthScoreInputs({ open_issues: 30, open_issues_count: 25, stale_issues_count: 9 }, rows, NOW);
        expect(scanned.openIssuesCountDetailed).toBe(25);
        expect(scanned.staleIssuesCount).toBe(9);
    });

    it('drops an unknown profile and defaults missing commit dates to a year', () => {
        const inputs = buildHealthScoreInputs({ health_profile: 'bogus' }, rows, NOW);
        expect(inputs.healthProfile).toBeUndefined();
        expect(inputs.lastCommitDays).toBe(365);
        expect(buildHealthScoreInputs({ health_profile: 'starter', last_commit_date: '2026-09-15T00:00:00Z' }, rows, NOW))
            .toMatchObject({ healthProfile: 'starter', lastCommitDays: 10 });
    });
});
