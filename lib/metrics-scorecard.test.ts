import { describe, it, expect } from 'vitest';
import { buildScorecard, emptyRollup, recentWeeks, sumWeekly } from './metrics-scorecard';
import type { WeeklyRollup } from './metrics-rollup';

const NOW = new Date('2026-11-24T12:00:00Z'); // 2026-W48
const row = (isoWeek: string, over: Partial<WeeklyRollup> = {}): WeeklyRollup => ({ ...emptyRollup(isoWeek), ...over });
const metric = (sc: ReturnType<typeof buildScorecard>, key: string) => sc.metrics.find((m) => m.key === key)!;

describe('recentWeeks', () => {
    it('ends with the current ISO week and crosses year boundaries', () => {
        expect(recentWeeks(NOW, 3)).toEqual(['2026-W46', '2026-W47', '2026-W48']);
        expect(recentWeeks(new Date('2027-01-06T00:00:00Z'), 3)).toEqual(['2026-W52', '2026-W53', '2027-W01']);
    });
});

describe('buildScorecard', () => {
    const weekly = [
        row('2026-W44', { issuesClosed: 4, issuesOpened: 2 }),
        row('2026-W45', { issuesClosed: 4, issuesOpened: 2 }),
        row('2026-W46', { issuesClosed: 4, issuesOpened: 2 }),
        row('2026-W47', { issuesClosed: 4, issuesOpened: 2 }),
        row('2026-W48', { issuesClosed: 8, issuesOpened: 3 }),
    ];

    it('compares this week with the mean of the previous 4', () => {
        const sc = buildScorecard(weekly, NOW);
        expect(sc.week).toBe('2026-W48');
        expect(metric(sc, 'issuesClosed')).toMatchObject({ current: 8, previousAvg: 4, delta: 4, direction: 'good' });
        expect(metric(sc, 'issuesOpened')).toMatchObject({ current: 3, previousAvg: 2, delta: 1, direction: 'neutral' });
        expect(metric(sc, 'netBurn')).toMatchObject({ current: 5, previousAvg: 2, delta: 3, direction: 'good' });
    });

    it('is flat when current equals the average', () => {
        const flat = ['2026-W44', '2026-W45', '2026-W46', '2026-W47', '2026-W48'].map((w) => row(w, { prsMerged: 3 }));
        expect(metric(buildScorecard(flat, NOW), 'prsMerged')).toMatchObject({ delta: 0, direction: 'neutral' });
    });

    it('treats missing weeks as no activity for counts', () => {
        const sc = buildScorecard([row('2026-W48', { prsMerged: 4 }), row('2026-W47', { prsMerged: 8 })], NOW);
        expect(metric(sc, 'prsMerged')).toMatchObject({ current: 4, previousAvg: 2, delta: 2 });
    });

    it('leaves lead time null with no merges and judges lower as better', () => {
        expect(metric(buildScorecard([], NOW), 'leadTimeP50Hours')).toMatchObject({ current: null, previousAvg: null, delta: null });
        const sc = buildScorecard([row('2026-W47', { leadTimeP50Hours: 10 }), row('2026-W48', { leadTimeP50Hours: 4 })], NOW);
        expect(metric(sc, 'leadTimeP50Hours')).toMatchObject({ current: 4, previousAvg: 10, delta: -6, direction: 'good' });
    });

    it('marks net burn red below zero and flags bug inflow above the fix rate', () => {
        const sc = buildScorecard([row('2026-W48', { issuesOpened: 5, issuesClosed: 1, bugsOpened: 3, bugsClosed: 1 })], NOW);
        expect(metric(sc, 'netBurn').direction).toBe('bad');
        expect(metric(sc, 'bugsOpened').direction).toBe('bad');
        expect(sc.bugInflowExceedsFix).toBe(true);
        expect(buildScorecard([row('2026-W48', { bugsOpened: 1, bugsClosed: 1 })], NOW).bugInflowExceedsFix).toBe(false);
    });

    it('returns a zeroed scorecard for no data', () => {
        const sc = buildScorecard([], NOW);
        expect(metric(sc, 'issuesClosed')).toMatchObject({ current: 0, previousAvg: 0, delta: 0, direction: 'neutral' });
    });
});

describe('sumWeekly', () => {
    const weeks = ['2026-W46', '2026-W47', '2026-W48'];
    it('sums repos, zero-fills quiet weeks and weights lead time by merged PRs', () => {
        const a = [row('2026-W48', { prsMerged: 3, leadTimeP50Hours: 2, leadTimeP90Hours: 4, issuesClosed: 1 })];
        const b = [row('2026-W48', { prsMerged: 1, leadTimeP50Hours: 10, leadTimeP90Hours: 20, issuesClosed: 2 })];
        const out = sumWeekly([a, b], weeks);
        expect(out.map((r) => r.isoWeek)).toEqual(weeks);
        expect(out[0].issuesClosed).toBe(0);
        expect(out[2]).toMatchObject({ issuesClosed: 3, prsMerged: 4, leadTimeP50Hours: 4, leadTimeP90Hours: 8 });
    });
    it('carries scope forward through weeks without a row, seeded from before the window', () => {
        const out = sumWeekly([[row('2026-W47', { scopeEnd: 9 })]], weeks, [5]);
        expect(out.map((r) => r.scopeEnd)).toEqual([5, 9, 9]);
    });
});
