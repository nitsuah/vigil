import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const syncRepo = vi.fn();
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
let dbFactory: () => unknown = () => vi.fn();
vi.mock('@/lib/db', () => ({ getNeonClient: () => dbFactory() }));
vi.mock('@/lib/sync', () => ({ syncRepo: (...a: unknown[]) => syncRepo(...a) }));
vi.mock('@/lib/github', () => ({
    GitHubClient: class {
        getRepo = vi.fn().mockResolvedValue({});
    },
}));

import { POST } from '@/app/api/seed-defaults/route';

describe('POST /api/seed-defaults', () => {
    beforeEach(() => {
        mockAuth.mockReset();
        syncRepo.mockReset();
        dbFactory = () => vi.fn();
    });

    it('401s without a session and does not sync', async () => {
        mockAuth.mockResolvedValue(null);
        const res = await POST();
        expect(res.status).toBe(401);
        expect(syncRepo).not.toHaveBeenCalled();
    });

    it('401s a session with no stable identity instead of sharing a bucket', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' } });
        const res = await POST();
        expect(res.status).toBe(401);
        expect(syncRepo).not.toHaveBeenCalled();
    });

    it('syncs for a signed-in user and omits error text', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: 'user-ok' });
        syncRepo.mockRejectedValue(new Error('secret upstream detail'));
        const res = await POST();
        expect(res.status).toBe(200);
        expect(JSON.stringify(await res.json())).not.toContain('secret upstream detail');
    });

    it('returns a generic 500 when setup fails unexpectedly', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: 'user-500' });
        dbFactory = () => {
            throw new Error('secret upstream detail');
        };
        const res = await POST();
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to seed default repos' });
        expect(syncRepo).not.toHaveBeenCalled();
    });

    it('throttles a second run by the same user and does not sync again', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: 'user-throttle' });
        expect((await POST()).status).toBe(200);
        syncRepo.mockClear();
        const res = await POST();
        expect(res.status).toBe(429);
        expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
        expect(syncRepo).not.toHaveBeenCalled();
    });

    it('throttles per user, not globally', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'a' }, userId: 'user-a' });
        expect((await POST()).status).toBe(200);
        mockAuth.mockResolvedValue({ user: { name: 'b' }, userId: 'user-b' });
        expect((await POST()).status).toBe(200);
    });
});
