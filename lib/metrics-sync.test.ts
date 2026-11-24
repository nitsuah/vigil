import { describe, it, expect, vi } from 'vitest';
import {
    mapGithubItem,
    parseClosedIssues,
    syncAllMetrics,
    syncRepoMetrics,
    weeksToRecompute,
    type GhItemPayload,
    type MetricsDb,
} from './metrics-sync';

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
        await syncRepoMetrics(db, { id: 'r1', full_name: 'o/r' }, async () => [item(), item({ number: 2, pull_request: {} })], new Date('2026-11-24T06:00:00Z'));
        const upserts = calls.filter((c) => c.includes('ON CONFLICT'));
        expect(upserts.some((c) => c.includes('gh_issues.updated_at < EXCLUDED.updated_at'))).toBe(true);
        expect(upserts.some((c) => c.includes('gh_prs.updated_at < EXCLUDED.updated_at'))).toBe(true);
        expect(upserts.some((c) => c.includes('metrics_sync_state.last_synced_at < EXCLUDED.last_synced_at'))).toBe(true);
    });

    it('rebuilds the old week of a closed parent when a child link to it is added or removed', async () => {
        const parent = { number: 9, state: 'closed', state_reason: 'completed', labels: [], author_type: 'human', parent_number: null, opened_at: new Date('2026-10-05T00:00:00Z'), closed_at: new Date('2026-10-08T00:00:00Z') };
        for (const [oldParents, body] of [[[], 'parent: #9'], [[9], 'no link now']] as const) {
            const { db, calls } = fakeDb('2026-11-23T06:00:00.000Z', [...oldParents], [parent]);
            const res = await syncRepoMetrics(db, { id: 'r1', full_name: 'o/r' }, async () => [item({ number: 30, body })], new Date('2026-11-24T06:00:00Z'));
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
        const fetchItems = vi.fn().mockResolvedValue([item(), item({ number: 2, pull_request: {} })]);
        const res = await syncRepoMetrics(db, repo, fetchItems, now);
        expect(fetchItems).toHaveBeenCalledWith('nitsuah/vigil', '2026-11-23T06:00:00.000Z');
        expect(res).toMatchObject({ issues: 1, prs: 1 });
        const kinds = calls.map((c) => /INSERT INTO (\w+)/.exec(c)?.[1]).filter(Boolean);
        expect(kinds).toEqual(['gh_issues', 'gh_prs', 'weekly_rollups', 'metrics_sync_state']);
        expect(calls.filter((c) => c.includes('ON CONFLICT')).length).toBe(4);
    });

    it('does a full fetch with no cursor and writes nothing when GitHub has no changes', async () => {
        const { db, calls } = fakeDb(null);
        const fetchItems = vi.fn().mockResolvedValue([]);
        const res = await syncRepoMetrics(db, repo, fetchItems, now);
        expect(fetchItems).toHaveBeenCalledWith('nitsuah/vigil', null);
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
            await syncRepoMetrics(db, repo, async () => [item()], now);
            return calls;
        };
        expect(await run()).toEqual(await run());
    });
});

describe('syncAllMetrics', () => {
    it('skips archived repos at the query and isolates per-repo failures', async () => {
        const seen: string[] = [];
        const db: MetricsDb = async (strings) => {
            const sql = strings.join('?');
            seen.push(sql);
            if (sql.includes('FROM repos')) return [{ id: 'a', full_name: 'o/a' }, { id: 'b', full_name: 'o/b' }];
            return [];
        };
        expect(seen.length).toBe(0);
        const fetchItems = vi.fn().mockImplementation(async (name: string) => {
            if (name === 'o/a') throw new Error('rate limited');
            return [];
        });
        const summary = await syncAllMetrics(db, fetchItems, new Date('2026-11-24T00:00:00Z'));
        expect(seen[0]).toContain('is_archived IS NOT TRUE');
        expect(summary.failed).toEqual([{ fullName: 'o/a', error: 'rate limited' }]);
        expect(summary.synced.map((s) => s.fullName)).toEqual(['o/b']);
    });
});
