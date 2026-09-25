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

export async function createSyncProgress(sessionId: string, githubUserId: string, totalRepos: number): Promise<void> {
  const db = getNeonClient();
  await db`
    INSERT INTO sync_progress (session_id, github_user_id, total_repos, completed_repos, current_repo, phase)
    VALUES (${sessionId}, ${githubUserId}, ${totalRepos}, 0, '', 'metadata')
  `;
}

export async function updateSyncProgress(
  sessionId: string,
  updates: Partial<Omit<SyncProgress, 'sessionId' | 'githubUserId' | 'startedAt' | 'updatedAt'>>
): Promise<void> {
  const db = getNeonClient();

  // Build SET clause dynamically - Neon tagged templates don't support dynamic SQL
  // Use individual updates with early return for simplicity
  if (updates.totalRepos !== undefined) {
    await db`UPDATE sync_progress SET total_repos = ${updates.totalRepos}, updated_at = NOW() WHERE session_id = ${sessionId}`;
  }
  if (updates.completedRepos !== undefined) {
    await db`UPDATE sync_progress SET completed_repos = ${updates.completedRepos}, updated_at = NOW() WHERE session_id = ${sessionId}`;
  }
  if (updates.currentRepo !== undefined) {
    await db`UPDATE sync_progress SET current_repo = ${updates.currentRepo}, updated_at = NOW() WHERE session_id = ${sessionId}`;
  }
  if (updates.phase !== undefined) {
    await db`UPDATE sync_progress SET phase = ${updates.phase}, updated_at = NOW() WHERE session_id = ${sessionId}`;
  }
}

export async function getSyncProgress(sessionId: string): Promise<SyncProgress | undefined> {
  const db = getNeonClient();
  const rows = await db`
    SELECT session_id, github_user_id, total_repos, completed_repos, current_repo, phase, started_at, updated_at
    FROM sync_progress
    WHERE session_id = ${sessionId}
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

export async function deleteSyncProgress(sessionId: string): Promise<void> {
  const db = getNeonClient();
  await db`DELETE FROM sync_progress WHERE session_id = ${sessionId}`;
}

export function getProgressPercentage(progress: SyncProgress): number {
  if (progress.totalRepos === 0) return 100;
  return Math.min(Math.round((progress.completedRepos / progress.totalRepos) * 100), 100);
}

export async function getProgressWithPercentage(sessionId: string): Promise<(SyncProgress & { progressPercentage: number }) | undefined> {
  const progress = await getSyncProgress(sessionId);
  if (!progress) return undefined;
  return {
    ...progress,
    progressPercentage: getProgressPercentage(progress),
  };
}
