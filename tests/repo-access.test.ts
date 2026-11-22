/**
 * Tests for lib/repo-access.ts -- the per-repo authorization layer that
 * closes the IDOR gap on the shared, ownerless `repos` table (CWE-639).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    canAccessRepo,
    grantRepoAccess,
    getAccessibleRepoIds,
    isDefaultRepo,
    hasRepoGrant,
    revalidateGrant,
    revalidateDueGrants,
    REVALIDATE_COOLDOWN_MS,
    type RepoAccessDb,
} from '@/lib/repo-access';

function makeDb(rows: unknown[] = []) {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const spy = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ text: strings.join(' '), values });
        return rows;
    });
    return { db: spy as unknown as RepoAccessDb, spy, calls };
}

describe('isDefaultRepo', () => {
    it('recognises DEFAULT_REPOS case-insensitively and rejects others', () => {
        expect(isDefaultRepo('nitsuah/vigil')).toBe(true);
        expect(isDefaultRepo('Nitsuah-Labs/nitsuah-io')).toBe(true);
        expect(isDefaultRepo('someone/else')).toBe(false);
        expect(isDefaultRepo(null)).toBe(false);
    });
});

describe('canAccessRepo', () => {
    it('always allows a default repo without querying repo_access', async () => {
        const { db, spy } = makeDb();
        const allowed = await canAccessRepo(db, { id: 'r1', full_name: 'nitsuah/vigil' }, undefined);
        expect(allowed).toBe(true);
        expect(spy).not.toHaveBeenCalled();
    });

    it('allows a verified-public repo without querying repo_access', async () => {
        const { db, spy } = makeDb();
        const allowed = await canAccessRepo(
            db,
            { id: 'r1', full_name: 'a/b', private_repo: false, visibility_verified: true },
            'gh-999'
        );
        expect(allowed).toBe(true);
        expect(spy).not.toHaveBeenCalled();
    });

    it('FAILS CLOSED for an unverified row (synced before visibility was tracked)', async () => {
        const { db } = makeDb([]);
        const allowed = await canAccessRepo(
            db,
            { id: 'r1', full_name: 'a/b', private_repo: false, visibility_verified: false },
            'gh-999'
        );
        expect(allowed).toBe(false);
    });

    it('still lets the owner into an unverified row via their repo_access grant', async () => {
        const { db } = makeDb([{ '?column?': 1 }]);
        const allowed = await canAccessRepo(db, { id: 'r1', full_name: 'a/b' }, 'gh-owner');
        expect(allowed).toBe(true);
    });

    it('denies a private repo when the caller has no githubUserId at all', async () => {
        const { db, spy } = makeDb();
        const allowed = await canAccessRepo(
            db,
            { id: 'r1', full_name: 'a/b', private_repo: true, visibility_verified: true },
            undefined
        );
        expect(allowed).toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });

    it('allows a private repo when a matching repo_access row exists', async () => {
        const { db, calls } = makeDb([{ '?column?': 1 }]);
        const allowed = await canAccessRepo(
            db,
            { id: 'r1', full_name: 'a/b', private_repo: true, visibility_verified: true },
            'gh-999'
        );
        expect(allowed).toBe(true);
        expect(calls[0].values).toEqual(['r1', 'gh-999', expect.any(String)]);
    });

    it("denies a private repo with no repo_access row for this user (someone else's repo)", async () => {
        const { db } = makeDb([]);
        const allowed = await canAccessRepo(
            db,
            { id: 'r1', full_name: 'a/b', private_repo: true, visibility_verified: true },
            'gh-someone-else'
        );
        expect(allowed).toBe(false);
    });
});

describe('getAccessibleRepoIds', () => {
    it('returns the ids the query yields, scoped to the caller', async () => {
        const { db, calls } = makeDb([{ id: 'r1' }, { id: 'r2' }]);
        const ids = await getAccessibleRepoIds(db, 'gh-999');
        expect([...ids]).toEqual(['r1', 'r2']);
        expect(calls[0].values).toContain('gh-999');
        expect(calls[0].text).toContain('visibility_verified IS TRUE');
    });

    it('scopes an unknown caller to an empty user id (never a wildcard)', async () => {
        const { db, calls } = makeDb([]);
        await getAccessibleRepoIds(db, undefined);
        expect(calls[0].values).toContain('');
    });
});

describe('grantRepoAccess', () => {
    it('is a no-op when githubUserId is undefined', async () => {
        const { db, spy } = makeDb();
        await grantRepoAccess(db, 'owner/repo', undefined);
        expect(spy).not.toHaveBeenCalled();
    });

    it("inserts a repo_access row scoped by full_name and the caller's id", async () => {
        const { db, spy, calls } = makeDb();
        await grantRepoAccess(db, 'owner/repo', 'gh-999');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(calls[0].text).toContain('INSERT INTO repo_access');
        expect(calls[0].values).toEqual(['gh-999', 'owner/repo']);
    });
});

describe('grant expiry and revalidation', () => {
    const res = (status: number, headers: Record<string, string> = {}, body = '') => ({
        status,
        headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
        text: async () => body,
    });

    it('requires a recent verification time when checking a grant', async () => {
        const { db, calls } = makeDb([]);
        expect(await hasRepoGrant(db, 'r1', 'gh-1')).toBe(false);
        expect(calls[0].text).toContain('verified_at >');
        expect(calls).toHaveLength(1);
    });

    it('a lapsed grant is renewed when GitHub still shows the repo to the caller', async () => {
        const calls: string[] = [];
        const db = (async (strings: TemplateStringsArray) => {
            const q = strings.join(' ');
            calls.push(q);
            if (q.includes('SELECT 1 FROM repo_access')) return [];
            if (q.includes('SELECT r.full_name')) return [{ full_name: 'o/private' }];
            return [];
        }) as unknown as RepoAccessDb;
        const fetchImpl = vi.fn().mockResolvedValue(res(200));
        expect(await revalidateGrant(db, 'r1', 'gh-1', 'tok', fetchImpl)).toBe(true);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/o/private');
        expect(calls.some((q) => q.includes('UPDATE repo_access SET verified_at'))).toBe(true);
    });

    it('deletes the grant when GitHub no longer shows the repo', async () => {
        const calls: string[] = [];
        const db = (async (strings: TemplateStringsArray) => {
            const q = strings.join(' ');
            calls.push(q);
            return q.includes('SELECT r.full_name') ? [{ full_name: 'o/private' }] : [];
        }) as unknown as RepoAccessDb;
        calls.length = 0;
        expect(await revalidateGrant(db, 'r1', 'gh-1', 'tok', vi.fn().mockResolvedValue(res(404)))).toBe(false);
        expect(calls.some((q) => q.includes('DELETE FROM repo_access'))).toBe(true);
    });

    it('deletes on a 403 only when the body plainly says not found / no access', async () => {
        const calls: string[] = [];
        const db = (async (strings: TemplateStringsArray) => {
            const q = strings.join(' ');
            calls.push(q);
            return q.includes('SELECT r.full_name') ? [{ full_name: 'o/private' }] : [];
        }) as unknown as RepoAccessDb;
        const run = (r: ReturnType<typeof res>) => revalidateGrant(db, 'r1', 'gh-1', 'tok', vi.fn().mockResolvedValue(r));

        calls.length = 0;
        await run(res(403, {}, '{"message":"Not Found"}'));
        expect(calls.some((q) => q.includes('DELETE'))).toBe(true);

        for (const r of [
            res(403, {}, '{"message":"API rate limit exceeded"}'),
            res(403, {}, '{"message":"You have exceeded a secondary rate limit"}'),
            res(403, {}, '{"message":"Resource protected by organization SAML enforcement"}'),
            res(403, {}, '{"message":"abuse detection mechanism"}'),
            res(403, { 'retry-after': '30' }, '{"message":"Not Found"}'),
            res(404, { 'retry-after': '30' }),
            res(403, {}, ''),
        ]) {
            calls.length = 0;
            await run(r);
            expect(calls.some((q) => q.includes('DELETE'))).toBe(false);
        }
    });

    it('leaves the grant alone on rate limiting, server errors and network failures', async () => {
        const calls: string[] = [];
        const db = (async (strings: TemplateStringsArray) => {
            const q = strings.join(' ');
            calls.push(q);
            return q.includes('SELECT r.full_name') ? [{ full_name: 'o/private' }] : [];
        }) as unknown as RepoAccessDb;
        for (const f of [
            vi.fn().mockResolvedValue(res(403, { 'x-ratelimit-remaining': '0' })),
            vi.fn().mockResolvedValue(res(500)),
            vi.fn().mockResolvedValue(res(401)),
            vi.fn().mockRejectedValue(new Error('timeout')),
        ]) {
            expect(await revalidateGrant(db, 'r1', 'gh-1', 'tok', f)).toBe(false);
        }
        expect(calls.some((q) => q.includes('DELETE') || q.includes('UPDATE'))).toBe(false);
    });

    it('does not call GitHub without a token', async () => {
        const { db, spy } = makeDb([]);
        await revalidateDueGrants(db, 'gh-1', undefined);
        expect(spy).not.toHaveBeenCalled();
    });

    it('re-checks only due grants, a bounded number per call', async () => {
        const db = (async (strings: TemplateStringsArray) => {
            const q = strings.join(' ');
            if (q.includes('SELECT repo_id FROM repo_access')) {
                expect(q).toContain('LIMIT');
                return [{ repo_id: 'a' }, { repo_id: 'b' }];
            }
            if (q.includes('SELECT r.full_name')) return [{ full_name: 'o/p' }];
            return [];
        }) as unknown as RepoAccessDb;
        const fetchImpl = vi.fn().mockResolvedValue(res(200));
        await revalidateDueGrants(db, 'gh-1', 'tok', fetchImpl);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('runs a revalidation pass at most once per cooldown per user', async () => {
        const db = (async (strings: TemplateStringsArray) => {
            const q = strings.join(' ');
            if (q.includes('SELECT repo_id FROM repo_access')) return [{ repo_id: 'a' }];
            if (q.includes('SELECT r.full_name')) return [{ full_name: 'o/p' }];
            return [];
        }) as unknown as RepoAccessDb;
        const fetchImpl = vi.fn().mockResolvedValue(res(200));
        const t0 = 1_000_000_000_000;
        await revalidateDueGrants(db, 'gh-cool', 'tok', fetchImpl, t0);
        await revalidateDueGrants(db, 'gh-cool', 'tok', fetchImpl, t0 + 1000);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        await revalidateDueGrants(db, 'gh-cool', 'tok', fetchImpl, t0 + REVALIDATE_COOLDOWN_MS + 1);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});
