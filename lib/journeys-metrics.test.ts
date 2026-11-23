import { describe, expect, it } from 'vitest';
import { parseMetricsJsonl, summarizeJourneys, fetchJourneysHealth } from './journeys-metrics';
import type { Octokit } from '@octokit/rest';

const NOW = new Date('2026-11-23T12:00:00Z');
const line = (o: object) => JSON.stringify(o);

describe('parseMetricsJsonl', () => {
    it('skips blank and corrupt lines and clamps bad numbers', () => {
        const runs = parseMetricsJsonl([
            line({ date: '2026-11-21', total: 6, passed: 5, failed: 1, flaky: 2, coverage: { covered: 3, total: 4 }, run: 'https://github.com/a/b/actions/runs/1' }),
            'not json', '', '42',
            line({ date: '2026-11-22', total: -1, passed: 'x', failed: 0, run: 'javascript:alert(1)', coverage: null }),
        ].join('\n'));
        expect(runs).toHaveLength(2);
        expect(runs[0].coverage).toEqual({ covered: 3, total: 4 });
        expect(runs[1]).toMatchObject({ total: 0, passed: 0, run: null, coverage: null });
    });
});

describe('summarizeJourneys', () => {
    const counts = { journey: 2, review: 1 };
    it('is none without runs', () => {
        expect(summarizeJourneys([], counts, NOW)).toMatchObject({ status: 'none', openJourneyIssues: 2, openReviewIssues: 1 });
    });
    it('is red when the last run had failures, even if old', () => {
        const runs = parseMetricsJsonl(line({ date: '2026-10-01', total: 3, passed: 2, failed: 1 }));
        expect(summarizeJourneys(runs, counts, NOW).status).toBe('red');
    });
    it('is green for a recent clean run and stale for an old one', () => {
        expect(summarizeJourneys(parseMetricsJsonl(line({ date: '2026-11-23', total: 3, passed: 3, failed: 0, flaky: 1 })), counts, NOW))
            .toMatchObject({ status: 'green', flaky: 1 });
        expect(summarizeJourneys(parseMetricsJsonl(line({ date: '2026-11-10', total: 3, passed: 3, failed: 0 })), counts, NOW).status).toBe('stale');
    });
    it('uses the last run only', () => {
        const runs = parseMetricsJsonl([line({ date: '2026-11-21', total: 3, passed: 2, failed: 1 }), line({ date: '2026-11-22', total: 3, passed: 3, failed: 0 })].join('\n'));
        expect(summarizeJourneys(runs, counts, NOW).status).toBe('green');
    });
});

function fakeOctokit(files: Record<string, string>, issues: Record<string, number>, failIssues = false): Octokit {
    return {
        repos: {
            getContent: async ({ path }: { path: string }) => {
                if (!(path in files)) throw Object.assign(new Error('nf'), { status: 404 });
                return { data: { type: 'file', content: Buffer.from(files[path]).toString('base64') } };
            },
        },
        issues: {
            listForRepo: async ({ labels }: { labels: string }) => {
                if (failIssues) throw Object.assign(new Error('boom'), { status: 500 });
                return { data: [...Array(issues[labels] ?? 0)].map(() => ({})).concat([{ pull_request: {} }]) };
            },
        },
    } as unknown as Octokit;
}

describe('fetchJourneysHealth', () => {
    it('reads this and last month, ignoring PRs in issue counts', async () => {
        const o = fakeOctokit(
            { 'metrics/2026-10.jsonl': line({ date: '2026-10-30', total: 2, passed: 2, failed: 0 }) },
            { 'bot:journey': 3, 'bot:review': 0 },
        );
        const h = await fetchJourneysHealth(o, 'a', 'b', NOW);
        expect(h).toMatchObject({ status: 'stale', openJourneyIssues: 3, openReviewIssues: 0 });
    });
    it('is none when no metrics exist and propagates GitHub errors', async () => {
        expect((await fetchJourneysHealth(fakeOctokit({}, {}), 'a', 'b', NOW)).status).toBe('none');
        await expect(fetchJourneysHealth(fakeOctokit({}, {}, true), 'a', 'b', NOW)).rejects.toThrow('boom');
    });
});
