import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { GET } from '@/app/api/metrics/overview/route';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getNeonClient: vi.fn(), ensureSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/repo-access', () => ({ getAccessibleRepoIds: vi.fn() }));

import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { getAccessibleRepoIds } from '@/lib/repo-access';
import { isoWeekOf } from '@/lib/metrics-rollup';

const mockAuth = auth as unknown as Mock;
const thisWeek = isoWeekOf(new Date());

const repos = [
    { id: 'r1', name: 'vigil', full_name: 'nitsuah/vigil' },
    { id: 'r2', name: 'secret', full_name: 'nitsuah/secret' },
];
const rollupRow = (repo_id: string, over: Record<string, unknown> = {}) => ({
    repo_id, iso_week: thisWeek, issues_opened: 2, issues_closed: 5, leaf_closed: 5, scope_end: 7, prs_opened: 3, prs_merged: 4,
    bugs_opened: 1, bugs_closed: 2, imp_prs_opened: 1, imp_prs_merged: 1, lead_time_p50_hours: '3.5', lead_time_p90_hours: '9', ...over,
});

function makeDb(rollups: unknown[] = [rollupRow('r1')]) {
    const seen: string[] = [];
    const db = Object.assign(
        async (strings: TemplateStringsArray) => {
            const sql = strings.join('?');
            seen.push(sql);
            if (sql.includes('FROM repos')) return repos;
            if (sql.includes('FROM weekly_rollups') && sql.includes('DISTINCT ON')) return [];
            if (sql.includes('FROM weekly_rollups')) return rollups;
            return [];
        },
        { transaction: (qs: Promise<unknown>[]) => Promise.all(qs) },
    );
    return { db, seen };
}

const req = (qs = '') => new Request(`http://localhost/api/metrics/overview${qs}`);

describe('GET /api/metrics/overview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({ user: { name: 'a' }, userId: '1' });
        (getAccessibleRepoIds as Mock).mockResolvedValue(new Set(['r1']));
    });

    it('401s without a session', async () => {
        mockAuth.mockResolvedValue(null);
        expect((await GET(req())).status).toBe(401);
    });

    it('returns the scorecard, series and per-repo rows for accessible repos only', async () => {
        (getNeonClient as Mock).mockReturnValue(makeDb().db);
        const res = await GET(req('?weeks=8'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.repos.map((r: { full_name: string }) => r.full_name)).toEqual(['nitsuah/vigil']);
        expect(body.weeks).toHaveLength(8);
        expect(body.series).toHaveLength(8);
        expect(body.scorecard.week).toBe(thisWeek);
        const closed = body.scorecard.metrics.find((m: { key: string }) => m.key === 'issuesClosed');
        expect(closed).toMatchObject({ current: 5, previousAvg: 0, delta: 5, direction: 'good' });
        expect(body.repos[0].current).toMatchObject({ prsMerged: 4, leadTimeP50Hours: 3.5 });
    });

    it('never widens access: a filter naming an inaccessible repo returns nothing for it', async () => {
        (getNeonClient as Mock).mockReturnValue(makeDb().db);
        const body = await (await GET(req('?repos=nitsuah/secret'))).json();
        expect(body.repos).toEqual([]);
        expect(body.scorecard.metrics.find((m: { key: string }) => m.key === 'issuesClosed').current).toBe(0);
    });

    it('rolls up stored rows when a label or author-type filter is set', async () => {
        const { db, seen } = makeDb();
        (getNeonClient as Mock).mockReturnValue(db);
        const res = await GET(req('?label=bug&authorType=imp'));
        expect(res.status).toBe(200);
        expect(seen.some((s) => s.includes('FROM gh_issues'))).toBe(true);
        expect(seen.some((s) => s.includes('FROM weekly_rollups'))).toBe(false);
        expect((await res.json()).filters).toMatchObject({ label: 'bug', authorType: 'imp' });
    });

    it('400s on bad parameters', async () => {
        expect((await GET(req('?weeks=0'))).status).toBe(400);
        expect((await GET(req('?weeks=99'))).status).toBe(400);
        expect((await GET(req('?authorType=robot'))).status).toBe(400);
    });

    it('500s with a generic message when the database fails', async () => {
        (getNeonClient as Mock).mockImplementation(() => { throw new Error('db down'); });
        const res = await GET(req());
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to fetch metrics overview' });
    });
});
