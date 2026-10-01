import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const hasRepoGrant = vi.fn();
const updates: unknown[][] = [];
let candidates: Array<{ id: string }> = [{ id: 'r1' }];
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));
vi.mock('@/lib/repo-access', () => ({ hasRepoGrant: (...a: unknown[]) => hasRepoGrant(...a) }));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/db', () => ({
    ensureSchema: vi.fn(),
    getNeonClient: () => (strings: TemplateStringsArray, ...values: unknown[]) => {
        const q = strings.join('?');
        if (q.includes('FROM repos')) return Promise.resolve(candidates);
        if (q.includes('UPDATE repos')) { updates.push(values); return Promise.resolve([]); }
        return Promise.resolve([]);
    },
}));

import { PATCH } from '@/app/api/repos/[name]/update-tier/route';

const call = (body: unknown) =>
    PATCH(
        new Request('http://localhost/api/repos/agent-board/update-tier', {
            method: 'PATCH',
            body: JSON.stringify(body),
        }) as never,
        { params: Promise.resolve({ name: 'agent-board' }) },
    );

describe('PATCH update-tier', () => {
    beforeEach(() => {
        mockAuth.mockReset();
        hasRepoGrant.mockReset();
        updates.length = 0;
        candidates = [{ id: 'r1' }];
    });

    it('401s without a session', async () => {
        mockAuth.mockResolvedValue(null);
        expect((await call({ tier: 'T1' })).status).toBe(401);
    });

    it('stores a valid tier for a granted repo', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' }, userId: '42' });
        hasRepoGrant.mockResolvedValue(true);
        const res = await call({ tier: 'T2' });
        expect(res.status).toBe(200);
        expect(hasRepoGrant).toHaveBeenCalledWith(expect.anything(), 'r1', '42');
        expect(updates).toEqual([['T2', 'r1']]);
        expect((await res.json()).tier).toBe('T2');
    });

    it('clears the tier with null', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' }, userId: '42' });
        hasRepoGrant.mockResolvedValue(true);
        expect((await call({ tier: null })).status).toBe(200);
        expect(updates).toEqual([[null, 'r1']]);
    });

    it('rejects an unknown tier with 400', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' }, userId: '42' });
        expect((await call({ tier: 'T9' })).status).toBe(400);
        expect((await call({})).status).toBe(400);
    });

    it('404s without a grant', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' }, userId: '42' });
        hasRepoGrant.mockResolvedValue(false);
        expect((await call({ tier: 'T1' })).status).toBe(404);
        expect(updates).toEqual([]);
    });

    it('409s when the short name matches several writable repos', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' }, userId: '42' });
        hasRepoGrant.mockResolvedValue(true);
        candidates = [{ id: 'r1' }, { id: 'r2' }];
        expect((await call({ tier: 'T1' })).status).toBe(409);
    });
});
