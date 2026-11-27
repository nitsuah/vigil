/** GET /api/repo-details/[name]/trend -- both lookup paths bind only the value, and 500s say nothing. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { Session } from 'next-auth';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getNeonClient: vi.fn(), ensureSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/default-repos', () => ({ DEFAULT_REPOS: [{ name: 'vigil', fullName: 'nitsuah/vigil' }] }));

import { GET } from '@/app/api/repo-details/[name]/trend/route';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';

const mockAuth = vi.mocked(auth) as unknown as Mock<() => Promise<Session | null>>;
const mockGetNeonClient = vi.mocked(getNeonClient);

function makeDb(repoRows: unknown[]) {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const db = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('?');
        calls.push({ text, values });
        return text.includes('FROM repo_snapshots') ? [] : repoRows;
    });
    return { db, calls };
}

const call = (params: { name: string; fullName?: string }) =>
    GET(new Request('http://localhost/api/repo-details/x/trend'), { params: Promise.resolve(params) });

const row = { id: 'repo-1', full_name: 'nitsuah/vigil' };

describe('GET /api/repo-details/[name]/trend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue(null);
    });

    it('looks up by short name with the name as the only bound value', async () => {
        const { db, calls } = makeDb([row]);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await call({ name: 'vigil' });

        expect(res.status).toBe(200);
        expect(calls[0].text).toContain('WHERE name = ?');
        expect(calls[0].values).toEqual(['vigil']);
    });

    it('looks up by full name with the full name as the only bound value', async () => {
        const { db, calls } = makeDb([row]);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await call({ name: 'vigil', fullName: 'nitsuah/vigil' });

        expect(res.status).toBe(200);
        expect(calls[0].text).toContain('WHERE full_name = ?');
        expect(calls[0].values).toEqual(['nitsuah/vigil']);
    });

    it('does not serve a same-named repo from another owner to a signed-out visitor', async () => {
        const { db } = makeDb([{ id: 'other', full_name: 'someone/vigil' }]);
        mockGetNeonClient.mockReturnValue(db as never);

        expect((await call({ name: 'vigil' })).status).toBe(404);
    });

    it('serves that repo by short name to a signed-in user who can see it', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: 'gh-1', expires: 'x' } as Session);
        const { db, calls } = makeDb([
            { id: 'other', full_name: 'someone/vigil', private_repo: false, visibility_verified: true },
        ]);
        mockGetNeonClient.mockReturnValue(db as never);

        expect((await call({ name: 'vigil' })).status).toBe(200);
        expect(calls.at(-1)?.values).toEqual(['other']);
    });

    it('returns a generic body when the database fails', async () => {
        mockGetNeonClient.mockReturnValue(
            vi.fn().mockRejectedValue(new Error('invalid input syntax for type boolean')) as never
        );

        const res = await call({ name: 'vigil' });

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Internal error' });
    });
});
