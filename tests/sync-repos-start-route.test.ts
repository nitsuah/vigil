import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_REPOS } from '@/lib/default-repos';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    createSyncProgress: vi.fn(),
    listRepos: vi.fn(),
    getRateLimit: vi.fn(),
    getAuthenticated: vi.fn(),
    syncRepo: vi.fn(),
    syncRepoMetadata: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: () => m.auth() }));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/db', () => ({
    ensureSchema: vi.fn(async () => undefined),
    getNeonClient: () => Object.assign(vi.fn(async () => []), { transaction: vi.fn(async () => [[], [{ id: 'u' }]]) }),
}));
vi.mock('@/lib/githubClient', () => ({
    createOctokitClient: () => ({ rest: { users: { getAuthenticated: m.getAuthenticated } } }),
}));
vi.mock('@/lib/github', () => ({
    GitHubClient: class {
        listRepos = m.listRepos;
        getRateLimit = m.getRateLimit;
    },
}));
vi.mock('@/lib/sync', () => ({ syncRepo: m.syncRepo, syncRepoMetadata: m.syncRepoMetadata }));
vi.mock('@/lib/sync-progress', () => ({ createSyncProgress: m.createSyncProgress }));

import { POST } from '@/app/api/sync-repos/route';

const repo = (name: string) => ({
    name, fullName: `me/${name}`, description: null, language: 'TypeScript', topics: [], archived: false, isFork: false,
});
const call = (body: unknown = {}) =>
    POST(new Request('http://localhost/api/sync-repos', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ user: { name: 'me' }, accessToken: 'tok' });
    m.getAuthenticated.mockResolvedValue({ data: { login: 'me', id: 42 } });
    m.listRepos.mockResolvedValue([repo('a'), repo('b')]);
    m.getRateLimit.mockResolvedValue({ limit: 5000, remaining: 4000, reset: 0 });
    m.createSyncProgress.mockResolvedValue(undefined);
});

describe('POST /api/sync-repos (queue only)', () => {
    it('queues the repos and returns without running any sync work', async () => {
        const res = await call();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.sessionId).toMatch(/^sync-42-\d+$/);
        expect(body.phase).toBe('metadata');

        const [sessionId, userId, total, queue] = m.createSyncProgress.mock.calls[0];
        expect(sessionId).toBe(body.sessionId);
        expect(userId).toBe('42');
        expect(total).toBe(queue.length);
        expect(body.totalRepos).toBe(queue.length);
        expect(queue.slice(0, 2)).toEqual([
            { owner: 'me', name: 'a', fullName: 'me/a', isDefault: false },
            { owner: 'me', name: 'b', fullName: 'me/b', isDefault: false },
        ]);
        // The default repos the user doesn't own are queued behind theirs, flagged.
        expect(queue.slice(2).every((q: { isDefault: boolean }) => q.isDefault)).toBe(true);
        expect(queue).toHaveLength(2 + DEFAULT_REPOS.length);
        // Nothing may run after the response on Workers, so nothing runs at all here.
        expect(m.syncRepo).not.toHaveBeenCalled();
        expect(m.syncRepoMetadata).not.toHaveBeenCalled();
    });

    it('queues a default repo the user owns once, with their list', async () => {
        const [first] = DEFAULT_REPOS;
        m.listRepos.mockResolvedValue([{ ...repo(first.name), fullName: first.fullName }]);
        await call();
        const queue = m.createSyncProgress.mock.calls[0][3] as Array<{ fullName: string; isDefault: boolean }>;
        expect(queue.filter((q) => q.fullName.toLowerCase() === first.fullName.toLowerCase())).toHaveLength(1);
        expect(queue[0].isDefault).toBe(false);
    });

    it('applies the dashboard filters to the queue', async () => {
        m.listRepos.mockResolvedValue([repo('a'), { ...repo('f'), isFork: true }]);
        await call({ filterFork: 'no-forks' });
        const queue = m.createSyncProgress.mock.calls[0][3] as Array<{ name: string; isDefault: boolean }>;
        expect(queue.filter((q) => !q.isDefault).map((q) => q.name)).toEqual(['a']);
    });

    it('rejects an unauthenticated caller and a missing token before listing anything', async () => {
        m.auth.mockResolvedValue(null);
        expect((await call()).status).toBe(401);
        m.auth.mockResolvedValue({ user: { name: 'me' } });
        expect((await call()).status).toBe(401);
        expect(m.listRepos).not.toHaveBeenCalled();
        expect(m.createSyncProgress).not.toHaveBeenCalled();
    });

    it('rejects bad filters and bodies', async () => {
        expect((await call({ filterType: 'nonsense' })).status).toBe(400);
        const bad = await POST(new Request('http://localhost/api/sync-repos', { method: 'POST', body: 'x' }));
        expect(bad.status).toBe(400);
    });

    it('does not queue anything when the GitHub quota is low', async () => {
        m.getRateLimit.mockResolvedValue({ limit: 5000, remaining: 5, reset: 0 });
        expect((await call()).status).toBe(429);
        expect(m.createSyncProgress).not.toHaveBeenCalled();
    });
});
