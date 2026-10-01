"use client";

import React, { Fragment, useEffect, useMemo, useRef } from 'react';
import {
  GitPullRequest,
  AlertCircle,
  Shield,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  X,
  BookOpen,
  Map,
  ListTodo,
  Activity,
  Sparkles,
  MessageSquare,
  GitBranch,
} from 'lucide-react';
import ExpandableRow from '@/components/ExpandableRow';
import { Repo, RepoDetails } from '@/types/repo';
import { detectRepoType, RepoType } from '@/lib/repo-type';
import { calculateDocHealth } from '@/lib/doc-health';
import { getHealthGrade } from '@/lib/dashboard-utils';
import { detectActivityState, ActivityState, MAINTENANCE_MODE_DAYS } from '@/lib/repo-signals';
import { HealthBreakdown } from './repo-row/HealthBreakdown';
import { TypeEditor } from './repo-row/TypeEditor';
import { TierEditor } from './repo-row/TierEditor';
import { getTypeIcon } from './repo-row/repo-row-utils';

interface MobileRepoCardProps {
  repo: Repo;
  details: RepoDetails | undefined;
  isLoadingDetails?: boolean;
  isExpanded: boolean;
  syncingRepo: string | null;
  generatingSummary: string | null;
  isAuthenticated?: boolean;
  onToggleHealth: () => void;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onFixAllDocs: () => void;
  onFixDoc: (docType: string) => void;
  onFixStandard: (standardType: string) => void;
  onFixAllStandards: () => void;
  onFixPractice: (practiceType: string) => void;
  onFixAllPractices: () => void;
  onGenerateSummary: () => void;
  onSyncSingleRepo: () => void;
  onUnhide?: () => void;
  onOpenChat?: () => void;
}

const DOC_ICONS = [
  { type: 'readme',  Icon: BookOpen, label: 'README',  color: 'text-cyan-400' },
  { type: 'roadmap', Icon: Map,      label: 'Roadmap', color: 'text-purple-400' },
  { type: 'tasks',   Icon: ListTodo, label: 'Tasks',   color: 'text-blue-400' },
  { type: 'metrics', Icon: Activity, label: 'Metrics', color: 'text-green-400' },
  { type: 'features',Icon: Sparkles, label: 'Features',color: 'text-yellow-400' },
] as const;

