import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import logger from '@/lib/log';
import { relationshipScope } from '@/lib/relationship-access';
import {
    CONTEXT_MAX, CONTEXT_MIN, EVIDENCE_MAX,
    deleteRelationship, getRelationship, updateRelationship,
} from '@/lib/relationships';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

/** Load the edge and check the session may touch it; a NextResponse means stop. */
async function authorize(ctx: Ctx) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await ctx.params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const db = getNeonClient();
    await ensureSchema(db);
    const existing = await getRelationship(db, id);
    // Out-of-scope edges get the same 404 as missing ones, so ids can't be probed.
    if (!existing || !(await relationshipScope(db, session.userId)).allows(existing)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return { db, id };
}

/**
 * PATCH /api/relationships/[id]  { confirm?: true, context?, evidence? }
 * How a person accepts an agent's or an import's proposed edge, or rewords one.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
    try {
        const a = await authorize(ctx);
        if (a instanceof NextResponse) return a;

        let body: Record<string, unknown>;
        try {
            body = await req.json() as Record<string, unknown>;
        } catch {
            return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
        }
        const patch: { context?: string; evidence?: string | null; confirm?: boolean } = { confirm: body.confirm === true };
        if (body.context !== undefined) {
            const context = typeof body.context === 'string' ? body.context.trim() : '';
            if (context.length < CONTEXT_MIN || context.length > CONTEXT_MAX) {
                return NextResponse.json({ error: `context must be ${CONTEXT_MIN}-${CONTEXT_MAX} characters` }, { status: 400 });
            }
            patch.context = context;
        }
        if (body.evidence !== undefined) {
            const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : '';
            if (evidence.length > EVIDENCE_MAX) {
                return NextResponse.json({ error: `evidence must be at most ${EVIDENCE_MAX} characters` }, { status: 400 });
            }
            patch.evidence = evidence || null;
        }
        const relationship = await updateRelationship(a.db, a.id, patch);
        return NextResponse.json({ relationship });
    } catch (error) {
        logger.warn('Error updating relationship:', error);
        return NextResponse.json({ error: 'Failed to update relationship' }, { status: 500 });
    }
}

/** DELETE /api/relationships/[id] — remove an edge (also how a proposal is rejected). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
    try {
        const a = await authorize(ctx);
        if (a instanceof NextResponse) return a;
        await deleteRelationship(a.db, a.id);
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        logger.warn('Error deleting relationship:', error);
        return NextResponse.json({ error: 'Failed to delete relationship' }, { status: 500 });
    }
}
