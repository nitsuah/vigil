import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { GitHubClient } from '@/lib/github';
import { syncRepo } from '@/lib/sync';
import { DEFAULT_REPOS } from '@/lib/default-repos';
import logger from '@/lib/log';
import { RateLimiter } from '@/lib/mcp-rate-limit';

/**
 * One seeding run per signed-in user per five minutes (the run spends the server GitHub token).
 * Per instance, like the /api/mcp limiter: it bounds a single caller's burst; the
 * route also requires a session, so it is not the only control.
 */
const SEED_COOLDOWN_MS = 5 * 60_000;
const seedLimiter = new RateLimiter(1, SEED_COOLDOWN_MS, 1_000);

export async function POST() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
    }

    const key = session.userId ?? session.user.email;
    if (!key) {
        // No stable identity to throttle on: refuse rather than share one bucket.
        return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
    }
    // hit() checks and records in one synchronous call, so concurrent requests cannot both pass.
    if (!seedLimiter.hit(key)) {
        return NextResponse.json(
            { error: 'Seeding was run recently; try again later' },
            { status: 429, headers: { 'Retry-After': String(SEED_COOLDOWN_MS / 1000) } }
        );
    }

    try {
        // Try to use GITHUB_TOKEN if available, otherwise use unauthenticated API
        const githubToken = process.env.GITHUB_TOKEN;
        if (!githubToken) {
            logger.info('GITHUB_TOKEN not configured - using unauthenticated GitHub API (rate limited)');
        }

        const github = new GitHubClient(githubToken ?? '', 'nitsuah');
        const db = getNeonClient();

        let syncedCount = 0;
        const errors: string[] = [];

        for (const defaultRepo of DEFAULT_REPOS) {
            try {
                logger.info(`Syncing default repo: ${defaultRepo.fullName}`);
                const repoMeta = await github.getRepo(defaultRepo.owner, defaultRepo.name);
                await syncRepo(repoMeta, github, db);
                syncedCount++;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.warn(`Failed to sync ${defaultRepo.fullName}:`, errorMessage);
                errors.push(defaultRepo.fullName);
            }
        }

        return NextResponse.json({
            success: true,
            synced: syncedCount,
            total: DEFAULT_REPOS.length,
            errors: errors.length > 0 ? errors : undefined,
            warning: !githubToken ? 'Running without GITHUB_TOKEN - rate limits apply' : undefined
        });
    } catch (error: unknown) {
        logger.warn('Error seeding default repos:', error);
        return NextResponse.json({ error: 'Failed to seed default repos' }, { status: 500 });
    }
}
