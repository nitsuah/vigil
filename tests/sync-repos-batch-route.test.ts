import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncSession } from '@/lib/sync-progress';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    getSyncSession: vi.fn(),
    advanceSyncSession: vi.fn(),
    failSyncSession: vi.fn(),
    syncRepo: vi.fn(),
    syncRepoMetadata: vi.fn(),
    grantRepoAccess: vi.fn(),
    getRepo: vi.fn(),
    getRateLimit: vi.fn(),
    transaction: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: () => m.auth() }));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/db', () => ({
    ensureSchema: vi.fn(async () => undefined),
    getNeonClient: () => Object.assign(vi.fn(async () => []), { transaction: m.transaction }),
}));
vi.mock('@/lib/sync', () => ({ syncRepo: m.syncRepo, syncRepoMetadata: m.syncRepoMetadata }));
vi.mock('@/lib/repo-access', () => ({ grantRepoAccess: m.grantRepoAccess }));
vi.mock('@/lib/github', () => ({
    GitHubClient: class {
        getRepo = m.getRepo;
        getRateLimit = m.getRateLimit;
    },
}));
vi.mock('@/lib/sync-progress', async () => {
    const actual = await vi.importActual<typeof import('@/lib/sync-progress')>('@/lib/sync-progress');
    return {
        ...actual,
        getSyncSession: m.getSyncSession,
        advanceSyncSession: m.advanceSyncSession,
        failSyncSession: m.failSyncSession,
    };
});

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/sync-repos/batch/route';

const item = (n: string, isDefault = false) => ({ owner: 'o', name: n, fullName: `o/${n}`, isDefault });
const session = (over: Partial<SyncSession> = {}): SyncSession => ({
    sessionId: 's1', githubUserId: '42', totalRepos: 4, completedRepos: 0, currentRepo: '', phase: 'metadata',
    failedRepos: 0, startedAt: new Date('2026-11-24T10:00:00Z'), updatedAt: new Date(),
    queue: [item('a'), item('b'), item('c'), item('d')], cursor: 0, ...over,
});
// Every request names the batch it means; by default that is wherever the current session is.
let at = { cursor: 0, phase: 'metadata' };
const setSession = (s: SyncSession) => {
    at = { cursor: s.cursor, phase: s.phase };
    m.getSyncSession.mockResolvedValue(s);
};
const call = (body: unknown) =>
    POST(new NextRequest('http://localhost/api/sync-repos/batch', {
        method: 'POST',
        body: typeof body === 'string' ? body : JSON.stringify(typeof body === 'object' && body !== null ? { ...at, ...body } : body),
    }));

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
    m.auth.mockResolvedValue({ user: { name: 'x' }, userId: '42', accessToken: 'tok' });
    setSession(session());
    m.advanceSyncSession.mockResolvedValue(true);
    m.getRateLimit.mockResolvedValue({ limit: 5000, remaining: 4000, reset: Math.floor(Date.now() / 1000) + 600 });
    m.getRepo.mockImplementation(async (owner: string, name: string) => ({ name, fullName: `${owner}/${name}` }));
    m.syncRepo.mockResolvedValue({ partialSteps: 0 });
    m.syncRepoMetadata.mockResolvedValue(undefined);
    m.grantRepoAccess.mockResolvedValue(undefined);
    m.failSyncSession.mockResolvedValue(true);
    m.transaction.mockResolvedValue([]);
});

