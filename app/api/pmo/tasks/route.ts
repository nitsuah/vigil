import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { getAccessibleRepoIds } from '@/lib/repo-access';
import { loadOpenTasks, parseOpenTaskFilters, rollupOpenTasks } from '@/lib/task-rollup';
import logger from '@/lib/log';

/**
 * GET /api/pmo/tasks — cross-repo open-task rollup for the PMO "Open work" panel.
 * Same filters as the get_open_tasks MCP tool, as query params:
 *   ?repos=vigil,skyview&priority=P0,P1&status=todo&owner=me&limit=100
 * Scoped to repos this session may access (CWE-639).
 */
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = Object.fromEntries(new URL(req.url).searchParams);
    let filters;
    try {
        filters = parseOpenTaskFilters(params);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Bad filters' }, { status: 400 });
    }

    try {
        const db = getNeonClient();
        await ensureSchema(db);
        const accessibleIds = await getAccessibleRepoIds(db, session.userId);
        return NextResponse.json(rollupOpenTasks(await loadOpenTasks(db, accessibleIds), filters));
    } catch (error: unknown) {
        logger.warn('Error fetching PMO open tasks:', error);
        return NextResponse.json({ error: 'Failed to fetch open tasks' }, { status: 500 });
    }
}
