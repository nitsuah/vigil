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
    githubUserId: string | undefined
): Promise<boolean> {
    if (isDefaultRepo(repo.full_name)) return true;
    if (repo.visibility_verified && !repo.private_repo) return true;
    return hasRepoGrant(db, repo.id, githubUserId);
}

/**
 * Returns true only if a repo_access row confirms `githubUserId`'s own token
 * has resolved this repo. Unlike canAccessRepo there is no public/default
 * shortcut, so this is the check for routes that CHANGE a repo's shared row:
 * any signed-in user may read a public repo, but only someone who synced or
 * added it may rewrite its settings.
 */
export async function hasRepoGrant(
    db: RepoAccessDb,
    repoId: string,
    githubUserId: string | undefined
): Promise<boolean> {
    if (!githubUserId) return false;

    const rows = await db`
        SELECT 1 FROM repo_access WHERE repo_id = ${repoId} AND github_user_id = ${githubUserId} LIMIT 1
    `;
    return rows.length > 0;
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
           OR id IN (SELECT repo_id FROM repo_access WHERE github_user_id = ${githubUserId ?? ''})
    `) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
}

/**
 * Records that `githubUserId`'s own GitHub token has just resolved
 * `fullName` (via listRepos/getRepo, which only ever return repos that
 * token can see). Call this after a successful sync/add, never speculatively
 * -- it is the only source of truth canAccessRepo reads from. A no-op if the
 * repo row doesn't exist yet (nothing to reference) or the grant already
 * exists.
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
        ON CONFLICT (repo_id, github_user_id) DO NOTHING
    `;
}
