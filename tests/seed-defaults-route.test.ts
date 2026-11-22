import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const syncRepo = vi.fn();
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/db', () => ({ getNeonClient: () => vi.fn() }));
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
    });

    it('401s without a session and does not sync', async () => {
        mockAuth.mockResolvedValue(null);
        const res = await POST();
        expect(res.status).toBe(401);
        expect(syncRepo).not.toHaveBeenCalled();
    });

    it('syncs for a signed-in user and omits error text', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' } });
        syncRepo.mockRejectedValue(new Error('secret upstream detail'));
        const res = await POST();
        expect(res.status).toBe(200);
        expect(JSON.stringify(await res.json())).not.toContain('secret upstream detail');
    });
});
