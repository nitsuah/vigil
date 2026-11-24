import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn(), getSyncSession: vi.fn(), deleteSyncProgress: vi.fn() }));
vi.mock('@/auth', () => ({ auth: () => m.auth() }));
vi.mock('@/lib/sync-progress', async () => {
    const actual = await vi.importActual<typeof import('@/lib/sync-progress')>('@/lib/sync-progress');
    return { ...actual, getSyncSession: m.getSyncSession, deleteSyncProgress: m.deleteSyncProgress };
});

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/sync-progress/route';

const get = (id = 's1') => GET(new NextRequest(`http://localhost/api/sync-progress?sessionId=${id}`));

beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ user: { name: 'x' }, userId: '42' });
});

describe('GET /api/sync-progress', () => {
    it('returns the cursor a resumed driver needs, never the stored queue', async () => {
        m.getSyncSession.mockResolvedValue({
            sessionId: 's1', githubUserId: '42', totalRepos: 4, completedRepos: 1, currentRepo: 'o/a', phase: 'health',
            failedRepos: 0, startedAt: new Date(), updatedAt: new Date(),
            queue: [{ owner: 'o', name: 'secret-private', fullName: 'o/secret-private', isDefault: false }], cursor: 1,
        });
        const res = await get();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body).toMatchObject({ phase: 'health', cursor: 1, progressPercentage: 25 });
        expect(JSON.stringify(body)).not.toContain('secret-private');
        expect(body).not.toHaveProperty('queue');
        expect(m.getSyncSession).toHaveBeenCalledWith('s1', '42');
    });

    it('401 unauthenticated, 404 for an unknown or foreign run, 400 without an id', async () => {
        m.auth.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
        m.auth.mockResolvedValue({ user: {}, userId: '42' });
        m.getSyncSession.mockResolvedValue(undefined);
        expect((await get()).status).toBe(404);
        expect((await GET(new NextRequest('http://localhost/api/sync-progress'))).status).toBe(400);
    });
});
