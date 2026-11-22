// Per-repo authorization for the shared `repos` table.
//
// `repos` has no per-row owner: every synced repo is a single global row,
// upserted by whichever signed-in user last synced or added it (see
// lib/sync.ts). That's fine for public repos, but a private repo's data
// (tasks, roadmap, health, chat context) must not be visible to a signed-in
// user who simply knows or guesses its name (CWE-639) -- GitHub sign-in in
// this app is not restricted to a single account, so a stranger can get a
// valid session and, without this check, read anyone's previously-synced
// private repo data.
//
// The model:
//  - `repos.private_repo` mirrors GitHub's `private` flag and
//    `repos.visibility_verified` records that a sync has actually populated
//    it. Rows synced before this column existed are unverified, so they FAIL
//    CLOSED (treated as possibly-private) until their next sync re-verifies
//    them -- a default of "public" would have exposed every previously-synced
//    private repo.
//  - A verified, non-private repo is visible to any signed-in user.
//  - Anything else additionally requires a `repo_access` row for the caller's
//    GitHub user id, granted only by routes that just fetched that repo
//    through the caller's own GitHub token (grantRepoAccess below) -- never
//    inferred from the repo merely existing.
//  - DEFAULT_REPOS are known-public and always visible.

import { DEFAULT_REPOS } from '@/lib/default-repos';

/** Minimal shape of the tagged-template SQL function this module needs. */
export type RepoAccessDb = (
    strings: TemplateStringsArray,
    ...values: unknown[]
) => Promise<unknown[]>;

export interface RepoAccessCheck {
    id: string;
    full_name?: string | null;
    private_repo?: boolean | null;
    visibility_verified?: boolean | null;
}

const DEFAULT_REPO_FULL_NAMES = new Set(DEFAULT_REPOS.map((r) => r.fullName.toLowerCase()));

/** A grant stops authorizing this long after it was last verified against GitHub. */
export const GRANT_TTL_MS = 60 * 60_000;
/** Grants older than this are re-checked against GitHub with the caller's own token. */
export const GRANT_REVALIDATE_AFTER_MS = 15 * 60_000;
/** Upper bound on GitHub lookups a single listing request performs. */
const MAX_REVALIDATIONS_PER_CALL = 10;
const REVALIDATE_TIMEOUT_MS = 3_000;
/** Minimum gap between revalidation passes for one user. */
export const REVALIDATE_COOLDOWN_MS = 5 * 60_000;
const MAX_COOLDOWN_ENTRIES = 5_000;
const lastRevalidation = new Map<string, number>();

const cutoff = (ms: number, now: number = Date.now()): string => new Date(now - ms).toISOString();

export function isDefaultRepo(fullName: string | null | undefined): boolean {
    return !!fullName && DEFAULT_REPO_FULL_NAMES.has(fullName.toLowerCase());
}

/**
 * Returns true if `githubUserId` may view `repo`'s data: unconditionally for
 * a default repo or a verified-public repo, or if a repo_access row confirms
 * this user's GitHub token has previously resolved this specific repo.
 */
export async function canAccessRepo(
    db: RepoAccessDb,
    repo: RepoAccessCheck,
    githubUserId: string | undefined,
    accessToken?: string
): Promise<boolean> {
    if (isDefaultRepo(repo.full_name)) return true;
    if (repo.visibility_verified && !repo.private_repo) return true;
    return hasRepoGrant(db, repo.id, githubUserId, accessToken);
}

/**
 * Returns true only if a repo_access row confirms `githubUserId`'s own token
 * has resolved this repo, and that confirmation is recent (GRANT_TTL_MS).
 * Unlike canAccessRepo there is no public/default shortcut, so this is the
 * check for routes that CHANGE a repo's shared row: any signed-in user may
 * read a public repo, but only someone who synced or added it may rewrite its
 * settings.
 *
 * When the grant has lapsed and the caller's `accessToken` is supplied, it is
 * re-checked once against GitHub: renewed if the token still reaches the repo,
 * deleted if GitHub says it no longer does. Without a token a lapsed grant
 * simply denies (fail closed) until the user's next sync or dashboard load.
 */
export async function hasRepoGrant(
    db: RepoAccessDb,
    repoId: string,
    githubUserId: string | undefined,
    accessToken?: string
): Promise<boolean> {
    if (!githubUserId) return false;

    const rows = await db`
        SELECT 1 FROM repo_access
        WHERE repo_id = ${repoId} AND github_user_id = ${githubUserId}
          AND verified_at > ${cutoff(GRANT_TTL_MS)}::timestamptz
        LIMIT 1
    `;
    if (rows.length > 0) return true;
    if (!accessToken) return false;
    return revalidateGrant(db, repoId, githubUserId, accessToken);
}

type FetchLike = (
    url: string,
    init?: RequestInit
) => Promise<{ status: number; headers: { get(name: string): string | null }; text?: () => Promise<string> }>;

/** Wording GitHub uses when a repo is simply not visible to the token. */
const NO_ACCESS_BODY = /\b(not found|no access)\b/i;
/** Throttling, abuse and SSO/SAML responses say nothing about repo access. */
const INCONCLUSIVE_BODY = /rate limit|abuse|secondary|saml|sso|enforce|temporarily|try again/i;

