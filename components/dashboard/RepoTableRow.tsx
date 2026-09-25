// Repository table row component

import React, { Fragment, useMemo } from 'react';
import {
  GitPullRequest,
  AlertCircle,
  Activity,
  Map,
  ListTodo,
  Sparkles,
  Play,
  X,
  RefreshCw,
  Shield,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BookOpen,
  MessageSquare,
  GitBranch,
  ChevronsLeft,
} from 'lucide-react';
import ExpandableRow from '@/components/ExpandableRow';
import { Repo, RepoDetails } from '@/types/repo';
import { detectRepoType, RepoType } from '@/lib/repo-type';
import { calculateDocHealth } from '@/lib/doc-health';
import {
  getHealthGrade,
  formatTimeAgo,
  getLanguageColor,
} from '@/lib/dashboard-utils';
import { getLanguageIcon } from '@/lib/language-colors';
import { detectActivityState, ActivityState, MAINTENANCE_MODE_DAYS } from '@/lib/repo-signals';
import { HealthBreakdown } from './repo-row/HealthBreakdown';
import { HealthShields } from './repo-row/HealthShields';
import { TypeEditor } from './repo-row/TypeEditor';
import { getTypeIcon } from './repo-row/repo-row-utils';

interface RepoTableRowProps {
  repo: Repo;
  details: RepoDetails | undefined;
  isLoadingDetails?: boolean;
  isExpanded: boolean;
  fixingDoc: boolean;
  syncingRepo: string | null;
  generatingSummary: string | null;
  isAuthenticated?: boolean;
  expandedHealth: boolean;
  onToggleHealth: () => void;
  expandedDocs: boolean;
  onToggleDocs: () => void;
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

export function RepoTableRow({
  repo,
  details,
  isLoadingDetails = false,
  isExpanded,
  fixingDoc,
  syncingRepo,
  generatingSummary,
  isAuthenticated = true,
  expandedHealth,
  onToggleHealth,
  expandedDocs,
  onToggleDocs,
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
}: RepoTableRowProps) {

  // Centralized repo type resolution - use stored type or detect from metadata
  const getRepoType = (): RepoType => {
    if (repo.repo_type) {
      return repo.repo_type as RepoType;
    }
    const detected = detectRepoType(repo.name, repo.description, repo.language, repo.topics);
    return detected.type;
  };

  const repoType = getRepoType();

  const docHealth = details ? calculateDocHealth(details.docStatuses, repoType) : null;
  const health = getHealthGrade(repo.health_score || 0);

  return (
    <Fragment key={repo.id}>
      <tr
        className={`transition-all duration-200 cursor-pointer border-b border-slate-700/30 ${repo.is_hidden
            ? 'bg-slate-900/40 text-slate-500 hover:bg-slate-900/60'
            : 'bg-gradient-to-r from-slate-900/60 via-slate-800/40 to-slate-900/60 hover:from-slate-800/70 hover:via-slate-700/50 hover:to-slate-800/70'
          }`}
        onClick={onToggleExpanded}
      >
        {/* Repository Name with Type and Language */}
        <td className="px-3 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2">
            {/* Type Icon */}
            <div className={repo.is_hidden ? 'opacity-50 grayscale' : ''}>
              <TypeEditor
                repoType={repoType}
                repoName={repo.name}
                getTypeIcon={getTypeIcon}
                isAuthenticated={isAuthenticated}
              />
            </div>
            {/* Repository Name */}
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`font-medium transition-colors hover:underline ${repo.is_hidden
                  ? 'text-slate-500 hover:text-slate-400 decoration-slate-600'
                  : 'text-blue-400 hover:text-blue-300'
                }`}
              onClick={(e) => e.stopPropagation()}
              data-tour="repo-name"
            >
              {repo.name}
            </a>
            {/* Homepage Play Button */}
            {repo.homepage && (
              <a
                href={repo.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-1 rounded transition-colors ${repo.is_hidden
                    ? 'bg-slate-800 text-slate-600'
                    : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  }`}
                title="Visit Homepage"
                onClick={(e) => e.stopPropagation()}
              >
                <Play className="h-4 w-4 fill-current" />
              </a>
            )}
            {!repo.is_hidden && detectActivityState(repo.last_commit_date) === ActivityState.Maintenance && (
              <span
                className="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 text-[10px] font-semibold uppercase tracking-wide"
                title={`No commits in ${MAINTENANCE_MODE_DAYS}+ days — maintenance mode`}
              >
                maintenance
              </span>
            )}
            {!repo.is_hidden && repo.open_prs !== undefined && repo.open_prs > 0 && (() => {
              const blocked = repo.prs_blocked_count ?? 0;
              const ready = repo.prs_ready_count ?? 0;
              const readinessKnown = blocked + ready > 0;
              const readinessSuffix = readinessKnown
                ? ` (${ready} ready to merge, ${blocked} blocked)`
                : '';
              return (
                <a
                  href={`${repo.url}/pulls`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative p-1 rounded transition-colors ${
                    readinessKnown && blocked === 0
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                  }`}
                  title={`${repo.open_prs} open PRs${readinessSuffix}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GitPullRequest className="h-4 w-4" />
                  {blocked > 0 && (
                    <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                      {blocked}
                    </span>
                  )}
                </a>
              );
            })()}
            {!repo.is_hidden && repo.stale_review_count !== undefined && repo.stale_review_count > 0 && ((): React.JSX.Element => {
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
                  className="relative p-1 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded transition-colors"
                  title={staleTitle}
                  onClick={(e: React.MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
                >
                  <GitPullRequest className="h-4 w-4" />
                  <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {repo.stale_review_count}
                  </span>
                </a>
              );
            })()}
            {!repo.is_hidden && repo.zombie_branch_count !== undefined && repo.zombie_branch_count > 0 && (
              <a
                href={`${repo.url}/branches`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 rounded transition-colors"
                title={`${repo.zombie_branch_count} stale branch(es) with no commits in 30+ days`}
                onClick={(e) => e.stopPropagation()}
              >
                <GitBranch className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {repo.zombie_branch_count}
                </span>
              </a>
            )}
            {/* Open Issues and Vulnerability Alerts */}
            {!repo.is_hidden && (repo.open_issues_count ?? 0) > 0 && (
              <a
                href={`${repo.url}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative p-1 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded transition-colors"
                title={`${repo.open_issues_count} open issues`}
                onClick={(e) => e.stopPropagation()}
              >
                <AlertCircle className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {repo.open_issues_count}
                </span>
              </a>
            )}
            {!repo.is_hidden && repo.vuln_alert_count !== undefined && repo.vuln_alert_count > 0 && (
              <a
                href={`${repo.url}/security/dependabot`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative p-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                title={`${repo.vuln_alert_count} Dependabot alerts`}
                onClick={(e) => e.stopPropagation()}
              >
                <Shield className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                  {repo.vuln_alert_count}
                </span>
              </a>
            )}
          </div>
        </td>
        {/* Description */}
        <td className="px-3 md:px-6 py-3 md:py-4 text-sm text-slate-400 hidden xl:table-cell">
          <div className={`flex items-center gap-2 ${repo.is_hidden ? 'opacity-50' : ''}`}>
            <div className="truncate max-w-md" title={repo.description || ''}>
              {repo.description || '—'}
            </div>
            {/* Language Icon/Label */}
            {repo.language && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${getLanguageColor(
                  repo.language
                )}`}
                title={repo.language}
              >
                {getLanguageIcon(repo.language)}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 md:px-6 py-3 md:py-4" data-tour="health-score">
          <div className="flex flex-col gap-2">
            <div className={`flex items-center gap-2 ${repo.is_hidden ? 'opacity-50 grayscale' : ''}`}>
              {details ? (
                <HealthBreakdown
                  repo={repo}
                  details={details}
                  health={health}
                  onToggle={onToggleHealth}
                />
              ) : (
                <span className={`text-lg font-bold ${health.color}`}>{health.grade}</span>
              )}
              {details && expandedHealth && (
                <HealthShields details={details} repo={repo} docHealth={docHealth} />
              )}
            </div>
          </div>
        </td>
        {/* Docs Column */}
        <td className={`px-3 md:px-6 py-3 md:py-4 hidden sm:table-cell ${repo.is_hidden ? 'opacity-50 grayscale' : ''}`} data-tour="docs">
          <DocStatusDisplay
            repo={repo}
            details={details}
            isLoadingDetails={isLoadingDetails}
            docHealth={docHealth}
            repoName={repo.name}
            lastSynced={repo.last_synced}
            fixingDoc={fixingDoc}
            syncingRepo={syncingRepo}
            isAuthenticated={isAuthenticated}
            expanded={expandedDocs}
            onToggleExpanded={onToggleDocs}
            onFixAllDocs={onFixAllDocs}
            onSyncSingleRepo={onSyncSingleRepo}
          />
        </td>
        {/* Actions Column */}
        <td className="px-3 md:px-6 py-3 md:py-4" data-tour="actions">
          <div className="flex items-center gap-2">
            {/* If repo is hidden, show Restore button, else show standard actions */}
            {repo.is_hidden ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnhide?.();
                }}
                className="p-1 px-2 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded transition-colors text-xs font-bold flex items-center gap-1"
                title="Unhide this repository"
              >
                <RefreshCw className="h-3 w-3" />
                Restore
              </button>
            ) : (
              <>
                {onOpenChat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenChat();
                    }}
                    className="p-1 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded transition-colors"
                    title={`Chat about ${repo.name}`}
                    aria-label={`Chat about ${repo.name}`}
                    data-tour="repo-chat"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                )}
                {isAuthenticated && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSyncSingleRepo();
                    }}
                    className="p-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors disabled:opacity-50"
                    title={syncingRepo === repo.name ? 'Syncing...' : 'Refresh repository data'}
                    disabled={syncingRepo === repo.name}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${syncingRepo === repo.name ? 'animate-spin' : ''}`}
                    />
                  </button>
                )}
                {/* CI/CD Status Icon */}
                {repo.ci_status && repo.ci_status !== 'unknown' && (
                  <a
                    href={`${repo.url}/actions`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-1 rounded transition-colors ${repo.ci_status === 'passing'
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                    title={`CI/CD ${repo.ci_status === 'passing' ? 'Passing' : 'Failing'}${repo.ci_workflow_name ? ` - ${repo.ci_workflow_name}` : ''
                      }${repo.ci_last_run ? ` (${new Date(repo.ci_last_run).toLocaleDateString()})` : ''}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {repo.ci_status === 'passing' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                  </a>
                )}
                {repo.ci_status === 'unknown' && (
                  <div
                    className="p-1 bg-slate-500/20 text-slate-400 rounded"
                    title="CI/CD status unknown"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </div>
                )}
                {isAuthenticated ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove();
                    }}
                    className="p-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                    title="Hide this repository"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="text-slate-500 text-sm">—</div>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && details && (
        <tr>
          <td colSpan={5} className="p-0 bg-slate-950/90">
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
              // Adapt single-arg handlers to two-arg signatures expected downstream
              onFixDoc={(repoNameArg: string, docType: string) => onFixDoc(docType)}
              onFixAllDocs={() => onFixAllDocs()}
              onFixStandard={(repoNameArg: string, standardType: string) => onFixStandard(standardType)}
              onFixAllStandards={() => onFixAllStandards()}
              onFixPractice={(repoNameArg: string, practiceType: string) => onFixPractice(practiceType)}
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
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}


function DocStatusDisplay({
  repo,
  details,
  isLoadingDetails = false,
  docHealth,
  repoName,
  lastSynced,
  fixingDoc,
  syncingRepo,
  isAuthenticated = true,
  expanded,
  onToggleExpanded,
  onFixAllDocs,
  onSyncSingleRepo,
}: {
  repo: Repo;
  details: RepoDetails | undefined;
  isLoadingDetails?: boolean;
  docHealth: { score: number } | null;
  repoName: string;
  lastSynced: string | null;
  fixingDoc: boolean;
  syncingRepo: string | null;
  isAuthenticated?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onFixAllDocs: () => void;
  onSyncSingleRepo: () => void;
}): React.JSX.Element {
  // Calculate repo type within this component
  const repoType = repo.repo_type
    ? (repo.repo_type as RepoType)
    : detectRepoType(repo.name, repo.description, repo.language, repo.topics).type;

  // Calculate existingDocs set (must be before conditional return to satisfy hooks rules)
  const existingDocs = useMemo(
    () => details ? new Set(details.docStatuses.filter(d => d.exists).map(d => d.doc_type)) : new Set(),
    [details]
  );

  if (!details) {
    if (isLoadingDetails) {
      // Details are being fetched in the background — show placeholder icons
      return (
        <div className="flex items-center gap-2 animate-pulse" aria-label="Loading doc status">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 w-4 rounded-full bg-slate-700/60" />
          ))}
        </div>
      );
    }
    if (!isAuthenticated) {
      return (
        <span className="text-xs text-slate-400">{formatTimeAgo(lastSynced)}</span>
      );
    }
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSyncSingleRepo();
        }}
        disabled={syncingRepo === repoName}
        className="text-xs text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-1 disabled:opacity-50"
        title="Click to sync and load docs"
      >
        <RefreshCw className={`h-3 w-3 ${syncingRepo === repoName ? 'animate-spin' : ''}`} />
        {syncingRepo === repoName ? 'Syncing...' : formatTimeAgo(lastSynced)}
      </button>
    );
  }

  const getIconInfo = (docType: string) => {
    const doc = details.docStatuses.find((d) => d.doc_type === docType);
    const exists = doc && doc.exists;
    const healthState = doc?.health_state || (exists ? 'healthy' : 'missing');
    const colorMap: Record<string, string> = {
      roadmap: 'purple',
      tasks: 'blue',
      metrics: 'green',
      features: 'yellow',
      readme: 'cyan',
    };
    const color = colorMap[docType] || 'slate';
    const iconColor =
      healthState === 'healthy'
        ? `text-${color}-400`
        : healthState === 'dormant'
          ? 'text-yellow-400'
          : healthState === 'malformed'
            ? 'text-orange-400'
            : 'text-slate-600';

    // Build tooltip with health status
    const healthLabel = healthState.charAt(0).toUpperCase() + healthState.slice(1);
    const tooltip = `${docType.toUpperCase()}: ${healthLabel}`;

    return { exists, iconColor, title: tooltip };
  };

  const roadmap = getIconInfo('roadmap');
  const tasks = getIconInfo('tasks');
  const metrics = getIconInfo('metrics');
  const features = getIconInfo('features');
  const readme = getIconInfo('readme');

  const coreDocs = ['readme', 'roadmap', 'tasks', 'metrics', 'features'];
  const allDocsPresent = coreDocs.every((docType) =>
    details.docStatuses.find((d) => d.doc_type === docType && d.exists)
  );

  // Build doc health tooltip
  const expectedDocsMap: Record<string, string[]> = {
    'web-app': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'game': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'library': ['readme', 'features', 'changelog', 'metrics'],
    'tool': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'bot': ['readme', 'features', 'roadmap', 'tasks', 'metrics'],
    'research': ['readme', 'features', 'metrics'],
    'unknown': ['readme', 'features', 'roadmap', 'metrics']
  };
  const expectedDocs = expectedDocsMap[repoType] || expectedDocsMap['unknown'];
  const presentCount = expectedDocs.filter((docType: string) => existingDocs.has(docType)).length;

  const docHealthTooltip = [
    `Repo Type: ${repoType}`,
    `Score: ${presentCount}/${expectedDocs.length} docs present = ${docHealth?.score}%`,
    '',
    'Expected Documents:',
    ...expectedDocs.map((docType: string) => {
      const doc = details.docStatuses.find((d) => d.doc_type === docType);
      const exists = doc && doc.exists;
      const healthState = doc?.health_state || (exists ? 'healthy' : 'missing');
      const status = exists ? (healthState === 'healthy' ? '✓' : healthState === 'dormant' ? '~' : '!') : '✗';
      return `  ${status} ${docType.toUpperCase()}: ${healthState}`;
    })
  ].join('\n');

  // Collapsed (default) state: one icon giving a relative doc-health scale —
  // not the A-F grade and not the raw percentage, just a coarse signal.
  // Click expands to the full per-doc icon breakdown (the previous default).
  if (!expanded) {
    const score = docHealth?.score ?? 0;
    const tier =
      score >= 80
        ? { Icon: CheckCircle2, color: 'text-green-400', label: 'Docs healthy' }
        : score >= 40
          ? { Icon: AlertCircle, color: 'text-yellow-400', label: 'Docs need attention' }
          : { Icon: XCircle, color: 'text-red-400', label: 'Docs missing or unhealthy' };
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpanded();
        }}
        className={`p-1 rounded transition-colors hover:bg-slate-700/50 ${tier.color}`}
        title={`${tier.label} — click to see each document\n\n${docHealthTooltip}`}
        aria-label={`${tier.label}. Click to expand doc status`}
        aria-expanded={false}
      >
        <tier.Icon className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2" title={docHealthTooltip}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpanded();
        }}
        className="p-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
        title="Collapse doc status"
        aria-label="Collapse doc status"
        aria-expanded={true}
      >
        <ChevronsLeft className="h-3.5 w-3.5" />
      </button>
      <span title={readme.title}>
        <BookOpen className={`h-4 w-4 ${readme.exists ? readme.iconColor : 'opacity-20'}`} />
      </span>
      <span title={roadmap.title}>
        <Map className={`h-4 w-4 ${roadmap.exists ? roadmap.iconColor : 'opacity-20'}`} />
      </span>
      <span title={tasks.title}>
        <ListTodo className={`h-4 w-4 ${tasks.exists ? tasks.iconColor : 'opacity-20'}`} />
      </span>
      <span title={metrics.title}>
        <Activity className={`h-4 w-4 ${metrics.exists ? metrics.iconColor : 'opacity-20'}`} />
      </span>
      <span title={features.title}>
        <Sparkles className={`h-4 w-4 ${features.exists ? features.iconColor : 'opacity-20'}`} />
      </span>
      {isAuthenticated && !allDocsPresent && docHealth && docHealth.score < 100 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFixAllDocs();
          }}
          className="ml-2 p-1 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded transition-colors"
          title="Fix all missing docs"
          disabled={fixingDoc}
        >
          <Play className="h-3.5 w-3.5 fill-current" />
        </button>
      )}
    </div>
  );
}
