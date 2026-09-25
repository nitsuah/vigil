// Database-backed progress tracking for sync operations
// Replaces in-memory Map to persist across serverless invocations

import { getNeonClient } from './db';

export interface SyncProgress {
  sessionId: string;
  githubUserId: string;
  totalRepos: number;
  completedRepos: number;
  currentRepo: string;
  phase: 'metadata' | 'health' | 'complete' | 'error';
  startedAt: Date;
  updatedAt: Date;
}

// Rows are only needed while a sync runs and for the client's final poll;
// anything untouched this long is abandoned (tab closed, crashed sync).
const RETENTION_INTERVAL = '1 day';

export async function createSyncProgress(sessionId: string, githubUserId: string, totalRepos: number): Promise<void> {
  const db = getNeonClient();
  // Reap abandoned sessions so the table can't grow without bound.
  await db`DELETE FROM sync_progress WHERE updated_at < NOW() - ${RETENTION_INTERVAL}::interval`;
  await db`
    INSERT INTO sync_progress (session_id, github_user_id, total_repos, completed_repos, current_repo, phase)
    VALUES (${sessionId}, ${githubUserId}, ${totalRepos}, 0, '', 'metadata')
  `;
}

export async function updateSyncProgress(
  sessionId: string,
  updates: Partial<Omit<SyncProgress, 'sessionId' | 'githubUserId' | 'startedAt' | 'updatedAt'>>
): Promise<void> {
  if (
    updates.totalRepos === undefined &&
    updates.completedRepos === undefined &&
    updates.currentRepo === undefined &&
    updates.phase === undefined
  ) {
    return;
  }
  const db = getNeonClient();
  // One statement so a poll never sees a half-applied update; COALESCE keeps
  // any field the caller didn't pass.
  await db`
    UPDATE sync_progress SET
      total_repos     = COALESCE(${updates.totalRepos ?? null}::int, total_repos),
      completed_repos = COALESCE(${updates.completedRepos ?? null}::int, completed_repos),
      current_repo    = COALESCE(${updates.currentRepo ?? null}::text, current_repo),
      phase           = COALESCE(${updates.phase ?? null}::text, phase),
      updated_at      = NOW()
    WHERE session_id = ${sessionId}
  `;
}

// Reads and deletes are always scoped to the owning GitHub user: session ids
// embed the (public) GitHub id and a timestamp, so they're guessable, and
// current_repo can name private repos (CWE-639).
export async function getSyncProgress(sessionId: string, githubUserId: string): Promise<SyncProgress | undefined> {
  const db = getNeonClient();
  const rows = await db`
    SELECT session_id, github_user_id, total_repos, completed_repos, current_repo, phase, started_at, updated_at
    FROM sync_progress
    WHERE session_id = ${sessionId} AND github_user_id = ${githubUserId}
  `;

  if (rows.length === 0) return undefined;

  const row = rows[0];
  return {
    sessionId: row.session_id,
    githubUserId: row.github_user_id,
    totalRepos: row.total_repos,
    completedRepos: row.completed_repos,
    currentRepo: row.current_repo,
    phase: row.phase,
    startedAt: new Date(row.started_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function deleteSyncProgress(sessionId: string, githubUserId: string): Promise<void> {
  const db = getNeonClient();
  await db`DELETE FROM sync_progress WHERE session_id = ${sessionId} AND github_user_id = ${githubUserId}`;
}

export function getProgressPercentage(progress: SyncProgress): number {
  if (progress.totalRepos === 0) return 100;
  return Math.min(Math.round((progress.completedRepos / progress.totalRepos) * 100), 100);
}

export async function getProgressWithPercentage(
  sessionId: string,
  githubUserId: string
): Promise<(SyncProgress & { progressPercentage: number }) | undefined> {
  const progress = await getSyncProgress(sessionId, githubUserId);
  if (!progress) return undefined;
  return {
    ...progress,
    progressPercentage: getProgressPercentage(progress),
  };
}
