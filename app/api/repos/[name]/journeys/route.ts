import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import logger from '@/lib/log';
import { createOctokitClient } from '@/lib/githubClient';
import { resolveReadableRepo } from '@/lib/repo-access-guard';
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
        // The row this caller may see, not just the first with that short name.
        const resolved = await resolveReadableRepo(name, session);
        if (resolved.response) return resolved.response;
        const [owner, repo] = resolved.fullName.split('/');
        const health = await fetchJourneysHealth(createOctokitClient(session.accessToken), owner, repo);
        return NextResponse.json({ health });
    } catch (error) {
        logger.warn('[journeys] Failed to read journeys health:', error);
        return NextResponse.json({ error: 'Failed to read journeys health' }, { status: 502 });
    }
}
