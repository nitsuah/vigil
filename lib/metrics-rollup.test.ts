import { describe, it, expect } from 'vitest';
import {
    classifyAuthor,
    computeWeeklyRollup,
    isoWeekOf,
    isoWeekRange,
    parseParentNumber,
    type MetricsIssue,
    type MetricsPr,
} from './metrics-rollup';

const issue = (n: number, over: Partial<MetricsIssue> = {}): MetricsIssue => ({
    number: n,
    state: 'open',
    stateReason: null,
    labels: [],
    authorType: 'human',
    parentNumber: null,
    openedAt: '2026-11-10T09:00:00Z',
    closedAt: null,
    ...over,
});

const pr = (n: number, over: Partial<MetricsPr> = {}): MetricsPr => ({
    number: n,
    state: 'merged',
    labels: [],
    authorType: 'human',
    openedAt: '2026-11-17T00:00:00Z',
    mergedAt: '2026-11-17T04:00:00Z',
    closedAt: '2026-11-17T04:00:00Z',
    ...over,
});

describe('classifyAuthor', () => {
    it('labels win in the order imp, then bot, else human', () => {
        expect(classifyAuthor('nitsuah', 'User', ['imp:pr'])).toBe('imp');
        expect(classifyAuthor('nitsuah', 'User', ['imp'])).toBe('imp');
        expect(classifyAuthor('dependabot[bot]', 'Bot', [])).toBe('bot');
        expect(classifyAuthor('someone', 'User', ['bot:journey'])).toBe('bot');
        expect(classifyAuthor('github-actions[bot]', 'User', ['imp:ready'])).toBe('imp');
        expect(classifyAuthor('nitsuah', 'User', ['bug'])).toBe('human');
        expect(classifyAuthor('nitsuah', null, [])).toBe('human');
    });
});

describe('parseParentNumber', () => {
    it('reads the common split and child phrasings', () => {
        expect(parseParentNumber('Split from #12 because it was too broad')).toBe(12);
        expect(parseParentNumber('Child of nitsuah/fire#568 (step 1)')).toBe(568);
        expect(parseParentNumber('child of #7')).toBe(7);
        expect(parseParentNumber('Parent: #9')).toBe(9);
    });
    it('returns null when there is no parent reference', () => {
        expect(parseParentNumber('Fixes #5')).toBeNull();
        expect(parseParentNumber('')).toBeNull();
        expect(parseParentNumber(null)).toBeNull();
    });
});

describe('ISO weeks', () => {
    it('labels dates in UTC, including year boundaries', () => {
        expect(isoWeekOf('2026-11-23T10:00:00Z')).toBe('2026-W48');
        expect(isoWeekOf('2026-11-22T23:59:59Z')).toBe('2026-W47');
        expect(isoWeekOf('2026-01-01T00:00:00Z')).toBe('2026-W01');
        expect(isoWeekOf('2027-01-01T00:00:00Z')).toBe('2026-W53');
        expect(isoWeekOf('2024-12-30T00:00:00Z')).toBe('2025-W01');
    });
    it('round-trips a label to its Monday-to-Monday range', () => {
        const { start, end } = isoWeekRange('2026-W47');
        expect(start.toISOString()).toBe('2026-11-16T00:00:00.000Z');
        expect(end.toISOString()).toBe('2026-11-23T00:00:00.000Z');
        expect(isoWeekOf(start)).toBe('2026-W47');
        expect(() => isoWeekRange('2026-47')).toThrow();
    });
});

