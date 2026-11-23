import { NextResponse, NextRequest, after } from 'next/server';
import logger from '@/lib/log';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { auth } from '@/auth';
import { DEFAULT_REPOS } from '@/lib/default-repos';
import { normalizeRepoRow } from '@/lib/numeric';
import { GRANT_TTL_MS, revalidateDueGrants } from '@/lib/repo-access';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        const db = getNeonClient();
        // The visibility filter below reads columns/tables added by schema
        // migrations, which otherwise only run on sync.
        await ensureSchema(db);
        const { searchParams } = new URL(request.url);
        const showHidden = searchParams.get('showHidden') === 'true';
        const defaultRepoNames = DEFAULT_REPOS.map(r => r.fullName);

        // If not authenticated, only return default repos
        if (!session) {
            const repos = await db`
                SELECT * FROM repos
                WHERE (is_hidden = FALSE OR is_hidden IS NULL)
                AND full_name = ANY(${defaultRepoNames})
                ORDER BY
                    is_fork ASC,
                    CASE
                        WHEN repo_type = 'unknown' THEN 999
                        WHEN repo_type = 'web-app' THEN 1
                        WHEN repo_type = 'game' THEN 2
                        WHEN repo_type = 'tool' THEN 3
                        WHEN repo_type = 'library' THEN 4
                        WHEN repo_type = 'bot' THEN 5
                        WHEN repo_type = 'research' THEN 6
                        ELSE 999
                    END ASC,
                    stars DESC,
                    updated_at DESC
            `;
            return NextResponse.json(repos.map(normalizeRepoRow));
        }

        // Authenticated: `repos` is one shared table with no per-row owner, so
        // a signed-in session is not itself proof of access to every row
        // (CWE-639). Return only default repos, verified-public repos, and
        // repos this user's own GitHub token has resolved (repo_access) --
        // see lib/repo-access.ts. Rows not yet re-verified since that column
        // was introduced fail closed until their next sync.
        // When showHidden is true, include hidden/archived repos too.
        const githubUserId = session.userId ?? '';
        // Keep this user's grants current (bounded, oldest first) after the
        // response is sent, so listing is never slowed by GitHub lookups.
        const revalidate = () => revalidateDueGrants(db, session.userId, session.accessToken).catch(() => undefined);
        try {
            after(revalidate);
        } catch {
            // No request scope (e.g. unit tests): run in the background.
            void revalidate();
        }
        const grantCutoff = new Date(Date.now() - GRANT_TTL_MS).toISOString();
        const repos = await db`
            SELECT * FROM repos
            WHERE (${showHidden}::boolean IS TRUE OR ((is_hidden = FALSE OR is_hidden IS NULL) AND (is_archived = FALSE OR is_archived IS NULL)))
            AND (
                full_name = ANY(${defaultRepoNames})
                OR (visibility_verified IS TRUE AND private_repo IS NOT TRUE)
                OR id IN (SELECT repo_id FROM repo_access WHERE github_user_id = ${githubUserId} AND verified_at > ${grantCutoff}::timestamptz)
            )
            ORDER BY
                is_hidden ASC, -- Show visible first, then hidden
                is_fork ASC,
                CASE
                    WHEN repo_type = 'unknown' THEN 999
                    WHEN repo_type = 'web-app' THEN 1
                    WHEN repo_type = 'game' THEN 2
                    WHEN repo_type = 'tool' THEN 3
                    WHEN repo_type = 'library' THEN 4
                    WHEN repo_type = 'bot' THEN 5
                    WHEN repo_type = 'research' THEN 6
                    ELSE 999
                END ASC,
                stars DESC,
                updated_at DESC
        `;

        return NextResponse.json(repos.map(normalizeRepoRow));
    } catch (error: unknown) {
        logger.warn('Error fetching repos:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
