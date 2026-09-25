"use client";

import React, { useState, useEffect } from 'react';
import { AlertCircle, Clock } from 'lucide-react';

interface RateLimitData {
  core: {
    limit: number;
    remaining: number;
    reset: string;
    used: number;
  };
  graphql: {
    limit: number;
    remaining: number;
    reset: string;
    used: number;
  };
}

interface RateLimitState {
  rateLimit: RateLimitData | null;
  loading: boolean;
  error: string | null;
}

export function useRateLimit(enabled: boolean = true): RateLimitState & { refresh: () => void } {
  const [rateLimit, setRateLimit] = useState<RateLimitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let aborted = false;
    let inflight = false;
    const controller = new AbortController();

    const fetchRateLimit = async (): Promise<void> => {
      if (inflight) return;
      inflight = true;
      try {
        const res = await fetch('/api/github-rate-limit', { signal: controller.signal, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (!aborted) { setRateLimit(data); setError(null); }
        } else {
          if (!aborted) setError('Failed to fetch rate limit');
        }
      } catch (err) {
        if (!aborted) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        inflight = false;
        if (!aborted) setLoading(false);
      }
    };

    fetchRateLimit();
    const interval = setInterval(fetchRateLimit, 60000);

    // Listen for manual refresh triggers
    const handleRefresh = () => {
      if (!aborted) setRefreshTrigger(v => v + 1);
    };
    window.addEventListener('rate-limit-refresh', handleRefresh);

    return () => {
      aborted = true;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener('rate-limit-refresh', handleRefresh);
    };
  }, [enabled, refreshTrigger]);

  const refresh = () => setRefreshTrigger(v => v + 1);

  return { rateLimit, loading, error, refresh };
}

export function RateLimitDisplay({ rateLimit, loading, error }: RateLimitState): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  // A malformed payload must hide this widget, not throw and unmount the page.
  if (loading || error || !rateLimit?.core) return null;

  const percentage = (rateLimit.core.remaining / rateLimit.core.limit) * 100;
  const resetDate = new Date(rateLimit.core.reset);
  const now = new Date();
  const minutesUntilReset = Math.max(0, Math.round((resetDate.getTime() - now.getTime()) / 60000));

  // Color tiers: plenty left (slate/neutral) -> getting low (amber) -> critical (red).
  const isCritical = percentage < 20;
  const isCaution = !isCritical && percentage < 50;
  const colorClasses = isCritical
    ? 'bg-red-900/30 text-red-300 border border-red-700/50'
    : isCaution
      ? 'bg-amber-900/30 text-amber-300 border border-amber-700/50'
      : 'bg-slate-800/50 text-slate-400 border border-transparent';

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${colorClasses}`}
      title={expanded ? 'Hide GitHub API rate limit detail' : 'Show GitHub API rate limit detail'}
      aria-label="GitHub API rate limit"
      aria-expanded={expanded}
    >
      {isCritical && <AlertCircle className="w-4 h-4" />}
      <Clock className="w-4 h-4" />
      {expanded ? (
        <>
          <span className="font-mono">
            {rateLimit.core.used}/{rateLimit.core.limit} used
          </span>
          <span className="text-xs">
            (resets in {minutesUntilReset}m)
          </span>
        </>
      ) : (
        <span className="font-mono">{rateLimit.core.remaining}</span>
      )}
    </button>
  );
}

// Convenience wrapper for standalone use
export function RateLimitIndicator(): React.JSX.Element | null {
  const state = useRateLimit();
  return <RateLimitDisplay {...state} />;
}

// Hook for components that need to trigger rate limit refresh
export function useRateLimitRefresh(): () => void {
  // Use a custom event to communicate across component tree
  return () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rate-limit-refresh'));
    }
  };
}
