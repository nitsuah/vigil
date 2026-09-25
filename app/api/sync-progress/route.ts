import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProgressWithPercentage, deleteSyncProgress } from '@/lib/sync-progress';

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
  const progress = await getProgressWithPercentage(sessionId, userId);
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
  const userId = await requireGithubUserId();
  if (userId instanceof NextResponse) return userId;

  await deleteSyncProgress(sessionId, userId);
  return NextResponse.json({ success: true });
}
