import { NextResponse } from 'next/server';
import logger from '@/lib/log';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { defaultReposNotIn, filterReposForSync, SyncFilters } from '@/lib/sync-filters';
import { createSyncProgress } from '@/lib/sync-progress';
import type { QueueItem } from '@/lib/sync-batch';
import { rateLimitExhausted } from '@/lib/rate-limit-headers';
import { createSyncObservability } from '@/lib/sync-observability';

const GITHUB_API_TIMEOUT_MS = 10000;
const RATE_LIMIT_THRESHOLD = 200; // Pause syncs below this remaining

// Starts a sync: lists the repos and queues them. The work itself runs in
// /api/sync-repos/batch, one awaited request per small batch.
export async function POST(request: Request): Promise<NextResponse> {
    const observe = createSyncObservability({
        emit: (event) => logger.info('Sync-repos phase', event),
    });
    try {
        // Filters come from the dashboard's current filter state so the sync
        // refreshes exactly the repos currently displayed.
        let filters: SyncFilters = {};
        try {
            const body = await request.json();
            filters = {
                filterType: body?.filterType,
                filterLanguage: body?.filterLanguage,
                filterFork: body?.filterFork,
            };
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        // Validate filter values against the supported finite set so a bad
        // payload can't broaden the sync scope.
        const VALID_TYPES = ['all', 'web-app', 'game', 'tool', 'library', 'bot', 'research', 'unknown'];
        const VALID_FORKS = ['all', 'no-forks', 'forks-only'];
        if (filters.filterType !== undefined && !VALID_TYPES.includes(filters.filterType)) {
            return NextResponse.json({ error: `Invalid filterType: ${filters.filterType}` }, { status: 400 });
        }
        if (filters.filterFork !== undefined && !VALID_FORKS.includes(filters.filterFork)) {
            return NextResponse.json({ error: `Invalid filterFork: ${filters.filterFork}` }, { status: 400 });
        }
        if (filters.filterLanguage !== undefined && typeof filters.filterLanguage !== 'string') {
            return NextResponse.json({ error: 'Invalid filterLanguage' }, { status: 400 });
        }

        observe.start('auth');
        const session = await auth();
        logger.info('Sync-repos: Auth check', { hasSession: !!session, hasUser: !!session?.user });

        if (!session?.user) {
            observe.finish('auth', 'failure', { errorClass: 'auth' });
            logger.warn('Sync-repos: No user in session');
            return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accessToken = (session as any).accessToken;
        logger.info('Sync-repos: Token check', { hasToken: !!accessToken });
        if (!accessToken) {
            observe.finish('auth', 'failure', { errorClass: 'auth' });
            logger.warn('Sync-repos: No access token found');
            return NextResponse.json({ error: 'No GitHub access token found - Please sign out and sign in again' }, { status: 401 });
        }

        logger.info('Sync-repos: Fetching GitHub user...');
        // Fetch the authenticated user's GitHub username with timeout
        const { createOctokitClient } = await import('@/lib/githubClient');
        const octokit = createOctokitClient(accessToken);

        let githubUsername: string;
        let githubUserId: number;
        const timeoutError = new Error('GitHub API timeout');
        try {
            const userPromise = octokit.rest.users.getAuthenticated();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(timeoutError), GITHUB_API_TIMEOUT_MS)
            );
            const { data: user } = await Promise.race([userPromise, timeoutPromise]) as Awaited<ReturnType<typeof octokit.rest.users.getAuthenticated>>;
            githubUsername = user.login;
            githubUserId = user.id;
            observe.finish('auth', 'success');
            logger.info('Sync-repos: Got GitHub user');
        } catch (error) {
            logger.error('Sync-repos: Failed to get GitHub user:', error);
            // An exhausted quota is not an auth failure: say so, and when it resets.
            const quota = rateLimitExhausted(error);
            const errorClass: 'rate_limit' | 'timeout' | 'github_api' = quota
                ? 'rate_limit'
                : error === timeoutError
                  ? 'timeout'
                  : 'github_api';
            observe.finish('auth', 'failure', { errorClass });
            if (quota) {
                return NextResponse.json({ error: `GitHub rate limit reached · resets in ${quota.minutes} min` }, { status: 429 });
            }
            return NextResponse.json({ error: 'Failed to authenticate with GitHub' }, { status: 401 });
        }

        const github = new GitHubClient(accessToken, githubUsername);
        observe.start('database');
        const db = getNeonClient();

        try {
            await ensureSchema(db);
        } catch (schemaError) {
            logger.error('Sync-repos: Schema initialization failed:', schemaError);
            observe.finish('database', 'failure', { errorClass: 'database' });
            return NextResponse.json({ error: 'Database schema initialization failed' }, { status: 503 });
        }

        logger.info('Sync-repos: Fetching repos list...');
        // Upsert the user record inside a transaction so set_config is transaction-local
        // and the RLS policy (FORCE ROW LEVEL SECURITY on users) is satisfied.
        await db.transaction([
            db`SELECT set_config('app.current_github_id', ${String(githubUserId)}, true)`,
            db`
                INSERT INTO users (github_id, github_username)
                VALUES (${String(githubUserId)}, ${githubUsername})
                ON CONFLICT (github_id) DO UPDATE
                    SET github_username = EXCLUDED.github_username,
                        updated_at = NOW()
                RETURNING id
            `,
        ]);
        observe.finish('database', 'success');

        // Always do a full refresh — the Sync button must refresh every
        // displayed repo, not just ones GitHub reports as recently updated.
        observe.start('repository_list');
        const repos = await github.listRepos();
        logger.info(`Sync-repos: Found ${repos.length} repos from GitHub`);

        // Load DB state (is_hidden, is_archived, repo_type) so filtering matches
        // what the dashboard displays. repos table has an "allow all" RLS policy.
        // Keyed by full_name so repos with the same short name across owners
        // don't share state.
        const dbRepoRows = await db`SELECT full_name, is_hidden, is_archived, repo_type FROM repos` as unknown as Array<{
            full_name: string;
            is_hidden?: boolean;
            is_archived?: boolean;
            repo_type?: string | null;
        }>;
        const dbRepoMap = new Map<string, { full_name: string; is_hidden?: boolean; is_archived?: boolean; repo_type?: string | null }>(
            dbRepoRows.map((r) => [r.full_name, r])
        );

        const reposToSync = filterReposForSync(repos, filters, dbRepoMap);
        // Default repos the user already owns are in reposToSync; syncing them
        // again doubled their work and made the total overshoot (13 vs 11 synced).
        const defaultsToSync = defaultReposNotIn(reposToSync);
        const totalRepos = reposToSync.length + defaultsToSync.length;
        observe.finish('repository_list', 'success', {
            counts: { total: repos.length, selected: reposToSync.length, skipped: Math.max(0, repos.length - reposToSync.length) },
        });
        logger.info(`Sync-repos: ${reposToSync.length}/${repos.length} repos match current filters`);

        // Check rate limits before starting background sync
        try {
            const rateLimit = await github.getRateLimit();
            if (rateLimit.remaining < RATE_LIMIT_THRESHOLD) {
                logger.warn(`Sync-repos: Rate limit low (${rateLimit.remaining})`);
                return NextResponse.json({ error: 'Rate limit low' }, { status: 429 });
            }
        } catch {
            logger.warn('Sync-repos: Failed to check rate limits, proceeding anyway');
        }

        // Create progress tracking. The queue is stored with the run so every
        // batch request is self-contained; nothing runs after this response
        // (Workers tears the isolate down), the dashboard drives the batches.
        const queue: QueueItem[] = [
            ...reposToSync.map((r) => ({ owner: r.fullName.split('/')[0], name: r.name, fullName: r.fullName, isDefault: false })),
            ...defaultsToSync.map((d) => ({ owner: d.owner, name: d.name, fullName: d.fullName, isDefault: true })),
        ];
        const sessionId = `sync-${githubUserId}-${Date.now()}`;
        observe.start('completion');
        await createSyncProgress(sessionId, String(githubUserId), totalRepos, queue);
        observe.finish('completion', 'success', { counts: { total: totalRepos } });

        return NextResponse.json({
            success: true,
            message: totalRepos === 0 ? 'Nothing to sync' : 'Sync queued',
            totalRepos,
            sessionId,
            phase: totalRepos === 0 ? 'complete' : 'metadata',
        });
    } catch (error: unknown) {
        observe.finish('completion', 'failure', { errorClass: 'database' });
        observe.finish('auth', 'failure', { errorClass: 'unknown' });
        observe.finish('database', 'failure', { errorClass: 'database' });
        observe.finish('repository_list', 'failure', { errorClass: 'unknown' });
        logger.warn('Sync error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
