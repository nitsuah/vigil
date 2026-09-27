import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import logger from '@/lib/log';
import { relationshipScope } from '@/lib/relationship-access';
import {
    listRelationships, parseRelationshipInput, upsertRelationship,
    RelationshipValidationError, RELATIONSHIP_KINDS,
} from '@/lib/relationships';

export const runtime = 'nodejs';

/** Bulk imports (e.g. from an Obsidian export) are capped per request. */
const MAX_IMPORT = 200;

/**
 * GET /api/relationships — every cross-repo edge touching a repo this session
 * may access, plus the kind vocabulary (for the PMO relationship map).
 */
export async function GET() {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const db = getNeonClient();
        await ensureSchema(db);
        const scope = await relationshipScope(db, session.userId);
        const relationships = (await listRelationships(db)).filter(scope.allows);
        return NextResponse.json({ relationships, kinds: RELATIONSHIP_KINDS });
    } catch (error) {
        logger.warn('Error listing relationships:', error);
        return NextResponse.json({ error: 'Failed to load relationships' }, { status: 500 });
    }
}

/**
 * POST /api/relationships
 *   { source, target, kind, context, evidence? }  → one edge, confirmed (a person added it)
 *   { relationships: [ ...same shape ] }          → bulk import; each edge lands as proposed
 * At least one endpoint must be a repo this session may access.
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: Record<string, unknown>;
    try {
        body = await req.json() as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
    }
    const createdBy = session.userId ? `github:${session.userId}` : null;

    try {
        const db = getNeonClient();
        await ensureSchema(db);
        const scope = await relationshipScope(db, session.userId);

        if (Array.isArray(body.relationships)) {
            const items = body.relationships as Record<string, unknown>[];
            if (items.length > MAX_IMPORT) {
                return NextResponse.json({ error: `At most ${MAX_IMPORT} relationships per import` }, { status: 400 });
            }
            const results = [];
            for (const [index, item] of items.entries()) {
                try {
                    const input = parseRelationshipInput(item ?? {}, scope.known);
                    if (!scope.allows(input)) throw new RelationshipValidationError('neither endpoint is a repo you can access');
                    const { relationship, created } = await upsertRelationship(db, input, 'import', createdBy);
                    results.push({ index, ok: true, created, id: relationship.id });
                } catch (e) {
                    if (!(e instanceof RelationshipValidationError)) throw e;
                    results.push({ index, ok: false, error: e.message });
                }
            }
            return NextResponse.json({ imported: results.filter((r) => r.ok).length, results });
        }

        const input = parseRelationshipInput(body, scope.known);
        if (!scope.allows(input)) {
            return NextResponse.json({ error: 'Neither endpoint is a repo you can access' }, { status: 403 });
        }
        const { relationship, created } = await upsertRelationship(db, input, 'manual', createdBy);
        return NextResponse.json({ relationship }, { status: created ? 201 : 200 });
    } catch (error) {
        if (error instanceof RelationshipValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        logger.warn('Error saving relationship:', error);
        return NextResponse.json({ error: 'Failed to save relationship' }, { status: 500 });
    }
}
