import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getSyncSession, getProgressPercentage, deleteSyncProgress } from '@/lib/sync-progress';

// session.userId is the GitHub numeric id (auth.ts session callback) -- the same
// value sync-repos stores as github_user_id, so ownership is a plain equality.
async function requireGithubUserId(): Promise<string | NextResponse> {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!session?.user || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return userId;
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  const userId = await requireGithubUserId();
  if (userId instanceof NextResponse) return userId;

  // Another user's session reads as "not found", never as forbidden, so ids can't be probed.
  const session = await getSyncSession(sessionId, userId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // The stored queue can name private repos and never leaves the server; the cursor
  // is what a resumed driver needs to name the batch it means.
  const { queue: _queue, ...progress } = session;
  void _queue;
  return NextResponse.json({ ...progress, progressPercentage: getProgressPercentage(session) });
}

export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }
  const userId = await requireGithubUserId();
  if (userId instanceof NextResponse) return userId;

  await deleteSyncProgress(sessionId, userId);
  return NextResponse.json({ success: true });
}
