// Database-backed progress tracking for sync operations
// Replaces in-memory Map to persist across serverless invocations

import { getNeonClient } from './db';
import { parseQueue, type AdvanceResult, type BatchPhase, type QueueItem } from './sync-batch';

export interface SyncProgress {
  sessionId: string;
  githubUserId: string;
  totalRepos: number;
  completedRepos: number;
  currentRepo: string;
  phase: 'metadata' | 'health' | 'complete' | 'error';
  /** Repos that failed or were skipped; the run still completes. */
  failedRepos: number;
  startedAt: Date;
  updatedAt: Date;
}

// Rows are only needed while a sync runs and for the client's final poll;
// anything untouched this long is abandoned (tab closed, crashed sync).
const RETENTION_INTERVAL = '1 day';

export async function createSyncProgress(
  sessionId: string,
  githubUserId: string,
  totalRepos: number,
  queue: QueueItem[] = [],
): Promise<void> {
  const db = getNeonClient();
  // Nothing to do: record a finished run so the client doesn't wait on batches.
  const phase = totalRepos === 0 ? 'complete' : 'metadata';
  // One transaction: reap abandoned sessions, supersede this user's unfinished runs (including
  // legacy rows stuck in 'metadata' from before sync was client-driven), then insert. If the
  // insert fails, the previous run is left alone instead of being lost.
  await db.transaction([
    db`DELETE FROM sync_progress WHERE updated_at < NOW() - ${RETENTION_INTERVAL}::interval`,
    db`DELETE FROM sync_progress WHERE github_user_id = ${githubUserId} AND phase IN ('metadata', 'health')`,
    db`
      INSERT INTO sync_progress (session_id, github_user_id, total_repos, completed_repos, current_repo, phase, queue, cursor, failed_repos)
      VALUES (${sessionId}, ${githubUserId}, ${totalRepos}, 0, '', ${phase}, ${JSON.stringify(queue)}::jsonb, 0, 0)
    `,
  ]);
}

export async function updateSyncProgress(
  sessionId: string,
  updates: Partial<Omit<SyncProgress, 'sessionId' | 'githubUserId' | 'startedAt' | 'updatedAt' | 'failedRepos'>>
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
    SELECT session_id, github_user_id, total_repos, completed_repos, current_repo, phase, failed_repos, started_at, updated_at
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
    failedRepos: row.failed_repos ?? 0,
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

/** A run plus the server-side state a batch needs; never sent to the client. */
export interface SyncSession extends SyncProgress {
  /** null for rows created before sync was client-driven: not resumable. */
  queue: QueueItem[] | null;
  cursor: number;
}

export async function getSyncSession(sessionId: string, githubUserId: string): Promise<SyncSession | undefined> {
  const db = getNeonClient();
  const rows = await db`
    SELECT session_id, github_user_id, total_repos, completed_repos, current_repo, phase,
           failed_repos, queue, cursor, started_at, updated_at
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
    failedRepos: row.failed_repos ?? 0,
    startedAt: new Date(row.started_at),
    updatedAt: new Date(row.updated_at),
    queue: parseQueue(typeof row.queue === 'string' ? safeJson(row.queue) : row.queue),
    cursor: row.cursor ?? 0,
  };
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Move the run past a finished batch. The WHERE clause pins the phase and
 * cursor the batch started from, so a duplicate driver (second tab, retried
 * request) can't advance the run twice. Returns false when it lost that race.
 */
export async function advanceSyncSession(args: {
  sessionId: string;
  githubUserId: string;
  from: { phase: BatchPhase; cursor: number };
  to: AdvanceResult;
  failedDelta: number;
  currentRepo: string;
}): Promise<boolean> {
  const db = getNeonClient();
  const rows = await db`
    UPDATE sync_progress SET
      phase           = ${args.to.phase},
      cursor          = ${args.to.cursor},
      completed_repos = ${args.to.completedRepos},
      failed_repos    = failed_repos + ${args.failedDelta},
      current_repo    = ${args.to.phase === 'complete' ? 'Complete' : args.currentRepo},
      updated_at      = NOW()
    WHERE session_id = ${args.sessionId}
      AND github_user_id = ${args.githubUserId}
      AND phase = ${args.from.phase}
      AND cursor = ${args.from.cursor}
    RETURNING session_id
  `;
  return rows.length > 0;
}

/**
 * End a run with an error, but only if it is still where the caller found it.
 * A stale request (slow quota probe) must not turn a run that another request
 * already finished into an error.
 */
export async function failSyncSession(args: {
  sessionId: string;
  githubUserId: string;
  from: { phase: BatchPhase; cursor: number };
  currentRepo: string;
}): Promise<boolean> {
  const db = getNeonClient();
  const rows = await db`
    UPDATE sync_progress SET phase = 'error', current_repo = ${args.currentRepo}, updated_at = NOW()
    WHERE session_id = ${args.sessionId}
      AND github_user_id = ${args.githubUserId}
      AND phase = ${args.from.phase}
      AND cursor = ${args.from.cursor}
    RETURNING session_id
  `;
  return rows.length > 0;
}