describe('POST /api/sync-repos/batch', () => {
    it('rejects bad bodies and unauthenticated callers without touching the run', async () => {
        expect((await call('not json')).status).toBe(400);
        expect((await call({})).status).toBe(400);
        // A request that doesn't name its batch is refused: it could skip or redo the wrong one.
        const noPos = await POST(new NextRequest('http://localhost/api/sync-repos/batch', { method: 'POST', body: JSON.stringify({ sessionId: 's1', skip: true }) }));
        expect(noPos.status).toBe(400);
        expect(m.advanceSyncSession).not.toHaveBeenCalled();
        m.auth.mockResolvedValue(null);
        expect((await call({ sessionId: 's1' })).status).toBe(401);
        m.auth.mockResolvedValue({ user: {}, userId: '42' }); // no GitHub token
        expect((await call({ sessionId: 's1' })).status).toBe(401);
        expect(m.getSyncSession).not.toHaveBeenCalled();
    });

    it('reports an unknown or foreign run as 404', async () => {
        m.getSyncSession.mockResolvedValue(undefined);
        expect((await call({ sessionId: 'nope' })).status).toBe(404);
        expect(m.getSyncSession).toHaveBeenCalledWith('nope', '42');
    });

    it('answers 409 for a legacy row stuck in metadata with no queue', async () => {
        setSession(session({ queue: null }));
        const res = await call({ sessionId: 's1' });
        expect(res.status).toBe(409);
        expect((await res.json()).restartable).toBe(true);
        expect(m.syncRepoMetadata).not.toHaveBeenCalled();
    });

    it('returns a finished run as-is and does no work', async () => {
        setSession(session({ phase: 'complete', completedRepos: 4 }));
        const body = await (await call({ sessionId: 's1' })).json();
        expect(body).toMatchObject({ phase: 'complete', done: true });
        expect(m.getRepo).not.toHaveBeenCalled();
    });

    it('runs a metadata batch of three, awaited, and advances the cursor', async () => {
        const res = await call({ sessionId: 's1' });
        const body = await res.json();
        expect(m.syncRepoMetadata).toHaveBeenCalledTimes(3);
        expect(m.grantRepoAccess).toHaveBeenCalledTimes(3);
        expect(m.syncRepo).not.toHaveBeenCalled();
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({
            from: { phase: 'metadata', cursor: 0 },
            to: { phase: 'metadata', cursor: 3, completedRepos: 0 },
            failedDelta: 0,
        }));
        expect(body).toMatchObject({ phase: 'metadata', cursor: 3, done: false, failedRepos: 0 });
    });

    it('moves to the health pass after the last metadata batch', async () => {
        setSession(session({ cursor: 3 }));
        const body = await (await call({ sessionId: 's1' })).json();
        expect(m.syncRepoMetadata).toHaveBeenCalledTimes(1);
        expect(body).toMatchObject({ phase: 'health', cursor: 0, completedRepos: 0 });
    });

    it('health batches take one repo and count it as completed', async () => {
        setSession(session({ phase: 'health', cursor: 1, completedRepos: 1 }));
        const body = await (await call({ sessionId: 's1' })).json();
        expect(m.syncRepo).toHaveBeenCalledTimes(1);
        expect(m.syncRepoMetadata).not.toHaveBeenCalled();
        expect(body).toMatchObject({ phase: 'health', cursor: 2, completedRepos: 2, progressPercentage: 50 });
    });

    it('completes after the last health check and stamps last_sync_at from the run start', async () => {
        setSession(session({ phase: 'health', cursor: 3, completedRepos: 3 }));
        const body = await (await call({ sessionId: 's1' })).json();
        expect(body).toMatchObject({ phase: 'complete', done: true, currentRepo: 'Complete', progressPercentage: 100 });
        expect(m.transaction).toHaveBeenCalledTimes(1);
    });

    it('a metadata failure still advances but is not counted: the health pass retries that repo', async () => {
        m.syncRepoMetadata.mockRejectedValueOnce(new Error('boom'));
        const body = await (await call({ sessionId: 's1' })).json();
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({ failedDelta: 0 }));
        expect(body).toMatchObject({ cursor: 3, failedRepos: 0 });
        expect(m.syncRepoMetadata).toHaveBeenCalledTimes(3);
    });

    it('the health pass re-grants access so a skipped metadata batch cannot leave a private repo inaccessible', async () => {
        setSession(session({ phase: 'health', cursor: 1, completedRepos: 1 }));
        await call({ sessionId: 's1' });
        expect(m.grantRepoAccess).toHaveBeenCalledTimes(1);
        m.grantRepoAccess.mockRejectedValueOnce(new Error('db'));
        await call({ sessionId: 's1' });
        expect(m.advanceSyncSession).toHaveBeenLastCalledWith(expect.objectContaining({ failedDelta: 1 }));
    });

    it('a health pass that only partly refreshed a repo is counted once, not reported clean', async () => {
        setSession(session({ phase: 'health', cursor: 3, completedRepos: 3 }));
        m.syncRepo.mockResolvedValueOnce({ partialSteps: 1 });
        const body = await (await call({ sessionId: 's1' })).json();
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({ failedDelta: 1 }));
        expect(body).toMatchObject({ phase: 'complete', failedRepos: 1 });
    });

    it('a health-pass failure is counted once and the run advances past it', async () => {
        setSession(session({ phase: 'health', cursor: 1, completedRepos: 1 }));
        m.syncRepo.mockRejectedValueOnce(new Error('boom'));
        const body = await (await call({ sessionId: 's1' })).json();
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({ failedDelta: 1 }));
        expect(body).toMatchObject({ cursor: 2, failedRepos: 1 });
    });

    it('skip advances without any GitHub or database work and counts a health batch as failed', async () => {
        setSession(session({ phase: 'health', cursor: 2, completedRepos: 2 }));
        const body = await (await call({ sessionId: 's1', skip: true })).json();
        expect(m.getRepo).not.toHaveBeenCalled();
        expect(m.syncRepo).not.toHaveBeenCalled();
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({ failedDelta: 1 }));
        expect(body.failedRepos).toBe(1);
    });

    it('skipping a metadata batch is not counted: those repos are retried in the health pass', async () => {
        await call({ sessionId: 's1', skip: true });
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({ failedDelta: 0, to: expect.objectContaining({ cursor: 3 }) }));
    });

    it('does nothing when the client names a batch the run has already moved past', async () => {
        const body = await (await call({ sessionId: 's1', skip: true, cursor: 0, phase: 'health' })).json();
        expect(body).toMatchObject({ stale: true, phase: 'metadata', cursor: 0 });
        const body2 = await (await call({ sessionId: 's1', skip: true, cursor: 6, phase: 'metadata' })).json();
        expect(body2.stale).toBe(true);
        expect(m.advanceSyncSession).not.toHaveBeenCalled();
        expect(m.getRepo).not.toHaveBeenCalled();
    });

    it('stops the run with a reset time when the quota is low, before doing work', async () => {
        m.getRateLimit.mockResolvedValue({ limit: 5000, remaining: 10, reset: Math.floor(Date.now() / 1000) + 1380 });
        const body = await (await call({ sessionId: 's1' })).json();
        expect(body.phase).toBe('error');
        expect(body.currentRepo).toMatch(/rate limit reached after 0 of 4 repos · resets in 23 min/);
        expect(m.failSyncSession).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', githubUserId: '42', from: { phase: 'metadata', cursor: 0 } }));
        expect(m.syncRepoMetadata).not.toHaveBeenCalled();
    });

    it('stops the run when the quota runs out mid-batch', async () => {
        const exhausted = Object.assign(new Error('rate limited'), {
            status: 403,
            response: { status: 403, headers: { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) } },
        });
        m.syncRepoMetadata.mockRejectedValueOnce(exhausted);
        const body = await (await call({ sessionId: 's1' })).json();
        expect(body.phase).toBe('error');
        expect(m.advanceSyncSession).not.toHaveBeenCalled();
    });

    it('does not count a default repo the user token cannot read as a failure', async () => {
        setSession(session({ phase: 'health', queue: [item('a'), item('pub', true)], totalRepos: 2, cursor: 1 }));
        m.getRepo.mockImplementation(async (_o: string, name: string) => {
            if (name === 'pub') throw new Error('Not Found');
            return { name, fullName: `o/${name}` };
        });
        await call({ sessionId: 's1' });
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({ failedDelta: 0 }));
    });

    it('does count a default repo whose fetch worked but whose write failed', async () => {
        setSession(session({ phase: 'health', queue: [item('a'), item('pub', true)], totalRepos: 2, cursor: 1 }));
        m.syncRepo.mockRejectedValueOnce(new Error('db down'));
        await call({ sessionId: 's1' });
        expect(m.advanceSyncSession).toHaveBeenCalledWith(expect.objectContaining({ failedDelta: 1 }));
    });

    it('grants access only for the user\'s own repos, not default ones', async () => {
        setSession(session({ queue: [item('a'), item('pub', true)], totalRepos: 2, cursor: 0 }));
        await call({ sessionId: 's1' });
        expect(m.grantRepoAccess).toHaveBeenCalledTimes(1);
    });

    it('a stale quota stop cannot overwrite a run another request finished', async () => {
        m.getRateLimit.mockResolvedValue({ limit: 5000, remaining: 1, reset: Math.floor(Date.now() / 1000) + 600 });
        m.failSyncSession.mockResolvedValue(false);
        m.getSyncSession.mockResolvedValueOnce(session({ phase: 'health', cursor: 3 })).mockResolvedValueOnce(session({ phase: 'complete', cursor: 4, completedRepos: 4 }));
        const body = await (await call({ sessionId: 's1', cursor: 3, phase: 'health' })).json();
        expect(body).toMatchObject({ phase: 'complete', done: true, stale: true });
    });

    it('answers 404 when the run was superseded while the request was in flight', async () => {
        m.advanceSyncSession.mockResolvedValue(false);
        m.getSyncSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(undefined);
        expect((await call({ sessionId: 's1' })).status).toBe(404);
    });

    it('stamps last_sync_at before completing, and a failing stamp leaves the run retryable', async () => {
        setSession(session({ phase: 'health', cursor: 3, completedRepos: 3 }));
        m.transaction.mockRejectedValueOnce(new Error('db'));
        expect((await call({ sessionId: 's1' })).status).toBe(500);
        expect(m.advanceSyncSession).not.toHaveBeenCalled();
    });

    it('reports where the run is when a second driver advanced it first', async () => {
        m.advanceSyncSession.mockResolvedValue(false);
        m.getSyncSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session({ cursor: 3 }));
        const body = await (await call({ sessionId: 's1' })).json();
        expect(body).toMatchObject({ stale: true, cursor: 3 });
        expect(m.transaction).not.toHaveBeenCalled();
    });

    it('returns 500 with a generic message when the run state cannot be read', async () => {
        m.getSyncSession.mockRejectedValue(new Error('connection string leaked'));
        const res = await call({ sessionId: 's1' });
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain('leaked');
    });
});
