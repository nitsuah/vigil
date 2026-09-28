"use client";

import { formatLocNumber } from '@/lib/expandable-row-utils';
import { Metric } from '@/types/repo';
import { RefreshCw } from 'lucide-react';
import { GithubIcon } from '@/components/icons/GithubIcon';
import { useEffect, useState, type JSX } from 'react';

interface RepositoryStatsSectionStaticProps {
  stars?: number;
  forks?: number;
  branches?: number;
  totalLoc?: number;
  locLanguageBreakdown?: Record<string, number>;
  contributorCount?: number;
  commitFrequency?: number;
  busFactor?: number;
  avgPrMergeTimeHours?: number;
  metrics?: Metric[];
  onSyncSingleRepo?: () => void;
  isSyncing?: boolean;
  isAuthenticated?: boolean;
  hasNoData?: boolean;
  repoUrl?: string;
  repoName?: string;
  tokenDensity?: number | null;
  commentToCodeRatio?: number | null;
  /** Initial open/closed state. Defaults to expanded (desktop behavior);
   * the mobile expanded-row layout passes false so Repository Stats starts
   * collapsed there. */
  defaultExpanded?: boolean;
}

interface TrendPoint {
  health_score: number | null;
  commit_frequency: number | null;
  avg_pr_merge_time_hours: number | null;
  captured_at: string;
}

/** Postgres NUMERIC columns arrive from the Neon driver as strings ("21.7"),
 * not numbers -- calling .toFixed() on one throws during render and, with no
 * error boundary, takes the whole page down. Coerce at the boundary. */
export function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function RepositoryStatsSectionStatic({
  stars,
  forks,
  branches,
  totalLoc,
  locLanguageBreakdown,
  contributorCount,
  commitFrequency,
  busFactor,
  avgPrMergeTimeHours,
  onSyncSingleRepo,
  isSyncing = false,
  isAuthenticated = false,
  hasNoData = false,
  repoUrl,
  repoName,
  tokenDensity,
  commentToCodeRatio,
  defaultExpanded = true,
}: RepositoryStatsSectionStaticProps): JSX.Element {
  const commitFreq = toFiniteNumber(commitFrequency);
  const prMergeHours = toFiniteNumber(avgPrMergeTimeHours);
  const tokenDens = toFiniteNumber(tokenDensity);
  const commentRatio = toFiniteNumber(commentToCodeRatio);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [trend, setTrend] = useState<TrendPoint[]>([]);

  useEffect(() => {
    if (!repoName) return;
    let cancelled = false;
    const fullName = repoUrl?.split('/').slice(-2).join('/') || '';
    const url = fullName
      ? `/api/repo-details/${encodeURIComponent(repoName)}/trend?fullName=${encodeURIComponent(fullName)}`
      : `/api/repo-details/${encodeURIComponent(repoName)}/trend`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.snapshots) setTrend(data.snapshots);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repoName, repoUrl]);
  
  return (
    <div className="bg-gradient-to-br from-cyan-900/30 via-slate-800/50 to-cyan-800/20 rounded-lg overflow-hidden border border-cyan-500/40 shadow-lg shadow-cyan-500/10 hover:border-cyan-400/50 transition-colors">
      <div
        className="w-full px-4 py-3 border-b border-cyan-500/20 cursor-pointer hover:bg-cyan-900/20 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <span>📊</span>
            <h3 className="text-sm font-semibold text-slate-200">Repository Stats</h3>
            <span className="text-slate-500 text-xs ml-2">{isExpanded ? '▼' : '▶'}</span>
          </div>
          {/* GitHub and Refresh Buttons */}
          <div className="flex items-center gap-2">
            {repoUrl && (
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-2 py-1 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded transition-colors text-xs font-medium"
                title="View on GitHub"
                onClick={(e) => e.stopPropagation()}
              >
                <GithubIcon className="h-3 w-3" />
              </a>
            )}
          {/* Refresh Button - Always Visible */}
          {onSyncSingleRepo && (hasNoData || isAuthenticated) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSyncSingleRepo();
              }}
              disabled={isSyncing}
              className="flex items-center justify-center gap-1.5 px-2 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors disabled:opacity-50 text-xs font-medium ml-2"
              title="Refresh repository data"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Refresh'}</span>
            </button>
          )}
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 py-3">
          <div className="space-y-3">
            {/* Stars */}
            {stars !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1"><span>⭐</span>Stars</span>
                <span className="text-slate-200 font-medium">{stars.toLocaleString()}</span>
              </div>
            )}

          {/* Forks */}
          {forks !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>🔀</span>Forks</span>
              <span className="text-slate-200 font-medium">{forks.toLocaleString()}</span>
            </div>
          )}

          {/* Branches */}
          {branches !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>🌿</span>Branches</span>
              <span className="text-slate-200 font-medium">{branches}</span>
            </div>
          )}

          {/* Total Lines of Code */}
          {totalLoc !== undefined && totalLoc > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>📝</span>Lines of Code</span>
              <span className="text-slate-200 font-medium">{formatLocNumber(totalLoc)}</span>
            </div>
          )}

          {/* Language Breakdown */}
          {locLanguageBreakdown && Object.keys(locLanguageBreakdown).length > 0 && (
            <div className="pt-2 border-t border-slate-700/50">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1">
                <span>💬</span>Languages
              </div>
              {Object.entries(locLanguageBreakdown)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([lang, loc]) => (
                  <div key={lang} className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-400">{lang}</span>
                    <span className="text-slate-200 font-medium">{formatLocNumber(loc)}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Contributors */}
          {contributorCount !== undefined && contributorCount > 0 && (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/50">
              <span className="text-slate-400 flex items-center gap-1"><span>🧑‍💻</span>Contributors</span>
              <span className="text-slate-200 font-medium">{contributorCount}</span>
            </div>
          )}

          {/* Commit Frequency */}
          {commitFreq !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>📅</span>Commits/Month</span>
              <span className="text-slate-200 font-medium">{commitFreq.toFixed(1)}</span>
            </div>
          )}

          {/* Bus Factor */}
          {busFactor !== undefined && busFactor > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>🚌</span>Bus Factor</span>
              <span className="text-slate-200 font-medium">{busFactor}</span>
            </div>
          )}

          {/* PR Merge Time */}
          {prMergeHours !== undefined && prMergeHours > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>⏱️</span>Avg PR Merge Time</span>
              <span className="text-slate-200 font-medium">{prMergeHours.toFixed(1)}h</span>
            </div>
          )}

          {/* Token Density */}
          {tokenDens !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>🧩</span>Token Density</span>
              <span className="text-slate-200 font-medium">{tokenDens.toFixed(1)} tok/line</span>
            </div>
          )}

          {/* Comment-to-Code Ratio */}
          {commentRatio !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>💬</span>Comment/Code</span>
              <span className="text-slate-200 font-medium">{(commentRatio * 100).toFixed(0)}%</span>
            </div>
          )}

          {/* Health Score Trend */}
          {trend.length >= 2 && (
            <div className="pt-2 border-t border-slate-700/50">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1">
                <span>📈</span>Health Trend
              </div>
              <HealthSparkline points={trend} />
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthSparkline({ points }: { points: TrendPoint[] }): JSX.Element | null {
  const values = points
    .map((p) => p.health_score)
    .filter((v): v is number => typeof v === 'number');
  if (values.length < 2) return null;

  const width = 200;
  const height = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const coords = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;
  const direction = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
  const color = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-400';

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="shrink-0">
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-cyan-400"
        />
      </svg>
      <span className={`text-xs font-medium ${color}`}>
        {direction} {last}/100
      </span>
    </div>
  );
}
