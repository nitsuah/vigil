import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { generateRoadmapSuggestions } from '@/lib/ai';
import logger from '@/lib/log';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';

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
        const denied = await denyIfNoRepoAccess(repoName, session);
        if (denied) return denied;
        const body = await request.json().catch(() => ({}));
        const userPrompt: string | undefined =
            typeof body.userPrompt === 'string' ? body.userPrompt.trim() || undefined : undefined;

        const db = getNeonClient();

        const repoRows = await db`
            SELECT language, health_score
            FROM repos WHERE name = ${repoName} LIMIT 1
        `;
        if (repoRows.length === 0) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }
        const repo = repoRows[0];

        const itemRows = await db`
            SELECT title, quarter, status
            FROM roadmap_items
            WHERE repo_id = (SELECT id FROM repos WHERE name = ${repoName})
            ORDER BY quarter NULLS LAST, created_at ASC
        `;

        const suggestions = await generateRoadmapSuggestions(repoName, {
            language: repo.language,
            healthScore: repo.health_score,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            existingItems: itemRows.map((r: any) => ({
                title: r.title as string,
                quarter: r.quarter as string | null,
                status: r.status as string,
            })),
            userPrompt,
        });

        if (!suggestions) {
            return NextResponse.json(
                { error: 'AI provider unavailable — check API key configuration' },
                { status: 503 }
            );
        }

        return NextResponse.json({ suggestions });
    } catch (error: unknown) {
        logger.warn('Error generating roadmap suggestions:', error);
        return NextResponse.json({ error: 'Failed to suggest roadmap items' }, { status: 500 });
    }
}
