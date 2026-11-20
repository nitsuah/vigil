import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/log';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import { resolveWritableRepo } from '@/lib/repo-access-guard';

export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ name: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        const repoName = params.name;
        const { type } = await request.json();

        if (!repoName) {
            return NextResponse.json({ error: 'Repo name required' }, { status: 400 });
        }

        if (!type) {
            return NextResponse.json({ error: 'Type required' }, { status: 400 });
        }

        const validTypes = ['web-app', 'game', 'tool', 'library', 'bot', 'research', 'unknown'];
        if (!validTypes.includes(type)) {
            return NextResponse.json({ error: 'Invalid repo type' }, { status: 400 });
        }

        const resolved = await resolveWritableRepo(repoName, session);
        if (resolved.response) return resolved.response;
        const db = getNeonClient();

        await db`
            UPDATE repos 
            SET repo_type = ${type}, updated_at = NOW()
            WHERE id = ${resolved.repo.id}
        `;

        return NextResponse.json({ success: true, type });
    } catch (error: unknown) {
        logger.warn('Error updating repo type:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