/** True only for a response that clearly means "this token cannot see the repo". */
async function clearlyNoAccess(res: Awaited<ReturnType<FetchLike>>): Promise<boolean> {
    if (res.headers.get('retry-after') !== null || res.headers.get('x-ratelimit-remaining') === '0') return false;
    if (res.status === 404) return true;
    if (res.status !== 403 || !res.text) return false;
    try {
        const body = (await res.text()).slice(0, 2000);
        return NO_ACCESS_BODY.test(body) && !INCONCLUSIVE_BODY.test(body);
    } catch {
        return false;
    }
}

/**
 * Re-checks one existing grant against GitHub with the caller's token.
 * Returns true if the grant is (now) valid. 200 renews it; a 404, or a 403 whose
 * body plainly says not found / no access (never rate-limit, abuse or SAML
 * responses, nor anything carrying retry-after), deletes it; any other outcome leaves it untouched, so it
 * keeps lapsing rather than being extended on an inconclusive answer.
 */
export async function revalidateGrant(
    db: RepoAccessDb,
    repoId: string,
    githubUserId: string,
    accessToken: string,
    fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<boolean> {
    const rows = (await db`
        SELECT r.full_name FROM repo_access a JOIN repos r ON r.id = a.repo_id
        WHERE a.repo_id = ${repoId} AND a.github_user_id = ${githubUserId}
        LIMIT 1
    `) as Array<{ full_name?: string }>;
    const fullName = rows[0]?.full_name;
    if (!fullName || !/^[\w.-]+\/[\w.-]+$/.test(fullName)) return false;

    try {
        const res = await fetchImpl(`https://api.github.com/repos/${fullName}`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
        });
        if (res.status === 200) {
            await db`
                UPDATE repo_access SET verified_at = NOW()
                WHERE repo_id = ${repoId} AND github_user_id = ${githubUserId}
            `;
            return true;
        }
        if (await clearlyNoAccess(res)) {
            await db`DELETE FROM repo_access WHERE repo_id = ${repoId} AND github_user_id = ${githubUserId}`;
        }
    } catch {
        // Network error or timeout: inconclusive, leave the grant to lapse.
    }
    return false;
}

/**
 * Re-checks this user's grants that are due (older than GRANT_REVALIDATE_AFTER_MS),
 * a bounded handful per call, oldest first. Meant to run on a regular listing
 * request so active users keep their access current without a full sync.
 */
export async function revalidateDueGrants(
    db: RepoAccessDb,
    githubUserId: string | undefined,
    accessToken: string | undefined,
    fetchImpl?: FetchLike,
    now: number = Date.now()
): Promise<void> {
    if (!githubUserId || !accessToken) return;
    // Per-user cooldown (per instance): listing requests are frequent and a
    // re-check pass should not run on every one of them.
    const last = lastRevalidation.get(githubUserId);
    if (last !== undefined && now - last < REVALIDATE_COOLDOWN_MS) return;
    if (lastRevalidation.size >= MAX_COOLDOWN_ENTRIES) {
        const oldest = lastRevalidation.keys().next();
        if (!oldest.done) lastRevalidation.delete(oldest.value);
    }
    lastRevalidation.set(githubUserId, now);
    const due = (await db`
        SELECT repo_id FROM repo_access
        WHERE github_user_id = ${githubUserId}
          AND verified_at <= ${cutoff(GRANT_REVALIDATE_AFTER_MS)}::timestamptz
        ORDER BY verified_at ASC
        LIMIT ${MAX_REVALIDATIONS_PER_CALL}
    `) as Array<{ repo_id: string }>;
    await Promise.all(due.map((row) => revalidateGrant(db, row.repo_id, githubUserId, accessToken, fetchImpl)));
}

/**
 * Ids of every repo `githubUserId` may view -- the set-based equivalent of
 * canAccessRepo, for aggregate routes that return many repos at once
 * (app/api/repos lists inline with the same predicate).
 */
export async function getAccessibleRepoIds(
    db: RepoAccessDb,
    githubUserId: string | undefined
): Promise<Set<string>> {
    const defaultFullNames = DEFAULT_REPOS.map((r) => r.fullName);
    const rows = (await db`
        SELECT id FROM repos
        WHERE full_name = ANY(${defaultFullNames})
           OR (visibility_verified IS TRUE AND private_repo IS NOT TRUE)
           OR id IN (SELECT repo_id FROM repo_access WHERE github_user_id = ${githubUserId ?? ''} AND verified_at > ${cutoff(GRANT_TTL_MS)}::timestamptz)
    `) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
}

/**
 * Records that `githubUserId`'s own GitHub token has just resolved
 * `fullName` (via listRepos/getRepo, which only ever return repos that
 * token can see). Call this after a successful sync/add, never speculatively
 * -- it is the only source of truth canAccessRepo reads from. A no-op if the
 * repo row doesn't exist yet (nothing to reference). An existing grant has
 * its verification time refreshed.
 */
export async function grantRepoAccess(
    db: RepoAccessDb,
    fullName: string,
    githubUserId: string | undefined
): Promise<void> {
    if (!githubUserId) return;

    await db`
        INSERT INTO repo_access (repo_id, github_user_id)
        SELECT id, ${githubUserId} FROM repos WHERE full_name = ${fullName}
        ON CONFLICT (repo_id, github_user_id) DO UPDATE SET verified_at = NOW()
    `;
}
