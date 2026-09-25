import { NextRequest, NextResponse } from 'next/server';
import { getProgressWithPercentage, deleteSyncProgress } from '@/lib/sync-progress';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const progress = await getProgressWithPercentage(sessionId);
  if (!progress) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json(progress);
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  await deleteSyncProgress(sessionId);
  return NextResponse.json({ success: true });
}
