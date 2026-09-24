// Simple in-memory progress tracking for sync operations
// In production, this could be replaced with Redis or a database table

interface SyncProgress {
  totalRepos: number;
  completedRepos: number;
  currentRepo: string;
  phase: 'metadata' | 'health' | 'complete' | 'error';
  startTime: number;
}

const progressStore = new Map<string, SyncProgress>();

export function createSyncProgress(sessionId: string, totalRepos: number): void {
  progressStore.set(sessionId, {
    totalRepos,
    completedRepos: 0,
    currentRepo: '',
    phase: 'metadata',
    startTime: Date.now(),
  });
}

export function updateSyncProgress(
  sessionId: string,
  updates: Partial<SyncProgress>
): void {
  const existing = progressStore.get(sessionId);
  if (existing) {
    progressStore.set(sessionId, { ...existing, ...updates });
  }
}

export function getSyncProgress(sessionId: string): SyncProgress | undefined {
  return progressStore.get(sessionId);
}

export function deleteSyncProgress(sessionId: string): void {
  progressStore.delete(sessionId);
}

export function getProgressPercentage(progress: SyncProgress): number {
  if (progress.totalRepos === 0) return 100;
  return Math.min(Math.round((progress.completedRepos / progress.totalRepos) * 100), 100);
}

export function getProgressWithPercentage(sessionId: string): (SyncProgress & { progressPercentage: number }) | undefined {
  const progress = progressStore.get(sessionId);
  if (!progress) return undefined;
  return {
    ...progress,
    progressPercentage: getProgressPercentage(progress),
  };
}