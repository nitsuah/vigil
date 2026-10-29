/**
 * GET /api/repos -- the list must only return repos the caller may see, and
 * must hand the client real numbers for NUMERIC columns.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import type { Session } from 'next-auth';
import { NextRequest } from 'next/server';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ getNeonClient: vi.fn(), ensureSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { GET } from '@/app/api/repos/route';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';

const mockAuth = vi.mocked(auth) as unknown as Mock<() => Promise<Session | null>>;
const mockGetNeonClient = vi.mocked(getNeonClient);

const request = () => new NextRequest('http://localhost:3000/api/repos');

function makeDb(rows: unknown[]) {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const db = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ text: strings.join(' '), values });
        return rows;
    });
    return { db, calls };
}

describe('GET /api/repos', () => {
    beforeEach(() => vi.clearAllMocks());

    it('scopes a signed-in list to default, verified-public and granted repos', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: 'gh-42', expires: 'x' } as Session);
        const { db, calls } = makeDb([]);
        mockGetNeonClient.mockReturnValue(db as never);

        const res = await GET(request());
        expect(res.status).toBe(200);

        const query = calls[0];
        expect(query.text).toContain('visibility_verified IS TRUE AND private_repo IS NOT TRUE');
        expect(query.text).toContain('FROM repo_access WHERE github_user_id');
        // scoped to THIS caller, never a wildcard
        expect(query.values).toContain('gh-42');
    });

    it('scopes to an empty id (matches nothing) if the session somehow lacks a userId', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, expires: 'x' } as Session);
        const { db, calls } = makeDb([]);
        mockGetNeonClient.mockReturnValue(db as never);

        await GET(request());
        expect(calls[0].values).toContain('');
    });

    it('returns only the default repos to a signed-out visitor', async () => {
        mockAuth.mockResolvedValue(null);
        const { db, calls } = makeDb([]);
        mockGetNeonClient.mockReturnValue(db as never);

        await GET(request());
        expect(calls[0].text).not.toContain('repo_access');
        expect(calls[0].values[0]).toEqual(expect.arrayContaining(['nitsuah/vigil', 'Nitsuah-Labs/nitsuah-io']));
    });

    it('returns real numbers for NUMERIC columns (string -> number)', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: 'gh-42', expires: 'x' } as Session);
        const { db } = makeDb([{ name: 'a', token_density: '8.25', comment_to_code_ratio: '0.18', stars: 3 }]);
        mockGetNeonClient.mockReturnValue(db as never);

        const body = await (await GET(request())).json();
        expect(body[0]).toMatchObject({ name: 'a', token_density: 8.25, comment_to_code_ratio: 0.18, stars: 3 });
        expect(typeof body[0].token_density).toBe('number');
    });

    it('returns issue_category_counts from the database', async () => {
        mockAuth.mockResolvedValue({ user: { name: 'u' }, userId: 'gh-42', expires: 'x' } as Session);
        const { db } = makeDb([
            { name: 'a', issue_category_counts: { total: 2, vulnerability: 1, bug: 1, feedback: 0, other: 0, complete: true } },
            { name: 'b', issue_category_counts: null },
        ]);
        mockGetNeonClient.mockReturnValue(db as never);

        const body = await (await GET(request())).json();
        expect(body[0].issue_category_counts).toEqual({ total: 2, vulnerability: 1, bug: 1, feedback: 0, other: 0, complete: true });
        expect(body[1].issue_category_counts).toBeNull();
    });
});
