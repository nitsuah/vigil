
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { GitHubClient } from '@/lib/github';
import { ensureSchema, getNeonClient } from '@/lib/db';
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

        // A failure notice must not replace the last good summary.
        if (summary.startsWith('Summary unavailable')) {
            return NextResponse.json({ error: summary }, { status: 502 });
        }

        // Save to DB
        await ensureSchema(db);
        const saved = await db`
            UPDATE repos 
            SET ai_summary = ${summary}, ai_summary_generated_at = NOW()
            WHERE id = ${resolved.repo.id}
            RETURNING ai_summary_generated_at
        ` as Array<{ ai_summary_generated_at: string | Date }> | undefined;

        return NextResponse.json({ success: true, summary, generatedAt: saved?.[0]?.ai_summary_generated_at ?? null });
    } catch (error: unknown) {
        logger.warn('Error generating summary:', error);
        return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
    }
}
