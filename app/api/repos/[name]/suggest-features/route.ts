import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { generateFeatureSuggestions } from '@/lib/ai';
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
        const userPrompt: string | undefined = typeof body.userPrompt === 'string' ? body.userPrompt.trim() || undefined : undefined;

        const db = getNeonClient();

        const repoRows = await db`
            SELECT language, health_score
            FROM repos WHERE name = ${repoName} LIMIT 1
        `;
        if (repoRows.length === 0) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }
        const repo = repoRows[0];

        const [featureRows, roadmapRows] = await Promise.all([
            db`SELECT category FROM features WHERE repo_id = (SELECT id FROM repos WHERE name = ${repoName}) ORDER BY created_at ASC`,
            db`SELECT title FROM roadmap_items WHERE repo_id = (SELECT id FROM repos WHERE name = ${repoName}) AND status != 'completed' ORDER BY created_at DESC LIMIT 20`,
        ]);

        const suggestions = await generateFeatureSuggestions(repoName, {
            language: repo.language,
            healthScore: repo.health_score,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            existingFeatureCategories: featureRows.map((r: any) => r.category as string),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            plannedRoadmapItems: roadmapRows.map((r: any) => r.title as string),
            userPrompt,
        });

        if (!suggestions) {
            return NextResponse.json({ error: 'AI provider unavailable — check API key configuration' }, { status: 503 });
        }

        return NextResponse.json({ suggestions });
    } catch (error: unknown) {
        logger.warn('Error generating feature suggestions:', error);
        return NextResponse.json({ error: 'Failed to suggest features' }, { status: 500 });
    }
}
