import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    session: null as unknown,
    candidates: [] as Array<{ id: string; name: string; full_name: string }>,
    accessible: new Set<string>(),
    health: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: async () => h.session }));
vi.mock('@/lib/db', () => ({ getNeonClient: () => async () => h.candidates, ensureSchema: async () => undefined }));
vi.mock('@/lib/repo-access', () => ({ getAccessibleRepoIds: async () => h.accessible }));
vi.mock('@/lib/githubClient', () => ({ createOctokitClient: () => ({}) }));
vi.mock('@/lib/journeys-metrics', () => ({ fetchJourneysHealth: (...a: unknown[]) => h.health(...a) }));

import { GET } from './route';

const repos = (n: number) => Array.from({ length: n }, (_, i) => {
    const id = String(i + 1).padStart(2, '0');
    return { id, name: `r${id}`, full_name: `o/r${id}` };
});

describe('GET /api/pmo/journeys', () => {
    beforeEach(() => {
        h.session = { user: {}, userId: 'u1', accessToken: 't' };
        h.candidates = repos(3);
        h.accessible = new Set(['01', '02', '03']);
        h.health.mockReset().mockResolvedValue({ status: 'green' });
    });

    it('401s without a session or token', async () => {
        h.session = null;
        expect((await GET()).status).toBe(401);
        h.session = { user: {}, userId: 'u1' };
        expect((await GET()).status).toBe(401);
    });

    it('only reads repos the caller can access', async () => {
        h.accessible = new Set(['02']);
        const body = await (await GET()).json();
        expect(body.repos.map((r: { name: string }) => r.name)).toEqual(['r02']);
        expect(h.health).toHaveBeenCalledTimes(1);
        expect(body.skipped).toBe(0);
    });

    it('caps the repos read per request and reports the rest as skipped', async () => {
        h.candidates = repos(13);
        h.accessible = new Set(h.candidates.map((r) => r.id));
        const body = await (await GET()).json();
        expect(body.repos).toHaveLength(10);
        expect(body.skipped).toBe(3);
        expect(h.health).toHaveBeenCalledTimes(10);
    });

    it('turns a failed GitHub read into health: null for that repo only', async () => {
        h.health.mockImplementation(async (_o: unknown, _owner: string, repo: string) => {
            if (repo === 'r02') throw new Error('boom');
            return { status: 'red' };
        });
        const body = await (await GET()).json();
        expect(body.repos.map((r: { health: unknown }) => r.health)).toEqual([{ status: 'red' }, null, { status: 'red' }]);
    });
});
