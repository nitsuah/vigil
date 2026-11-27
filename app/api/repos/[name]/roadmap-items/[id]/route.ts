import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/log';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { resolveWritableRepo } from '@/lib/repo-access-guard';

// Links a roadmap item to a tracked PR and/or an Agent Task Queue entry, so
// DEV-flow handoff state is visible in the per-repo roadmap progress view.
export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ name: string; id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { name: repoName, id } = await props.params;
        if (!repoName || !id) {
            return NextResponse.json({ error: 'Repo name and roadmap item id required' }, { status: 400 });
        }
        const resolved = await resolveWritableRepo(repoName, session);
        if (resolved.response) return resolved.response;

        const { linkedPrNumber, agentTaskId } = await request.json();

        if (linkedPrNumber === undefined && agentTaskId === undefined) {
            return NextResponse.json({ error: 'linkedPrNumber or agentTaskId required' }, { status: 400 });
        }
        if (linkedPrNumber !== undefined && linkedPrNumber !== null &&
            (!Number.isInteger(linkedPrNumber) || linkedPrNumber <= 0)) {
            return NextResponse.json({ error: 'linkedPrNumber must be a positive integer or null' }, { status: 400 });
        }
        if (agentTaskId !== undefined && agentTaskId !== null && typeof agentTaskId !== 'string') {
            return NextResponse.json({ error: 'agentTaskId must be a string or null' }, { status: 400 });
        }

        const db = getNeonClient();
        const setLinkedPr = linkedPrNumber !== undefined;
        const setAgentTask = agentTaskId !== undefined;

        // Only touch the fields explicitly provided, so passing `null` clears
        // a field while omitting it leaves the existing value untouched.
        let rows;
        if (setLinkedPr && setAgentTask) {
            rows = await db`
                UPDATE roadmap_items
                SET linked_pr_number = ${linkedPrNumber}, agent_task_id = ${agentTaskId}, updated_at = NOW()
                WHERE id = ${id} AND repo_id = ${resolved.repo.id}
                RETURNING id, linked_pr_number, agent_task_id
            `;
        } else if (setLinkedPr) {
            rows = await db`
                UPDATE roadmap_items
                SET linked_pr_number = ${linkedPrNumber}, updated_at = NOW()
                WHERE id = ${id} AND repo_id = ${resolved.repo.id}
                RETURNING id, linked_pr_number, agent_task_id
            `;
        } else {
            rows = await db`
                UPDATE roadmap_items
                SET agent_task_id = ${agentTaskId}, updated_at = NOW()
                WHERE id = ${id} AND repo_id = ${resolved.repo.id}
                RETURNING id, linked_pr_number, agent_task_id
            `;
        }

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Roadmap item not found for this repo' }, { status: 404 });
        }

        return NextResponse.json({ success: true, item: rows[0] });
    } catch (error: unknown) {
        logger.warn('Error linking roadmap item:', error);
        return NextResponse.json({ error: 'Failed to update roadmap item' }, { status: 500 });
    }
}
