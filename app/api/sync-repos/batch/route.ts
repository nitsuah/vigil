import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/log';
import { auth } from '@/auth';
import { GitHubClient, type RepoMetadata } from '@/lib/github';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { syncRepo, syncRepoMetadata } from '@/lib/sync';
import { grantRepoAccess } from '@/lib/repo-access';
import { rateLimitExhausted } from '@/lib/rate-limit-headers';
import { advanceSyncSession, failSyncSession, getSyncSession, type SyncSession } from '@/lib/sync-progress';
import { planAdvance, sliceBatch, type BatchPhase, type QueueItem } from '@/lib/sync-batch';

const RATE_LIMIT_THRESHOLD = 200; // Stop below this many remaining GitHub calls

// One awaited unit of a sync run (#305). The dashboard calls this until the run
// is complete. Everything happens before the response: on Workers nothing may
// run afterwards, and a single invocation is limited to 50 subrequests, which
// is why a batch is 3 repos for the metadata pass and 1 for health checks
// (see lib/sync-batch.ts).

function progressBody(s: Pick<SyncSession, 'sessionId' | 'totalRepos' | 'completedRepos' | 'currentRepo' | 'phase' | 'failedRepos' | 'cursor'>, extra: Record<string, unknown> = {}) {
    return {
        sessionId: s.sessionId,
        phase: s.phase,
        totalRepos: s.totalRepos,
        completedRepos: s.completedRepos,
        currentRepo: s.currentRepo,
        failedRepos: s.failedRepos,
        cursor: s.cursor,
        progressPercentage: s.totalRepos === 0 ? 100 : Math.min(Math.round((s.completedRepos / s.totalRepos) * 100), 100),
        done: s.phase === 'complete' || s.phase === 'error',
        ...extra,
    };
}

async function stopForRateLimit(session: SyncSession, phase: BatchPhase, minutes: number) {
    const currentRepo = `GitHub rate limit reached after ${session.completedRepos} of ${session.totalRepos} repos · resets in ${minutes} min`;
    // Only end the run if it is still where this request found it: a slow quota
    // probe must not turn a run another request finished into an error.
    const ended = await failSyncSession({
        sessionId: session.sessionId, githubUserId: session.githubUserId, from: { phase, cursor: session.cursor }, currentRepo,
    });
    if (ended) return NextResponse.json(progressBody({ ...session, phase: 'error', currentRepo }));
    return currentProgress(session);
}

