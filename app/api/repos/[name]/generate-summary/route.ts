
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { getNeonClient } from '@/lib/db';
import { generateRepoSummary } from '@/lib/ai';
import logger from '@/lib/log';
import { resolveWritableRepo } from '@/lib/repo-access-guard';

export async function POST(
    request: NextRequest,
    props: { params: Promise<{ name: string }> }
) {
    const params = await props.params;
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const repoName = params.name;
        const resolved = await resolveWritableRepo(repoName, session);
        if (resolved.response) return resolved.response;
        const db = getNeonClient();

        const fullName = resolved.repo.full_name;
        const owner = fullName.split('/')[0];

        // Initialize GitHub client
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const githubToken = (session as any).accessToken;
        if (!githubToken) throw new Error('GitHub access token not found in session');
        const github = new GitHubClient(githubToken, owner);

        // Fetch docs content
        const docsToFetch = ['README.md', 'package.json', 'requirements.txt', 'go.mod', 'Cargo.toml'];
        const files: Record<string, string> = {};

        for (const file of docsToFetch) {
            const content = await github.getFileContent(repoName, file);
            if (content) {
                files[file] = content;
            }
        }

        if (Object.keys(files).length === 0) {
            return NextResponse.json({ error: 'No documentation files found to analyze' }, { status: 400 });
        }

        // Generate summary
        const summary = await generateRepoSummary(repoName, files);

        if (!summary) {
            return NextResponse.json({ error: 'Failed to generate summary (check API key)' }, { status: 500 });
        }

        // Save to DB
        await db`
            UPDATE repos 
            SET ai_summary = ${summary}
            WHERE id = ${resolved.repo.id}
        `;

        return NextResponse.json({ success: true, summary });
    } catch (error: unknown) {
        logger.warn('Error generating summary:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
