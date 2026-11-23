import { describe, expect, it, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rows: [] as Array<{ id: string; full_name: string }>, access: vi.fn(), fail: false }));
vi.mock('@/lib/db', () => ({
    getNeonClient: () => async (_s: unknown, _name: string, limit: number, offset: number) => {
        if (h.fail) throw new Error('db down');
        return h.rows.slice(offset, offset + limit);
    },
    ensureSchema: async () => undefined,
}));
vi.mock('@/lib/repo-access', () => ({ canAccessRepo: (...a: unknown[]) => h.access(...a), hasRepoGrant: vi.fn() }));

import { resolveReadableRepo } from './repo-access-guard';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), full_name: `o${i}/app` }));

describe('resolveReadableRepo', () => {
    beforeEach(() => {
        h.rows = rows(2);
        h.fail = false;
        h.access.mockReset();
    });

    it('returns the first visible same-named repo', async () => {
        h.access.mockImplementation(async (_d: unknown, r: { id: string }) => r.id === '1');
        expect(await resolveReadableRepo('app', { userId: 'u', accessToken: 't' })).toEqual({ fullName: 'o1/app' });
    });

    it('passes an anonymous caller through as undefined user and token', async () => {
        h.access.mockResolvedValue(false);
        const r = await resolveReadableRepo('app', null);
        expect(r.response?.status).toBe(404);
        expect(h.access.mock.calls[0].slice(2)).toEqual([undefined, undefined]);
    });

    it('stops paging once a row matches', async () => {
        h.rows = rows(60);
        h.access.mockImplementation(async (_d: unknown, r: { id: string }) => r.id === '3');
        await resolveReadableRepo('app', { userId: 'u' });
        expect(h.access).toHaveBeenCalledTimes(4);
    });

    it('404s after exhausting every page', async () => {
        h.rows = rows(60);
        h.access.mockResolvedValue(false);
        expect((await resolveReadableRepo('app', { userId: 'u' })).response?.status).toBe(404);
        expect(h.access).toHaveBeenCalledTimes(60);
    });

    it('propagates a database error rather than reporting "not found"', async () => {
        h.fail = true;
        await expect(resolveReadableRepo('app', { userId: 'u' })).rejects.toThrow('db down');
    });

    it('propagates an access-check failure (e.g. token expiry) to the caller', async () => {
        h.access.mockRejectedValue(new Error('github 401'));
        await expect(resolveReadableRepo('app', { userId: 'u', accessToken: 'x' })).rejects.toThrow('github 401');
    });
});
