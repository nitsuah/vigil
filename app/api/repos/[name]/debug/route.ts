import { NextResponse } from 'next/server';
import logger from '@/lib/log';
import { getNeonClient } from '@/lib/db';
import { auth } from '@/auth';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ name: string }> }
) {
    try {
        // Dumps every roadmap item, task, feature, metric and doc status for a
        // repo, so it needs the same auth + per-repo access as the other
        // by-name routes (this route previously had neither).
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const { name } = await params;
        const denied = await denyIfNoRepoAccess(name, session);
        if (denied) return denied;
        const db = getNeonClient();

        // Get repo ID
        const repos = await db`
            SELECT id, name, full_name FROM repos WHERE name = ${name}
        `;
        
        if (repos.length === 0) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }

        const repo = repos[0];
        const repoId = repo.id;

        // Get all related data
        const [roadmapItems, tasks, features, metrics, docStatus] = await Promise.all([
            db`SELECT * FROM roadmap_items WHERE repo_id = ${repoId} ORDER BY id`,
            db`SELECT * FROM tasks WHERE repo_id = ${repoId} ORDER BY id`,
            db`SELECT * FROM features WHERE repo_id = ${repoId} ORDER BY id`,
            db`SELECT * FROM metrics WHERE repo_id = ${repoId} ORDER BY id`,
            db`SELECT * FROM doc_status WHERE repo_id = ${repoId} ORDER BY doc_type`,
        ]);

        return NextResponse.json({
            repo: {
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
            },
            counts: {
                roadmap_items: roadmapItems.length,
                tasks: tasks.length,
                features: features.length,
                metrics: metrics.length,
                doc_status: docStatus.length,
            },
            data: {
                roadmap_items: roadmapItems,
                tasks: tasks,
                features: features,
                metrics: metrics,
                doc_status: docStatus,
            },
        }, { status: 200 });
    } catch (error: unknown) {
    logger.warn('Debug error:', error);
        return NextResponse.json({ error: 'Failed to load debug data' }, { status: 500 });
    }
}
