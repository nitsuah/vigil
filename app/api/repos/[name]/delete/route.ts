import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import logger from '@/lib/log';
import { isOwnNamespace } from '@/lib/repo-access';
import { resolveWritableRepo } from '@/lib/repo-access-guard';

/**
 * Permanently removes a hidden repo and, through ON DELETE CASCADE, everything
 * stored for it. Nothing on GitHub changes, so a later sync adds the repo back
 * as new if GitHub still lists it.
 */
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

        const resolved = await resolveWritableRepo(params.name, session);
        const db = getNeonClient();
        let repoId: string | undefined = resolved.repo?.id;

        if (resolved.response) {
            // A repo deleted or renamed on GitHub can't be verified any more;
            // its owner may still clear it out.
            if (resolved.response.status !== 404) return resolved.response;
            const rows = await db`SELECT id, full_name FROM repos WHERE name = ${params.name} AND is_hidden = TRUE`;
            const owned: string[] = [];
            for (const row of rows) {
                if (await isOwnNamespace(row.full_name, session.accessToken)) owned.push(row.id);
            }
            if (owned.length !== 1) return resolved.response;
            repoId = owned[0];
        }

        // Only hidden repos can be deleted, so a visible one takes two deliberate steps.
        const deleted = await db`DELETE FROM repos WHERE id = ${repoId} AND is_hidden = TRUE RETURNING id`;
        if (deleted.length === 0) {
            return NextResponse.json({ error: 'Hide the repository before deleting it' }, { status: 409 });
        }
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.warn('Error deleting repo:', error);
        return NextResponse.json({ error: 'Failed to delete repository' }, { status: 500 });
    }
}
