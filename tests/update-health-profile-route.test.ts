import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = vi.fn();
const hasRepoGrant = vi.fn();
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));
vi.mock('@/lib/repo-access', () => ({ hasRepoGrant: (...a: unknown[]) => hasRepoGrant(...a) }));
vi.mock('@/lib/log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const REPO = { id: 'r1', name: 'agent-board', full_name: 'nitsuah/agent-board', health_profile: 'enterprise', repo_type: 'tool' };
vi.mock('@/lib/db', () => ({
    ensureSchema: vi.fn(),
    getNeonClient: () => (strings: TemplateStringsArray) => {
        const q = strings.join('?');
        if (q.includes('SELECT * FROM repos')) return Promise.resolve([REPO]);
        if (q.includes('UPDATE repos')) return Promise.resolve([{ ...REPO, health_profile: 'starter' }]);
        return Promise.resolve([]);
    },
}));

import { PATCH } from '@/app/api/repos/[name]/update-health-profile/route';

const call = (profile: string) =>
    PATCH(
        new Request('http://localhost/api/repos/agent-board/update-health-profile', {
            method: 'PATCH',
            body: JSON.stringify({ profile }),
        }) as never,
        { params: Promise.resolve({ name: 'agent-board' }) },
    );

describe('PATCH update-health-profile', () => {
    beforeEach(() => { mockAuth.mockReset(); hasRepoGrant.mockReset(); });

    it('checks the write grant against the GitHub id in session.userId', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' }, userId: '88273576' });
        hasRepoGrant.mockResolvedValue(true);
        const res = await call('starter');
        expect(res.status).toBe(200);
        expect(hasRepoGrant).toHaveBeenCalledWith(expect.anything(), 'r1', '88273576');
        expect((await res.json()).profile).toBe('starter');
    });

    it('404s (not 403) without a grant, e.g. a pre-fix session with no userId', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' } });
        hasRepoGrant.mockResolvedValue(false);
        expect((await call('starter')).status).toBe(404);
    });

    it('rejects an unknown profile with 400', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'o' }, userId: '88273576' });
        expect((await call('ultra')).status).toBe(400);
    });
});