// Where the run is now, for a request that lost a race. A run that was
// superseded (deleted) while the request was in flight reads as not found.
async function currentProgress(session: SyncSession) {
    const latest = await getSyncSession(session.sessionId, session.githubUserId);
    if (!latest) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    return NextResponse.json(progressBody(latest, { stale: true }));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    let body: { sessionId?: unknown; skip?: unknown; cursor?: unknown; phase?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (typeof body?.sessionId !== 'string' || !body.sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }
    const sessionId = body.sessionId;
    const skip = body.skip === true;

    try {
        const authSession = await auth();
        // userId is the GitHub numeric id (auth.ts session callback), the same
        // value the sync stores as github_user_id.
        const userId = (authSession as { userId?: string } | null)?.userId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accessToken = (authSession as any)?.accessToken as string | undefined;
        if (!authSession?.user || !userId || !accessToken) {
            return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
        }

        // Another user's run reads as "not found", never as forbidden.
        const session = await getSyncSession(sessionId, userId);
        if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        // Rows from before sync was client-driven have no queue and can never advance.
        if (!session.queue) {
            return NextResponse.json({ error: 'This sync cannot be resumed; start a new one', restartable: true }, { status: 409 });
        }
        if (session.phase !== 'metadata' && session.phase !== 'health') {
            return NextResponse.json(progressBody(session));
        }

        const phase: BatchPhase = session.phase;
        // The client names the batch it means (phase + cursor). If the run has moved on
        // (a response was lost, another tab advanced it) nothing is worked or skipped.
        if (
            (typeof body.cursor === 'number' && body.cursor !== session.cursor) ||
            (typeof body.phase === 'string' && body.phase !== session.phase)
        ) {
            return NextResponse.json(progressBody(session, { stale: true }));
        }
        const batch = sliceBatch(session.queue, session.cursor, phase);
        const db = getNeonClient();
        let failedDelta = 0;
        let currentRepo = batch[batch.length - 1]?.fullName ?? '';

        if (skip) {
            // The client gave up on this batch after a retry: record it and move on.
            // Only the health pass counts: metadata is retried there, so a repo counts once.
            failedDelta = phase === 'health' ? batch.length : 0;
        } else {
            await ensureSchema(db);
            // The client's default owner is only a fallback: every sync call passes the repo's owner.
            const github = new GitHubClient(accessToken, batch[0]?.owner ?? '');
            // The client's own quota gates the work; the run stops cleanly when it is low.
            const remaining = await github.getRateLimit().catch(() => null);
            if (remaining && remaining.remaining < RATE_LIMIT_THRESHOLD) {
                const minutes = Math.max(1, Math.ceil((remaining.reset * 1000 - Date.now()) / 60_000));
                return await stopForRateLimit(session, phase, minutes);
            }
            const systemToken = process.env.GITHUB_TOKEN;
            const systemGithub = systemToken
                ? new GitHubClient(systemToken, process.env.GITHUB_SYSTEM_USERNAME || 'nitsuah')
                : null;

            for (const item of batch) {
                currentRepo = item.fullName;
                const client = item.isDefault && systemGithub ? systemGithub : github;
                // A default repo the user's token can't read is an expected miss, not a failure.
                const expectedMiss = item.isDefault && !systemGithub;
                let repo: RepoMetadata;
                try {
                    repo = await client.getRepo(item.owner, item.name);
                } catch (error) {
                    const quota = rateLimitExhausted(error);
                    if (quota) return await stopForRateLimit(session, phase, quota.minutes);
                    if (!expectedMiss && phase === 'health') failedDelta++;
                    logger.warn(`Sync batch: could not fetch ${item.name}:`, error instanceof Error ? error.message : 'Unknown error');
                    continue;
                }
                try {
                    await syncOne(repo, item, phase, client, db, userId);
                } catch (error) {
                    const quota = rateLimitExhausted(error);
                    if (quota) return await stopForRateLimit(session, phase, quota.minutes);
                    // A write failure is a real failure even for a default repo.
                    if (phase === 'health') failedDelta++;
                    logger.warn(`Sync batch: ${phase} failed for ${item.name}:`, error instanceof Error ? error.message : 'Unknown error');
                }
            }
        }

        // Stamp last_sync_at before completing the run, and never move it backwards, so a retry
        // after a failure here repeats this write instead of finding a run already complete.
        const finishing = planAdvance({ phase, cursor: session.cursor, queueLength: session.queue.length, consumed: batch.length }).phase === 'complete';
        if (finishing) {
            const startedAt = session.startedAt.toISOString();
            await db.transaction([
                db`SELECT set_config('app.current_github_id', ${userId}, true)`,
                db`UPDATE users SET last_sync_at = ${startedAt} WHERE github_id = ${userId} AND (last_sync_at IS NULL OR last_sync_at < ${startedAt})`,
            ]);
        }
        const to = planAdvance({ phase, cursor: session.cursor, queueLength: session.queue.length, consumed: batch.length });
        const advanced = await advanceSyncSession({
            sessionId, githubUserId: userId, from: { phase, cursor: session.cursor }, to, failedDelta, currentRepo,
        });
        // A second driver got there first (two tabs, a retried request): report where the run is.
        if (!advanced) return await currentProgress(session);
        return NextResponse.json(progressBody({
            sessionId,
            totalRepos: session.totalRepos,
            completedRepos: to.completedRepos,
            currentRepo: to.phase === 'complete' ? 'Complete' : currentRepo,
            phase: to.phase,
            failedRepos: session.failedRepos + failedDelta,
            cursor: to.cursor,
        }));
    } catch (error) {
        logger.warn('Sync batch error:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Sync batch failed' }, { status: 500 });
    }
}

async function syncOne(
    repo: RepoMetadata,
    item: QueueItem,
    phase: BatchPhase,
    github: GitHubClient,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    githubUserId: string,
): Promise<void> {
    if (phase === 'metadata') {
        await syncRepoMetadata(repo, db);
        // Repos in the user's own list were confirmed by their token (CWE-639);
        // default repos are known-public and need no grant.
        if (!item.isDefault) await grantRepoAccess(db, repo.fullName, githubUserId);
        return;
    }
    await syncRepo(repo, github, db);
}
