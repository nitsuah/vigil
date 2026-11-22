import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { GitHubClient } from '@/lib/github';
import { syncRepo } from '@/lib/sync';
import { DEFAULT_REPOS } from '@/lib/default-repos';
import logger from '@/lib/log';

export async function POST() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status: 401 });
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
