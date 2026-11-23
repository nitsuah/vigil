import { NextResponse } from 'next/server';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { canAccessRepo, hasRepoGrant, type RepoAccessCheck } from '@/lib/repo-access';

interface SessionLike {
    userId?: string;
    accessToken?: string;
}

/**
 * One-line authorization for the /api/repos/[name]/* routes: returns a 404
 * response if the signed-in caller may not see the repo named `repoName`,
 * or null to let the route continue.
 *
 * 404 (not 403) so a private repo's existence isn't confirmed to a caller who
 * can't see it. If no repo has that name this also returns null -- each route
 * already has its own "not found" handling, and there is nothing to protect.
 *
 * `name` is not unique across owners, so a caller must have access to EVERY
 * repo carrying that short name; the routes below act on whichever row a
 * `WHERE name = ...` happens to hit (or update all of them), so checking only
 * one would leave a gap.
 */
export async function denyIfNoRepoAccess(
    repoName: string,
    session: SessionLike | null
): Promise<NextResponse | null> {
    const db = getNeonClient();
    await ensureSchema(db);

    const rows = (await db`
        SELECT id, full_name, private_repo, visibility_verified FROM repos WHERE name = ${repoName}
    `) as unknown as RepoAccessCheck[];

    for (const repo of rows) {
        if (!(await canAccessRepo(db, repo, session?.userId, session?.accessToken))) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }
    }
    return null;
}

/**
 * Read-side lookup for routes that must act on ONE repo row: the first row
 * named `repoName` (by full_name) that this caller may actually see, so a
 * short-name collision never sends the caller's token to a repo it can't read.
 * 404 when none is visible (same as denyIfNoRepoAccess, so existence of a
 * private repo isn't confirmed).
 */
export async function resolveReadableRepo(
    repoName: string,
    session: SessionLike | null
): Promise<{ fullName: string; response?: undefined } | { fullName?: undefined; response: NextResponse }> {
    const db = getNeonClient();
    await ensureSchema(db);
    const rows = (await db`
        SELECT id, full_name, private_repo, visibility_verified FROM repos WHERE name = ${repoName} ORDER BY full_name LIMIT 25
    `) as unknown as RepoAccessCheck[];
    for (const row of rows) {
        if (await canAccessRepo(db, row, session?.userId, session?.accessToken)) {
            return { fullName: row.full_name as string };
        }
    }
    return { response: NextResponse.json({ error: 'Repo not found' }, { status: 404 }) };
}

export interface WritableRepo {
    id: string;
    name: string;
    full_name: string;
}

/**
 * Write-side counterpart of denyIfNoRepoAccess. `repos` rows are shared by
 * every user, so changing one needs a repo_access grant (the caller's own
 * token resolved that repo), not just read access. Resolves the short name to
 * exactly one grant-backed row and returns it so the caller updates by id.
 * 404 when nothing is writable, 409 when the short name is ambiguous.
 */
export async function resolveWritableRepo(
    repoName: string,
    session: SessionLike | null
): Promise<{ repo: WritableRepo; response?: undefined } | { repo?: undefined; response: NextResponse }> {
    const db = getNeonClient();
    await ensureSchema(db);

    const candidates = (await db`
        SELECT id, name, full_name FROM repos WHERE name = ${repoName}
    `) as unknown as WritableRepo[];

    const writable: WritableRepo[] = [];
    for (const row of candidates) {
        if (await hasRepoGrant(db, row.id, session?.userId, session?.accessToken)) writable.push(row);
    }
    if (writable.length === 0) {
        return { response: NextResponse.json({ error: 'Repo not found' }, { status: 404 }) };
    }
    if (writable.length > 1) {
        return {
            response: NextResponse.json(
                { error: `Repository name ${repoName} is ambiguous; sync it again to disambiguate` },
                { status: 409 }
            ),
        };
    }
    return { repo: writable[0] };
}
