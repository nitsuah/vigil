import { NextResponse } from 'next/server';
import { getProgressWithPercentage } from '@/lib/sync-progress';

export async function GET(request: Request): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
        return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const progress = getProgressWithPercentage(sessionId);
    if (!progress) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json(progress);
}