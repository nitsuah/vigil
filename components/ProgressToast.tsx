"use client";

import React, { useEffect, useState } from 'react';

interface ProgressToastProps {
  isVisible: boolean;
  progress: number; // 0-100
  currentRepo: string;
  totalRepos: number;
  completedRepos: number;
  onClose: () => void;
}

export const ProgressToast = ({
  isVisible,
  progress,
  currentRepo,
  totalRepos,
  completedRepos,
  onClose,
}: ProgressToastProps) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Use setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => setShow(true), 0);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    if (progress >= 100 && show) {
      // Auto-hide after completion
      const timer = setTimeout(() => {
        setShow(false);
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [progress, show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-md animate-slide-in">
      <div className="bg-slate-900 border border-indigo-500/30 rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-indigo-500/20">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
            <span className="text-sm font-medium text-indigo-300">Syncing Repositories</span>
          </div>
          <button
            onClick={() => { setShow(false); onClose(); }}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-300">{completedRepos} / {totalRepos} repositories</span>
            <span className="font-mono text-indigo-300">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Current Repo */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="truncate max-w-[200px] font-mono text-slate-300">{currentRepo}</span>
          </div>
        </div>

        {/* Phase indicator */}
        <div className="px-4 pb-3 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-4 h-4 bg-slate-700 rounded flex items-center justify-center">
              <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <span>
              {progress < 30
                ? 'Phase 1: Fast metadata sync...'
                : progress < 80
                ? 'Phase 2: Detailed health sync...'
                : 'Finalizing...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};