export function MobileRepoCard({
  repo,
  details,
  isLoadingDetails = false,
  isExpanded,
  syncingRepo,
  generatingSummary,
  isAuthenticated = true,
  onToggleHealth,
  onToggleExpanded,
  onRemove,
  onFixAllDocs,
  onFixDoc,
  onFixStandard,
  onFixAllStandards,
  onFixPractice,
  onFixAllPractices,
  onGenerateSummary,
  onSyncSingleRepo,
  onUnhide,
  onOpenChat,
}: MobileRepoCardProps) {
  const repoType = repo.repo_type
    ? (repo.repo_type as RepoType)
    : detectRepoType(repo.name, repo.description, repo.language, repo.topics).type;

  const docHealth = details ? calculateDocHealth(details.docStatuses, repoType) : null;
  const health = getHealthGrade(repo.health_score || 0);

  const docIconState = useMemo(() => {
    if (!details) return null;
    return DOC_ICONS.map(({ type, Icon, label, color }) => {
      const doc = details.docStatuses.find(d => d.doc_type === type);
      const exists = doc?.exists ?? false;
      const healthState = doc?.health_state ?? (exists ? 'healthy' : 'missing');
      return { type, Icon, label, color, exists, healthState };
    });
  }, [details]);

  const blocked = repo.prs_blocked_count ?? 0;

  // Mobile/half-width sync is a long-press on the refresh icon rather than a
  // plain tap — the actions row is dense enough here that a stray tap
  // shouldn't kick off a background sync. Pointer events cover touch + mouse.
  const LONG_PRESS_MS = 550;
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const clearPressTimer = (): void => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const startLongPress = (): void => {
    longPressFiredRef.current = false;
    clearPressTimer();
    pressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onSyncSingleRepo();
    }, LONG_PRESS_MS);
  };
  // onPointerUp/onPointerLeave don't fire for every way a press can end
  // (pointercancel — e.g. a scroll takeover — or the component unmounting
  // mid-press), which would otherwise let the pending timeout fire
  // onSyncSingleRepo() after the interaction is over.
  useEffect(() => clearPressTimer, []);

  return (
    <Fragment>
      <div
        className={`relative transition-colors border-b border-slate-700/30 ${
          repo.is_hidden
            ? 'bg-slate-900/40 text-slate-500'
            : 'bg-gradient-to-r from-slate-900/60 via-slate-800/40 to-slate-900/60 active:from-slate-800/70 active:via-slate-700/50 active:to-slate-800/70'
        }`}
      >
        {/*
          Expand/collapse control lives as its own full-card button, a SIBLING
          of the interactive content below (not an ancestor of it). It sits
          behind the content (z-0) and is only reachable by the browser's hit
          testing where the content above it has `pointer-events-none`, so
          nothing needs `stopPropagation()` — there's no parent/child
          interactive nesting left for clicks to fight over.
        */}
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={`mobile-card-details-${repo.name}`}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${repo.name} card details`}
          onClick={onToggleExpanded}
          className="absolute inset-0 z-0 h-full w-full cursor-pointer"
        />
        <div className="relative z-10 px-3 py-2.5 space-y-1.5 pointer-events-none">
          {/* Row 1: type + name + live + actions */}
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className={`pointer-events-auto ${repo.is_hidden ? 'opacity-50 grayscale' : ''}`}>
                <TypeEditor
                  repoType={repoType}
                  repoName={repo.name}
                  getTypeIcon={getTypeIcon}
                  isAuthenticated={isAuthenticated}
                />
              </div>
              <div className={`pointer-events-auto ${repo.is_hidden ? 'opacity-50 grayscale' : ''}`}>
                <TierEditor
                  tier={repo.tier}
                  repoName={repo.name}
                  isAuthenticated={isAuthenticated}
                />
              </div>
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`pointer-events-auto font-medium text-sm truncate hover:underline ${
                  repo.is_hidden
                    ? 'text-slate-500 hover:text-slate-400'
                    : 'text-blue-400 hover:text-blue-300'
                }`}
              >
                {repo.name}
              </a>
              {repo.homepage && (
                <a
                  href={repo.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit ${repo.name} homepage`}
                  className={`pointer-events-auto p-0.5 rounded shrink-0 transition-colors ${
                    repo.is_hidden
                      ? 'bg-slate-800 text-slate-600'
                      : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                </a>
              )}
              {!repo.is_hidden && detectActivityState(repo.last_commit_date) === ActivityState.Maintenance && (
                <span
                  className="pointer-events-auto px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 text-[10px] font-semibold uppercase tracking-wide shrink-0"
                  title={`No commits in ${MAINTENANCE_MODE_DAYS}+ days — maintenance mode`}
                >
                  maintenance
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {repo.ci_status && repo.ci_status !== 'unknown' && (
                <a
                  href={`${repo.url}/actions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`pointer-events-auto p-1 rounded transition-colors ${
                    repo.ci_status === 'passing'
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  }`}
                  title={`CI: ${repo.ci_status}`}
                >
                  {repo.ci_status === 'passing'
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : <XCircle className="h-3.5 w-3.5" />}
                </a>
              )}
              {repo.is_hidden ? (
                <button
                  type="button"
                  onClick={() => onUnhide?.()}
                  className="pointer-events-auto px-2 py-0.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Restore
                </button>
              ) : (
                <>
                  {onOpenChat && (
                    <button
                      type="button"
                      onClick={() => onOpenChat()}
                      className="pointer-events-auto p-1 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded transition-colors"
                      title={`Chat about ${repo.name}`}
                      aria-label={`Chat about ${repo.name}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isAuthenticated && (
                    <button
                      type="button"
                      aria-label={syncingRepo === repo.name ? 'Syncing…' : 'Hold to sync this repository'}
                      title={syncingRepo === repo.name ? 'Syncing…' : 'Hold to sync'}
                      // A plain tap is intentionally a no-op — sync only
                      // fires from the long press below.
                      onPointerDown={startLongPress}
                      onPointerUp={clearPressTimer}
                      onPointerLeave={clearPressTimer}
                      onPointerCancel={clearPressTimer}
                      onContextMenu={(e) => e.preventDefault()}
                      disabled={syncingRepo === repo.name}
                      className="pointer-events-auto p-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors disabled:opacity-50 touch-none select-none"
                      style={{ WebkitTouchCallout: 'none' }}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncingRepo === repo.name ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => onRemove()}
                      className="pointer-events-auto p-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                      title="Hide"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Row 2: health + alert badges + doc icons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Health grade */}
            <div className={`pointer-events-auto ${repo.is_hidden ? 'opacity-50 grayscale' : ''}`}>
              {details ? (
                <HealthBreakdown
                  repo={repo}
                  details={details}
                  health={health}
                  onToggle={onToggleHealth}
                />
              ) : (
                <span className={`text-base font-bold ${health.color}`}>{health.grade}</span>
              )}
            </div>

            {/* Alert badges */}
            {!repo.is_hidden && (repo.open_prs ?? 0) > 0 && (
              <a
                href={`${repo.url}/pulls`}
                target="_blank"
                rel="noopener noreferrer"
                className={`pointer-events-auto relative p-1 rounded transition-colors ${
                  blocked > 0
                    ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                    : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                }`}
                title={`${repo.open_prs} open PRs`}
              >
                <GitPullRequest className="h-3.5 w-3.5" />
                {blocked > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">
                    {blocked}
                  </span>
                )}
              </a>
            )}
            {!repo.is_hidden && (repo.stale_review_count ?? 0) > 0 && ((): React.JSX.Element => {
              const staleNumbers = repo.stale_review_pr_numbers ?? [];
              // Link straight to the (lowest-numbered) stale PR so it's a
              // one-click jump to dismiss/re-request review and merge; fall
              // back to the generic PR list only for rows synced before
              // stale_review_pr_numbers existed.
              const staleHref = staleNumbers.length > 0 ? `${repo.url}/pull/${staleNumbers[0]}` : `${repo.url}/pulls`;
              const staleTitle =
                staleNumbers.length > 0
                  ? `${repo.stale_review_count} PR(s) blocked by a stale review — all threads resolved and CI green, but review still says changes requested: #${staleNumbers.join(', #')}`
                  : `${repo.stale_review_count} PR(s) blocked by a stale review — all threads resolved and CI green, but review still says changes requested`;
              return (
                <a
                  href={staleHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto relative p-1 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded transition-colors"
                  title={staleTitle}
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">
                    {repo.stale_review_count}
                  </span>
                </a>
              );
            })()}
            {!repo.is_hidden && (repo.zombie_branch_count ?? 0) > 0 && (
              <a
                href={`${repo.url}/branches`}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto relative p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded transition-colors"
                title={`${repo.zombie_branch_count} stale branch(es) with no commits in 30+ days`}
              >
                <GitBranch className="h-3.5 w-3.5" />
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">
                  {repo.zombie_branch_count}
                </span>
              </a>
            )}
            {!repo.is_hidden && (repo.open_issues_count ?? 0) > 0 && (
              <a
                href={`${repo.url}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto relative p-1 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded transition-colors"
                title={`${repo.open_issues_count} open issues`}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">
                  {repo.open_issues_count}
                </span>
              </a>
            )}
            {!repo.is_hidden && (repo.vuln_alert_count ?? 0) > 0 && (
              <a
                href={`${repo.url}/security/dependabot`}
                target="_blank"
                rel="noopener noreferrer"
                className="pointer-events-auto relative p-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                title={`${repo.vuln_alert_count} vulnerability alerts`}
              >
                <Shield className="h-3.5 w-3.5" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center">
                  {repo.vuln_alert_count}
                </span>
              </a>
            )}

            {/* Doc status icons */}
            {!details && isLoadingDetails && (
              <div className="flex items-center gap-1 animate-pulse ml-auto" aria-label="Loading docs">
                {DOC_ICONS.map(({ type }) => (
                  <div key={type} className="h-3.5 w-3.5 rounded-full bg-slate-700/60" />
                ))}
              </div>
            )}
            {docIconState && (
              <div
                className="pointer-events-auto flex items-center gap-1 ml-auto"
                title={docHealth ? `Doc health: ${docHealth.score}%` : 'Doc status'}
              >
                {docIconState.map(({ type, Icon, label, color, exists, healthState }) => (
                  <span key={type} title={`${label}: ${healthState}`}>
                    <Icon className={`h-3.5 w-3.5 ${exists ? color : 'opacity-20'}`} />
                  </span>
                ))}
              </div>
            )}
          </div>

          {repo.description && !repo.is_hidden && (
            <p className="text-xs text-slate-500 truncate">{repo.description}</p>
          )}
        </div>
      </div>

      {isExpanded && details && (
        <div id={`mobile-card-details-${repo.name}`}>
        <ExpandableRow
          tasks={details.tasks}
          roadmapItems={details.roadmapItems}
          docStatuses={details.docStatuses}
          metrics={details.metrics}
          features={details.features}
          bestPractices={details.bestPractices}
          communityStandards={details.communityStandards}
          aiSummary={repo.ai_summary}
          isAuthenticated={isAuthenticated}
          stars={repo.stars}
          forks={repo.forks}
          branches={repo.branches_count}
          testingStatus={repo.testing_status}
          coverageScore={repo.coverage_score}
          readmeLastUpdated={repo.readme_last_updated}
          repoName={repo.name}
          repoUrl={repo.url}
          onFixDoc={(_repoName: string, docType: string) => onFixDoc(docType)}
          onFixAllDocs={() => onFixAllDocs()}
          onFixStandard={(_repoName: string, standardType: string) => onFixStandard(standardType)}
          onFixAllStandards={() => onFixAllStandards()}
          onFixPractice={(_repoName: string, practiceType: string) => onFixPractice(practiceType)}
          onFixAllPractices={() => onFixAllPractices()}
          totalLoc={repo.total_loc}
          locLanguageBreakdown={repo.loc_language_breakdown}
          testCaseCount={repo.test_case_count}
          vulnAlertCount={repo.vuln_alert_count}
          vulnCriticalCount={repo.vuln_critical_count}
          vulnHighCount={repo.vuln_high_count}
          contributorCount={repo.contributor_count}
          commitFrequency={repo.commit_frequency}
          busFactor={repo.bus_factor}
          avgPrMergeTimeHours={repo.avg_pr_merge_time_hours}
          tokenDensity={repo.token_density}
          commentToCodeRatio={repo.comment_to_code_ratio}
          onSyncSingleRepo={onSyncSingleRepo}
          syncingRepo={syncingRepo}
          repoNameForSync={repo.name}
          onGenerateSummary={onGenerateSummary}
          generatingSummary={generatingSummary === repo.name}
          securityConfig={details.securityConfig}
          isMobile
          onBack={onToggleExpanded}
        />
        </div>
      )}
    </Fragment>
  );
}
