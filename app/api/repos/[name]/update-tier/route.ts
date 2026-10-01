import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { hasRepoGrant } from '@/lib/repo-access';
import { isRepoTier } from '@/lib/repo-tier';
import logger from '@/lib/log';

/**
 * Set (or clear, with `tier: null`) a repo's importance tier.
 *
 * Same write check as update-health-profile: `repos` rows are shared by every
 * user, so only repos the caller's own token has synced or added (a
 * repo_access grant) may be re-tiered.
 */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ name: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json().catch(() => null);
    const tier = (body as { tier?: unknown } | null)?.tier;
    if (tier !== null && !isRepoTier(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    const params = await props.params;
    const repoName = params.name;
    const db = getNeonClient();
    await ensureSchema(db);

    const candidates = await db`SELECT id FROM repos WHERE name = ${repoName}`;
    const writable = [];
    for (const row of candidates) {
      if (await hasRepoGrant(db, row.id, session.userId)) writable.push(row);
    }
    if (writable.length === 0) {
      // 404 (not 403) so a private repo's existence isn't confirmed.
      return NextResponse.json({ error: 'Repo not found' }, { status: 404 });
    }
    if (writable.length > 1) {
      return NextResponse.json(
        { error: `Repository name ${repoName} is ambiguous; sync it again to disambiguate` },
        { status: 409 }
      );
    }

    await db`
      UPDATE repos
      SET tier = ${tier}, updated_at = NOW()
      WHERE id = ${writable[0].id}
    `;

    return NextResponse.json({ success: true, tier });
  } catch (error: unknown) {
    logger.warn('Error updating repo tier:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
