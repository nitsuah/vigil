"use client";

import React from 'react';

export type SyncPhase = 'metadata' | 'health' | 'complete' | 'error';

interface ProgressToastProps {
  phase: SyncPhase;
  progress: number; // 0-100, share of repos whose health check finished
  currentRepo: string;
  totalRepos: number;
  completedRepos: number;
  onClose: () => void;
}

const STEP: Record<SyncPhase, string> = {
  metadata: 'Step 1 of 2 · Updating repo list',
  health: 'Step 2 of 2 · Health checks',
  complete: 'Done',
  error: 'Sync failed',
};

/**
 * Sync progress panel. The label comes from the server's real phase, not the
 * percentage: the percentage only moves during health checks (step 2), so
 * step 1 shows an indeterminate bar instead of sitting at "0%".
 */
export const ProgressToast = ({
  phase,
  progress,
  currentRepo,
  totalRepos,
  completedRepos,
  onClose,
}: ProgressToastProps) => {
  const counting = phase === 'health' || phase === 'complete';

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-md motion-safe:animate-slide-in" role="status" aria-label="Sync progress">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-lg shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-indigo-500/20">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${phase === 'error' ? 'bg-red-400' : phase === 'complete' ? 'bg-emerald-400' : 'bg-indigo-400 motion-safe:animate-pulse'}`} />
              <span className="text-sm font-medium text-indigo-300">Syncing repositories</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400" data-testid="sync-step">{STEP[phase]}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Hide sync progress"
            title="Hide (the sync keeps running)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-xs min-w-0">
            {phase !== 'complete' && phase !== 'error' && (
              <span className="w-3.5 h-3.5 shrink-0 border-2 border-indigo-500 border-t-transparent rounded-full motion-safe:animate-spin" />
            )}
            <span className="truncate font-mono text-slate-300" data-testid="sync-current">{currentRepo}</span>
          </div>

          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            {counting ? (
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            ) : (
              <div className="h-full w-1/3 bg-indigo-500/70 rounded-full motion-safe:animate-[indeterminate_1.4s_ease-in-out_infinite]" />
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400" data-testid="sync-count">
              {counting ? `${completedRepos} / ${totalRepos} health checks` : `${totalRepos} repositories`}
            </span>
            {counting && <span className="font-mono text-indigo-300">{progress}%</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
