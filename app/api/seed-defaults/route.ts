import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { GitHubClient } from '@/lib/github';
import { syncRepo } from '@/lib/sync';
import { DEFAULT_REPOS } from '@/lib/default-repos';
import logger from '@/lib/log';

/** Minimum gap between seeding runs per signed-in user (the run spends the server GitHub token). */
const SEED_COOLDOWN_MS = 5 * 60_000;
const MAX_TRACKED_USERS = 1_000;
const lastSeedRun = new Map<string, number>();

/** Claims a run slot for `key`; returns the seconds to wait when still cooling down, else 0. */
function claimSeedSlot(key: string, now: number = Date.now()): number {
    for (const [k, t] of lastSeedRun) {
        if (now - t >= SEED_COOLDOWN_MS) lastSeedRun.delete(k);
    }
    const last = lastSeedRun.get(key);
    if (last !== undefined && now - last < SEED_COOLDOWN_MS) {
        return Math.ceil((SEED_COOLDOWN_MS - (now - last)) / 1000);
    }
    if (lastSeedRun.size >= MAX_TRACKED_USERS) {
        const oldest = lastSeedRun.keys().next();
        if (!oldest.done) lastSeedRun.delete(oldest.value);
    }
    lastSeedRun.set(key, now);
    return 0;
}

export async function POST() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
    }

    const retryAfter = claimSeedSlot(session.userId ?? session.user.email ?? session.user.name ?? 'unknown');
    if (retryAfter > 0) {
        return NextResponse.json(
            { error: 'Seeding was run recently; try again later' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
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
