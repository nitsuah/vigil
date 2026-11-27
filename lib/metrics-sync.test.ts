import { describe, it, expect, vi } from 'vitest';
import {
    mapGithubItem,
    parseClosedIssues,
    createGithubFetchItems,
    MAX_PAGES_PER_CALL,
    SUBREQUEST_BUDGET,
    syncMetricsBatch,
    syncRepoMetrics,
    weeksToRecompute,
    type GhItemPayload,
    type MetricsDb,
} from './metrics-sync';

const request = vi.fn();
vi.mock('@/lib/githubClient', () => ({ createOctokitClient: () => ({ request: (...a: unknown[]) => request(...a) }) }));
vi.mock('@/lib/log', () => ({ default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

const item = (over: Partial<GhItemPayload> = {}): GhItemPayload => ({
    number: 1,
    title: 'T',
    state: 'open',
    labels: [],
    user: { login: 'alice', type: 'User' },
    created_at: '2026-11-17T10:00:00Z',
    updated_at: '2026-11-17T10:00:00Z',
    ...over,
});

describe('mapGithubItem', () => {
    it('maps an open issue', () => {
        const m = mapGithubItem(item({ labels: [{ name: 'bug' }, 'ops'], body: 'split from #9' }));
        expect(m).toMatchObject({ kind: 'issue', row: { number: 1, state: 'open', labels: ['bug', 'ops'], parentNumber: 9, authorType: 'human', closedAt: null } });
    });

    it('keeps state_reason so not_planned closures stay out of progress', () => {
        const m = mapGithubItem(item({ state: 'closed', state_reason: 'not_planned', closed_at: '2026-11-18T00:00:00Z' }));
        expect(m).toMatchObject({ kind: 'issue', row: { state: 'closed', stateReason: 'not_planned' } });
    });

    it('treats an item with pull_request as a PR and reads merged state', () => {
        const merged = mapGithubItem(item({ state: 'closed', closed_at: '2026-11-18T00:00:00Z', pull_request: { merged_at: '2026-11-18T00:00:00Z' }, body: 'Fixes #4 and closes nitsuah/vigil#5' }));
        expect(merged).toMatchObject({ kind: 'pr', row: { state: 'merged', mergedAt: '2026-11-18T00:00:00Z', closesIssues: [4, 5] } });
        expect(mapGithubItem(item({ state: 'closed', pull_request: { merged_at: null } }))).toMatchObject({ kind: 'pr', row: { state: 'closed' } });
        expect(mapGithubItem(item({ pull_request: {} }))).toMatchObject({ kind: 'pr', row: { state: 'open' } });
    });

    it('classifies imp, bot and human authors', () => {
        expect(mapGithubItem(item({ labels: ['imp'] }))?.row.authorType).toBe('imp');
        expect(mapGithubItem(item({ user: { login: 'dependabot[bot]', type: 'Bot' } }))?.row.authorType).toBe('bot');
        expect(mapGithubItem(item({ user: null }))?.row).toMatchObject({ authorLogin: 'ghost', authorType: 'human' });
    });

    it('drops payloads missing required fields', () => {
        expect(mapGithubItem({ number: 1 } as GhItemPayload)).toBeNull();
    });
});

describe('parseClosedIssues', () => {
    it('finds closing keywords, dedupes and sorts', () => {
        expect(parseClosedIssues('closes #7, Resolved: #3, fixes #7')).toEqual([3, 7]);
        expect(parseClosedIssues('see #2')).toEqual([]);
        expect(parseClosedIssues(null)).toEqual([]);
    });
});

describe('range and ordering guards', () => {
    it('drops references that do not fit a Postgres INTEGER', () => {
        expect(parseClosedIssues('Fixes #2147483648, closes #2147483647')).toEqual([2147483647]);
        expect(mapGithubItem(item({ body: 'parent: #2147483648' }))).toMatchObject({ row: { parentNumber: null } });
        expect(mapGithubItem(item({ body: 'parent: #12' }))).toMatchObject({ row: { parentNumber: 12 } });
    });

    it('only lets a newer item or cursor overwrite a stored one', async () => {
        const { db, calls } = fakeDb('2026-11-23T06:00:00.000Z');
        await syncRepoMetrics(db, { id: 'r1', full_name: 'o/r' }, async () => page([item(), item({ number: 2, pull_request: {} })]), new Date('2026-11-24T06:00:00Z'));
        const upserts = calls.filter((c) => c.includes('ON CONFLICT'));
        expect(upserts.some((c) => c.includes('gh_issues.updated_at < EXCLUDED.updated_at'))).toBe(true);
        expect(upserts.some((c) => c.includes('gh_prs.updated_at < EXCLUDED.updated_at'))).toBe(true);
        expect(upserts.some((c) => c.includes('metrics_sync_state.last_synced_at < EXCLUDED.last_synced_at'))).toBe(true);
    });

    it('rebuilds the old week of a closed parent when a child link to it is added or removed', async () => {
        const parent = { number: 9, state: 'closed', state_reason: 'completed', labels: [], author_type: 'human', parent_number: null, opened_at: new Date('2026-10-05T00:00:00Z'), closed_at: new Date('2026-10-08T00:00:00Z') };
        for (const [oldParents, body] of [[[], 'parent: #9'], [[9], 'no link now']] as const) {
            const { db, calls } = fakeDb('2026-11-23T06:00:00.000Z', [...oldParents], [parent]);
            const res = await syncRepoMetrics(db, { id: 'r1', full_name: 'o/r' }, async () => page([item({ number: 30, body })]), new Date('2026-11-24T06:00:00Z'));
            expect(res.weeks).toBeGreaterThanOrEqual(8); // 2026-W41 through W48
            expect(calls.some((c) => c.includes('INSERT INTO weekly_rollups'))).toBe(true);
        }
    });
});

describe('weeksToRecompute', () => {
    const mapped = (o: Partial<GhItemPayload>) => [mapGithubItem(item(o))!];
    it('runs from the earliest touched week through the current week', () => {
        const weeks = weeksToRecompute(mapped({ created_at: '2026-11-03T00:00:00Z' }), new Date('2026-11-24T12:00:00Z'));
        expect(weeks).toEqual(['2026-W45', '2026-W46', '2026-W47', '2026-W48']);
    });
    it('is empty with no changes', () => {
        expect(weeksToRecompute([], new Date())).toEqual([]);
    });
});

/** A fetch result: one request, and nothing left unless `more` says so. */
const page = (items: GhItemPayload[], more = false) => ({ items, requests: 1, more });

/** In-memory stand-in for the SQL function: records statements and serves the stored rows it is given. */
function fakeDb(cursor: string | null, oldParents: number[] = [], stored: Array<Record<string, unknown>> = []) {
    const calls: string[] = [];
    const db: MetricsDb = async (strings) => {
        const sql = strings.join('?');
        calls.push(sql);
        if (sql.includes('FROM metrics_sync_state')) return cursor ? [{ last_synced_at: new Date(cursor) }] : [];
        if (sql.includes('SELECT parent_number FROM gh_issues')) return oldParents.map((n) => ({ parent_number: n }));
        if (sql.includes('FROM gh_issues')) return [...stored, { number: 1, state: 'open', state_reason: null, labels: [], author_type: 'human', parent_number: null, opened_at: new Date('2026-11-17T10:00:00Z'), closed_at: null }];
        if (sql.includes('FROM gh_prs')) return [];
        return [];
    };
    return { db, calls };
}

describe('syncRepoMetrics', () => {
    const now = new Date('2026-11-24T06:00:00Z');
    const repo = { id: 'r1', full_name: 'nitsuah/vigil' };

    it('fetches since the stored cursor, upserts, rebuilds rollups and advances the cursor', async () => {
        const { db, calls } = fakeDb('2026-11-23T06:00:00.000Z');
        const fetchItems = vi.fn().mockResolvedValue(page([item(), item({ number: 2, pull_request: {} })]));
        const res = await syncRepoMetrics(db, repo, fetchItems, now);
        expect(fetchItems).toHaveBeenCalledWith('nitsuah/vigil', '2026-11-23T06:00:00.000Z', MAX_PAGES_PER_CALL);
        expect(res).toMatchObject({ issues: 1, prs: 1 });
        const kinds = calls.map((c) => /INSERT INTO (\w+)/.exec(c)?.[1]).filter(Boolean);
        expect(kinds).toEqual(['gh_issues', 'gh_prs', 'weekly_rollups', 'metrics_sync_state']);
        expect(calls.filter((c) => c.includes('ON CONFLICT')).length).toBe(4);
    });

    it('does a full fetch with no cursor and writes nothing when GitHub has no changes', async () => {
        const { db, calls } = fakeDb(null);
        const fetchItems = vi.fn().mockResolvedValue(page([]));
        const res = await syncRepoMetrics(db, repo, fetchItems, now);
        expect(fetchItems).toHaveBeenCalledWith('nitsuah/vigil', null, MAX_PAGES_PER_CALL);
        expect(res).toMatchObject({ issues: 0, prs: 0, weeks: 0 });
        expect(calls.filter((c) => c.startsWith('\n        INSERT INTO gh_') || c.includes('INSERT INTO weekly'))).toEqual([]);
    });

    it('leaves the cursor alone when a fetch fails', async () => {
        const { db, calls } = fakeDb('2026-11-23T06:00:00.000Z');
        await expect(syncRepoMetrics(db, repo, vi.fn().mockRejectedValue(new Error('boom')), now)).rejects.toThrow('boom');
        expect(calls.some((c) => c.includes('INSERT INTO metrics_sync_state'))).toBe(false);
    });

    it('a second identical run issues the same statements (upserts are keyed, rollups rebuilt)', async () => {
        const run = async () => {
            const { db, calls } = fakeDb('2026-11-23T06:00:00.000Z');
            await syncRepoMetrics(db, repo, async () => page([item()]), now);
            return calls;
        };
        expect(await run()).toEqual(await run());
    });
});

describe('syncRepoMetrics partial backfill', () => {
    const now = new Date('2026-11-24T06:00:00Z');
    const repo = { id: 'r1', full_name: 'o/r' };
    const cursorWritten = async (since: string | null, items: GhItemPayload[]) => {
        const { db } = fakeDb(since);
        let written: unknown;
        const spy: MetricsDb = (strings, ...values) => {
            if (strings.join('?').includes('INSERT INTO metrics_sync_state')) written = values[1];
            return db(strings, ...values);
        };
        const res = await syncRepoMetrics(spy, repo, async () => page(items, true), now, 1);
        expect(res.more).toBe(true);
        return written;
    };

    it('stores the newest update read, so the next call resumes there', async () => {
        const items = [item({ updated_at: '2026-11-18T00:00:00Z' }), item({ number: 2, updated_at: '2026-11-19T00:00:00Z' })];
        expect(await cursorWritten(null, items)).toBe('2026-11-19T00:00:00.000Z');
    });

    it('advances past an unmappable page using the newest raw update timestamp', async () => {
        const since = '2026-11-16T00:00:00.000Z';
        const { db } = fakeDb(since);
        let written: unknown;
        const spy: MetricsDb = (strings, ...values) => {
            if (strings.join('?').includes('INSERT INTO metrics_sync_state')) written = values[1];
            return db(strings, ...values);
        };
        const invalid = item({ created_at: '' });
        const res = await syncRepoMetrics(spy, repo, async () => page([invalid], true), now, 1);

        expect(res.more).toBe(true);
        expect(written).toBe('2026-11-17T10:00:00.000Z');
    });

    it('never moves the cursor past the time the fetch started', async () => {
        expect(await cursorWritten(null, [item({ updated_at: '2026-11-24T06:00:05Z' })])).toBe(now.toISOString());
    });

    it('fails rather than re-reading the same pages for ever', async () => {
        const since = '2026-11-18T00:00:00.000Z';
        const { db, calls } = fakeDb(since);
        const fetchItems = async () => page([item({ updated_at: since })], true);
        await expect(syncRepoMetrics(db, repo, fetchItems, now, 1)).rejects.toThrow('Backfill cannot advance');
        expect(calls.some((c) => c.includes('INSERT INTO'))).toBe(false);
    });
});

describe('createGithubFetchItems', () => {
    const full = (n: number) => Array.from({ length: 100 }, (_, i) => item({ number: n * 100 + i + 1 }));

    it('stops at the page allowance and reports that more remains', async () => {
        request.mockReset().mockImplementation(async (_route, p: { page: number }) => ({ data: full(p.page), headers: {} }));
        const res = await createGithubFetchItems('t')('o/capped', null, 2);
        expect(res).toMatchObject({ requests: 2, more: true });
        expect(res.items).toHaveLength(200);
    });

    it('reports a complete listing on a short page', async () => {
        request.mockReset().mockResolvedValue({ data: [item()], headers: {} });
        expect(await createGithubFetchItems('t')('o/short', null, 5)).toMatchObject({ requests: 1, more: false });
    });
});

describe('syncMetricsBatch', () => {
    const now = new Date('2026-11-24T00:00:00Z');
    const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const repoRow = (n: number, over: Record<string, unknown> = {}) =>
        ({ id: uuid(n), full_name: `o/repo-${n}`, private_repo: false, visibility_verified: true, ...over });

    /** Serves `repos` after the cursor and counts every query, as Workers counts subrequests. */
    function world(repos: Array<ReturnType<typeof repoRow>>) {
        const count = { queries: 0 };
        const sqls: string[] = [];
        const db: MetricsDb = async (strings, ...values) => {
            count.queries++;
            const sql = strings.join('?');
            sqls.push(sql);
            if (sql.includes('FROM repos')) return repos.filter((r) => values[0] === null || r.id > (values[0] as string));
            return [];
        };
        return { db, count, sqls };
    }

    async function drive(repos: Array<ReturnType<typeof repoRow>>, fetchItems: Parameters<typeof syncMetricsBatch>[1]) {
        const w = world(repos);
        const batches = [];
        const spent: number[] = [];
        let after: string | null = null;
        for (let i = 0; i < 100; i++) {
            let requests = 0;
            const before = w.count.queries;
            const batch = await syncMetricsBatch(w.db, async (...args) => {
                const res = await fetchItems(...args);
                requests += res.requests;
                return res;
            }, after, now);
            batches.push(batch);
            // The route's schema check is one more subrequest than the queries seen here.
            spent.push(1 + w.count.queries - before + requests);
            after = batch.next;
            if (batch.done) break;
        }
        return { batches, spent, sqls: w.sqls };
    }

    it('covers every repo over several calls, each within the budget', async () => {
        const repos = Array.from({ length: 40 }, (_, i) => repoRow(i + 1));
        const { batches, spent, sqls } = await drive(repos, async () => page([]));
        expect(sqls[0]).toContain('is_archived IS NOT TRUE');
        expect(batches.length).toBeGreaterThan(1);
        expect(batches[batches.length - 1]).toMatchObject({ done: true, remaining: 0 });
        expect(batches.flatMap((b) => b.synced.map((s) => s.fullName))).toEqual(repos.map((r) => r.full_name));
        expect(Math.max(...spent)).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
    });

    it('stays within the budget when every repo has changes and a full page allowance', async () => {
        const repos = Array.from({ length: 12 }, (_, i) => repoRow(i + 1));
        const { batches, spent } = await drive(repos, async (_name, _since, maxPages) => ({
            items: [item({ body: 'parent: #1' })], requests: maxPages, more: false,
        }));
        expect(batches[batches.length - 1].done).toBe(true);
        expect(batches.flatMap((b) => b.synced)).toHaveLength(12);
        expect(Math.max(...spent)).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
    });

    it('stays on a repo until its backfill is complete', async () => {
        let left = 2;
        const { batches } = await drive([repoRow(1), repoRow(2)], async (name) => {
            if (name === 'o/repo-1' && left > 0) {
                left--;
                return page([item({ updated_at: `2026-11-${20 - left}T00:00:00Z` })], true);
            }
            return page([]);
        });
        expect(batches.map((b) => [b.synced.map((s) => s.fullName), b.next, b.remaining])).toEqual([
            [['o/repo-1'], null, 2],
            [['o/repo-1'], null, 2],
            [['o/repo-1', 'o/repo-2'], uuid(2), 0],
        ]);
    });

    it('charges the pages read before a listing failed, so failures cannot overrun the budget', async () => {
        const repos = Array.from({ length: 12 }, (_, i) => repoRow(i + 1));
        const w = world(repos);
        let attempts = 0;
        const batch = await syncMetricsBatch(w.db, async () => {
            attempts++;
            // Four full pages read, then the fifth fails (it and its three retries are real subrequests too).
            throw Object.assign(new Error('bad gateway'), { status: 502, requestsBefore: 4 });
        }, null, now);
        // Real spend: the route's schema check, every query, and 4 pages + 4 attempts per failed listing.
        expect(1 + w.count.queries + attempts * 8).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
        expect(batch.done).toBe(false);
    });

    it('isolates failures, and never names a private or unverified repo or quotes the message', async () => {
        const repos = [
            repoRow(1),
            repoRow(2, { full_name: 'o/secret', private_repo: true }),
            repoRow(3, { full_name: 'o/unverified', visibility_verified: false }),
            repoRow(4),
        ];
        const { batches } = await drive(repos, async (name) => {
            if (name === 'o/repo-4') return page([]);
            throw Object.assign(new Error(`no access to ${name}`), { status: 403 });
        });
        const failed = batches.flatMap((b) => b.failed);
        expect(failed).toEqual([
            { repo: 'o/repo-1', error: 'GitHub HTTP 403' },
            { repo: `private repo ${uuid(2)}`, error: 'GitHub HTTP 403' },
            { repo: `private repo ${uuid(3)}`, error: 'GitHub HTTP 403' },
        ]);
        expect(batches.flatMap((b) => b.synced.map((s) => s.fullName))).toEqual(['o/repo-4']);
    });

    it('defers a repo that hits the subrequest limit, and reports it only if it led its batch', async () => {
        const { batches } = await drive([repoRow(1), repoRow(2)], async (name) => {
            if (name === 'o/repo-2') throw new Error('Too many subrequests by single Worker invocation.');
            return page([]);
        });
        expect(batches[0]).toMatchObject({ next: uuid(1), done: false, failed: [] });
        expect(batches[1]).toMatchObject({ done: true, failed: [{ repo: 'o/repo-2', error: 'Too many subrequests' }] });
    });

    it('does not sync temporary advisory forks', async () => {
        const fork = repoRow(2, { full_name: 'o/repo-ghsa-2345-6789-cfgh', private_repo: true });
        const fetchItems = vi.fn().mockResolvedValue(page([]));
        const { batches } = await drive([repoRow(1), fork], fetchItems);
        expect(fetchItems.mock.calls.map((c) => c[0])).toEqual(['o/repo-1']);
        expect(batches).toHaveLength(1);
        expect(batches[0]).toMatchObject({ done: true, remaining: 0, failed: [] });
    });
});
