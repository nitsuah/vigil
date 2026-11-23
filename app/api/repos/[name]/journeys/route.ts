import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient } from '@/lib/db';
import logger from '@/lib/log';
import { createOctokitClient } from '@/lib/githubClient';
import { denyIfNoRepoAccess } from '@/lib/repo-access-guard';
import { fetchJourneysHealth } from '@/lib/journeys-metrics';

export async function GET(
    _req: NextRequest,
    props: { params: Promise<{ name: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (!session.accessToken) {
            return NextResponse.json({ error: 'No GitHub access token' }, { status: 401 });
        }
        const { name } = await props.params;
        const denied = await denyIfNoRepoAccess(name, session);
        if (denied) return denied;

        const db = getNeonClient();
        const rows = await db`SELECT full_name FROM repos WHERE name = ${name} ORDER BY full_name LIMIT 1`;
        const fullName = rows[0]?.full_name as string | undefined;
        if (!fullName) {
            return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
        }
        const [owner, repo] = fullName.split('/');
        const health = await fetchJourneysHealth(createOctokitClient(session.accessToken), owner, repo);
        return NextResponse.json({ health });
    } catch (error) {
        logger.warn('[journeys] Failed to read journeys health:', error);
        return NextResponse.json({ error: 'Failed to read journeys health' }, { status: 502 });
    }
}
