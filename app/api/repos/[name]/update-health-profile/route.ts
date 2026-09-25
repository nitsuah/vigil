import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { hasRepoGrant } from '@/lib/repo-access';
import { calculateHealthScore } from '@/lib/health-score';
import { buildHealthScoreInputs, type RepoHealthFields, type RepoHealthRows } from '@/lib/health-score-inputs';
import { isHealthProfileId } from '@/lib/health-profiles';
import { normalizeRepoRow } from '@/lib/numeric';
import logger from '@/lib/log';

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
    const profile = (body as { profile?: unknown } | null)?.profile;
    if (!isHealthProfileId(profile)) {
      return NextResponse.json({ error: 'Invalid health profile' }, { status: 400 });
    }

    const params = await props.params;
    const repoName = params.name;
    const db = getNeonClient();
    await ensureSchema(db);

    // `name` isn't unique across owners, and `repos` rows are shared by every
    // user, so this is a write check: only repos the caller's own token has
    // synced or added (a repo_access grant) qualify -- read access to a public
    // or default repo isn't enough to change its score for everyone.
    const candidates = await db`SELECT * FROM repos WHERE name = ${repoName}`;
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
    const repo = writable[0];

    const [docStatuses, bestPractices, communityStandards, metrics] = await Promise.all([
      db`SELECT * FROM doc_status WHERE repo_id = ${repo.id}`,
      db`SELECT * FROM best_practices WHERE repo_id = ${repo.id}`,
      db`SELECT * FROM community_standards WHERE repo_id = ${repo.id}`,
      db`SELECT * FROM metrics WHERE repo_id = ${repo.id} ORDER BY timestamp DESC`,
    ]);

    const healthScore = calculateHealthScore(
      buildHealthScoreInputs(
        { ...(repo as RepoHealthFields), health_profile: profile },
        { docStatuses, bestPractices, communityStandards, metrics } as RepoHealthRows
      )
    );

    // Profile and score change together, so the row never pairs one
    // profile with a score computed under another.
    const [updatedRepo] = await db`
      UPDATE repos
      SET health_profile = ${profile}, health_score = ${healthScore.total}, updated_at = NOW()
      WHERE id = ${repo.id}
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      profile,
      healthScore,
      updatedRepo: normalizeRepoRow(updatedRepo),
    });
  } catch (error: unknown) {
    logger.warn('Error updating health profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
