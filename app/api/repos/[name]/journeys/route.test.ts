import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown, rows: [] as unknown[], access: vi.fn(), health: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => h.session }));
vi.mock('@/lib/db', () => ({
    // Tagged-template call: (strings, name, limit, offset) -> one page of rows.
    getNeonClient: () => async (_s: unknown, _name: string, limit: number, offset: number) => h.rows.slice(offset, offset + limit),
    ensureSchema: async () => undefined,
}));
vi.mock('@/lib/repo-access', () => ({ canAccessRepo: (...a: unknown[]) => h.access(...a), hasRepoGrant: vi.fn(), isDefaultRepo: vi.fn() }));
vi.mock('@/lib/githubClient', () => ({ createOctokitClient: () => ({}) }));
vi.mock('@/lib/journeys-metrics', () => ({ fetchJourneysHealth: (...a: unknown[]) => h.health(...a) }));

import { GET } from './route';

const call = () => GET({} as never, { params: Promise.resolve({ name: 'app' }) });

describe('GET /api/repos/[name]/journeys', () => {
    beforeEach(() => {
        h.session = { user: {}, userId: 'u1', accessToken: 't' };
        h.rows = [{ id: '1', full_name: 'a-owner/app' }, { id: '2', full_name: 'z-owner/app' }];
        h.health.mockReset().mockResolvedValue({ status: 'green' });
        h.access.mockReset();
    });

    it('reads the repo the caller can see, not the first with that name', async () => {
        h.access.mockImplementation(async (_db: unknown, row: { id: string }) => row.id === '2');
        const res = await call();
        expect(res.status).toBe(200);
        expect(h.health.mock.calls[0].slice(1, 3)).toEqual(['z-owner', 'app']);
    });

    it('keeps looking past the first page of inaccessible matches', async () => {
        h.rows = Array.from({ length: 26 }, (_, i) => ({ id: String(i), full_name: `o${String(i).padStart(2, '0')}/app` }));
        h.access.mockImplementation(async (_db: unknown, row: { id: string }) => row.id === '25');
        expect((await call()).status).toBe(200);
        expect(h.health.mock.calls[0][1]).toBe('o25');
    });

    it('404s when no same-named repo is visible, without calling GitHub', async () => {
        h.access.mockResolvedValue(false);
        expect((await call()).status).toBe(404);
        expect(h.health).not.toHaveBeenCalled();
    });

    it('401s without a session', async () => {
        h.session = null;
        expect((await call()).status).toBe(401);
    });
});
