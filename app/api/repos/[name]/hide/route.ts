import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
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

        await db`
            UPDATE repos 
            SET is_hidden = TRUE 
            WHERE id = ${resolved.repo.id}
        `;

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        logger.warn('Error hiding repo:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
