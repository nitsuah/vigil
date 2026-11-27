
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/log';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient } from '@/lib/db';
import { syncRepo } from '@/lib/sync';
import { grantRepoAccess } from '@/lib/repo-access';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { url, type } = await request.json();
        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        const repoType = type || 'unknown';

        // Parse owner/repo from URL
        // Supports:
        // - https://github.com/owner/repo
        // - owner/repo
        let owner = '';
        let repo = '';

        if (url.startsWith('http')) {
            const parts = url.split('github.com/');
            if (parts.length < 2) {
                return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 });
            }
            const pathParts = parts[1].split('/');
            owner = pathParts[0];
            repo = pathParts[1];
        } else {
            const parts = url.split('/');
            if (parts.length !== 2) {
                return NextResponse.json({ error: 'Invalid format. Use "owner/repo" or full URL' }, { status: 400 });
            }
            owner = parts[0];
            repo = parts[1];
        }

        // Remove .git if present
        repo = repo.replace('.git', '');

        // Initialize GitHub client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubToken = (session as any).accessToken;
        if (!githubToken) throw new Error('GitHub access token not found in session');
        const github = new GitHubClient(githubToken, owner);

        // Fetch repo metadata
        let repoMeta;
        try {
            repoMeta = await github.getRepo(owner, repo);
        } catch (e: unknown) {
            if (typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === 404) {
                return NextResponse.json({ error: 'Repository not found on GitHub' }, { status: 404 });
            }
            throw e;
        }

        // Sync repo (inserts into DB and fetches docs)
        const db = getNeonClient();
        await syncRepo(repoMeta, github, db);

        // repoMeta was just fetched with this user's own GitHub token, so
        // GitHub itself confirmed they can see it -- record that (CWE-639).
        await grantRepoAccess(db, repoMeta.fullName, session.userId);

        // Ensure repo is visible and update repo type if provided
        // Match on the owner-qualified full name: short names collide across owners.
        if (repoType && repoType !== 'unknown') {
            await db`
                UPDATE repos 
                SET repo_type = ${repoType}, is_hidden = FALSE
                WHERE full_name = ${repoMeta.fullName}
            `;
        } else {
            await db`
                UPDATE repos 
                SET is_hidden = FALSE
                WHERE full_name = ${repoMeta.fullName}
            `;
        }

        return NextResponse.json({ success: true, repo: repoMeta });
    } catch (error: unknown) {
        logger.warn('Error adding repo:', error);
        return NextResponse.json({ error: 'Failed to add repository' }, { status: 500 });
    }
}