describe('computeWeeklyRollup', () => {
    const week = '2026-W47'; // 2026-11-16 .. 2026-11-23

    it('counts opened and closed issues, ignoring not_planned closures', () => {
        const issues = [
            issue(1, { openedAt: '2026-11-17T00:00:00Z' }),
            issue(2, { state: 'closed', stateReason: 'completed', closedAt: '2026-11-18T00:00:00Z' }),
            issue(3, { state: 'closed', stateReason: 'not_planned', closedAt: '2026-11-18T00:00:00Z' }),
            issue(4, { state: 'closed', stateReason: 'completed', closedAt: '2026-11-09T00:00:00Z' }),
        ];
        const r = computeWeeklyRollup(issues, [], week);
        expect(r.issuesOpened).toBe(1);
        expect(r.issuesClosed).toBe(1);
    });

    it('counts a closed parent as closed but not as leaf work, and scope uses leaves only', () => {
        const issues = [
            issue(10, { state: 'closed', stateReason: 'completed', closedAt: '2026-11-18T00:00:00Z' }),
            issue(11, { parentNumber: 10, openedAt: '2026-11-17T00:00:00Z' }),
            issue(12, { parentNumber: 10, openedAt: '2026-11-17T00:00:00Z' }),
            issue(13, { parentNumber: 10, state: 'closed', stateReason: 'completed', openedAt: '2026-11-17T00:00:00Z', closedAt: '2026-11-19T00:00:00Z' }),
        ];
        const r = computeWeeklyRollup(issues, [], week);
        expect(r.issuesClosed).toBe(2);
        expect(r.leafClosed).toBe(1);
        expect(r.scopeEnd).toBe(2);
    });

    it('excludes issues opened after the week and includes ones closed after it in scope', () => {
        const issues = [
            issue(20, { openedAt: '2026-11-24T00:00:00Z' }),
            issue(21, { state: 'closed', stateReason: 'completed', closedAt: '2026-11-25T00:00:00Z' }),
        ];
        expect(computeWeeklyRollup(issues, [], week).scopeEnd).toBe(1);
    });

    it('tracks bug inflow and fixes by the bug label', () => {
        const issues = [
            issue(30, { labels: ['bug'], openedAt: '2026-11-16T00:00:00Z' }),
            issue(31, { labels: ['bug'], state: 'closed', stateReason: 'completed', closedAt: '2026-11-20T00:00:00Z' }),
            issue(32, { labels: ['enhancement'], openedAt: '2026-11-16T00:00:00Z' }),
        ];
        const r = computeWeeklyRollup(issues, [], week);
        expect(r.bugsOpened).toBe(1);
        expect(r.bugsClosed).toBe(1);
    });

    it('counts PRs, imp PRs and lead-time percentiles from merged PRs only', () => {
        const prs = [
            pr(1, { openedAt: '2026-11-17T00:00:00Z', mergedAt: '2026-11-17T02:00:00Z' }),
            pr(2, { authorType: 'imp', openedAt: '2026-11-17T00:00:00Z', mergedAt: '2026-11-17T04:00:00Z' }),
            pr(3, { authorType: 'imp', state: 'open', mergedAt: null, closedAt: null }),
            pr(4, { openedAt: '2026-11-17T00:00:00Z', mergedAt: '2026-11-18T00:00:00Z' }),
        ];
        const r = computeWeeklyRollup([], prs, week);
        expect(r.prsOpened).toBe(4);
        expect(r.prsMerged).toBe(3);
        expect(r.impPrsOpened).toBe(2);
        expect(r.impPrsMerged).toBe(1);
        expect(r.leadTimeP50Hours).toBe(4);
        expect(r.leadTimeP90Hours).toBe(24);
    });

    it('returns zeros and null lead times for an empty week', () => {
        const r = computeWeeklyRollup([], [], week);
        expect(r).toEqual({
            isoWeek: week,
            issuesOpened: 0,
            issuesClosed: 0,
            leafClosed: 0,
            scopeEnd: 0,
            prsOpened: 0,
            prsMerged: 0,
            bugsOpened: 0,
            bugsClosed: 0,
            impPrsOpened: 0,
            impPrsMerged: 0,
            leadTimeP50Hours: null,
            leadTimeP90Hours: null,
        });
    });
});