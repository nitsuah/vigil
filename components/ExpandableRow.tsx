"use client";

import { useState, type JSX } from 'react';
import { RowErrorBoundary } from './RowErrorBoundary';
import { Task, RoadmapItem, DocStatus, Metric, Feature, BestPractice, CommunityStandard, SecurityConfig } from '@/types/repo';
import { RepositoryStatsSectionStatic } from './repo-details/RepositoryStatsSectionStatic';
import { TestingSection } from './repo-details/TestingSection';
import { MetricsSection } from './repo-details/MetricsSection';
import { IssuesSection } from './repo-details/IssuesSection';
import { AISummarySection } from './repo-details/AISummarySection';
import { DocumentationSection } from './repo-details/DocumentationSection';
import { BestPracticesSection } from './repo-details/BestPracticesSection';
import { CommunityStandardsSection } from './repo-details/CommunityStandardsSection';
import { RoadmapSection } from './repo-details/RoadmapSection';
import { TasksSection } from './repo-details/TasksSection';
import { FeaturesSection } from './repo-details/FeaturesSection';
import { SecuritySection } from './repo-details/SecuritySection';

interface ExpandableRowProps {
  tasks: Task[];
  roadmapItems: RoadmapItem[];
  docStatuses: DocStatus[];
  metrics?: Metric[];
  features?: Feature[];
  bestPractices?: BestPractice[];
  communityStandards?: CommunityStandard[];
  aiSummary?: string;
  stars?: number;
  forks?: number;
  branches?: number;
  testingStatus?: string;
  coverageScore?: number;
  readmeLastUpdated?: string | null;
  repoName?: string;
  repoUrl?: string;
  isAuthenticated?: boolean;
  onFixStandard?: (repoName: string, standardType: string) => void;
  onFixAllStandards?: (repoName: string) => void;
  onFixDoc?: (repoName: string, docType: string) => void;
  onFixAllDocs?: (repoName: string) => void;
  onFixPractice?: (repoName: string, practiceType: string) => void;
  onFixAllPractices?: (repoName: string) => void;
  totalLoc?: number;
  locLanguageBreakdown?: Record<string, number>;
  testCaseCount?: number;
  vulnAlertCount?: number;
  vulnCriticalCount?: number;
  vulnHighCount?: number;
  contributorCount?: number;
  commitFrequency?: number;
  busFactor?: number;
  avgPrMergeTimeHours?: number;
  tokenDensity?: number | null;
  commentToCodeRatio?: number | null;
  onSyncSingleRepo?: () => void;
  syncingRepo?: string | null;
  repoNameForSync?: string;
  onGenerateSummary?: () => void;
  generatingSummary?: boolean;
  securityConfig?: SecurityConfig;
  /** Rendered from MobileRepoCard (below the md breakpoint). Forces a single
   * vertically-scrollable column instead of the desktop sidebar + 3-col grid
   * layout — the grid's own sm:/lg: breakpoints are viewport-width based, so
   * without this flag a half-width/tablet-width screen that still renders
   * the mobile card list would get a 2-col grid mid-scroll, which is the
   * layout this prop exists to avoid. Also collapses Repository Stats by
   * default and adds a "Back to list" affordance. */
  isMobile?: boolean;
  /** Only used when isMobile — collapses this card's expanded detail back
   * to the repo list. */
  onBack?: () => void;
}

function ExpandableRowContent({
  tasks,
  roadmapItems,
  docStatuses,
  metrics = [],
  features = [],
  bestPractices = [],
  communityStandards = [],
  aiSummary,
  stars,
  forks,
  branches,
  testingStatus,
  coverageScore,
  readmeLastUpdated,
  repoName,
  repoUrl,
  isAuthenticated = true,
  onFixStandard,
  onFixAllStandards,
  onFixDoc,
  onFixAllDocs,
  onFixPractice,
  onFixAllPractices,
  totalLoc,
  locLanguageBreakdown,
  testCaseCount,
  vulnAlertCount,
  vulnCriticalCount,
  vulnHighCount,
  contributorCount,
  commitFrequency,
  busFactor,
  avgPrMergeTimeHours,
  tokenDensity,
  commentToCodeRatio,
  onSyncSingleRepo,
  syncingRepo,
  repoNameForSync,
  onGenerateSummary,
  generatingSummary = false,
  securityConfig,
  isMobile = false,
  onBack,
}: ExpandableRowProps): JSX.Element {
  // Track which specific summary content was dismissed; a new aiSummary value
  // automatically clears the dismissed state without needing an effect.
  const [dismissedSummary, setDismissedSummary] = useState<string | undefined>(undefined);
  const aiSummaryDismissed = dismissedSummary !== undefined && dismissedSummary === aiSummary;
  const [projectSectionsExpanded, setProjectSectionsExpanded] = useState(true);
  const [row2Expanded, setRow2Expanded] = useState(false); // Documentation, Best Practices, Testing
  const [row3Expanded, setRow3Expanded] = useState(false); // Standards, Metrics, Issues
  
  const isSyncing = syncingRepo === repoNameForSync;
  const hasNoData = roadmapItems.length === 0 && tasks.length === 0 && features.length === 0;

  // Mobile renders every section as one vertically-scrollable column — no
  // sidebar/grid split, since the grid's own sm:/lg: breakpoints are keyed
  // to viewport width and would still kick in a 2-col layout on a
  // half-width/tablet-width screen that is otherwise showing the mobile
  // card list.
  const sectionGridClass = isMobile
    ? 'flex flex-col gap-4'
    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6';

  return (
    <div className="p-4 md:p-6 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 border-t border-slate-700/50">
      {isMobile && onBack && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onBack(); }}
          className="mb-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          ← Back to repo list
        </button>
      )}
      {/* Main Layout: Repository Stats + Issues (left sidebar) + Content Grid (right) —
          on mobile this collapses into a single stacked column (see isMobile above). */}
      <div className={isMobile ? 'flex flex-col gap-4' : 'flex flex-col md:flex-row gap-4 md:gap-6'}>
        {/* Left Sidebar: AI Summary + Repository Stats + Issues + Metrics */}
        <div className={isMobile ? 'w-full space-y-4' : 'w-full md:w-60 lg:w-72 xl:w-80 md:shrink-0 space-y-4 md:space-y-6'}>
          {/* AI Summary - First in sidebar */}
          <AISummarySection
            aiSummary={aiSummaryDismissed ? undefined : aiSummary}
            repoName={repoName}
            isAuthenticated={isAuthenticated}
            generatingSummary={generatingSummary}
            onGenerateSummary={onGenerateSummary}
            onDismiss={() => setDismissedSummary(aiSummary)}
          />

          <RepositoryStatsSectionStatic
            stars={stars}
            forks={forks}
            branches={branches}
            totalLoc={totalLoc}
            locLanguageBreakdown={locLanguageBreakdown}
            contributorCount={contributorCount}
            commitFrequency={commitFrequency}
            busFactor={busFactor}
            avgPrMergeTimeHours={avgPrMergeTimeHours}
            metrics={metrics}
            onSyncSingleRepo={onSyncSingleRepo}
            isSyncing={isSyncing}
            isAuthenticated={isAuthenticated}
            hasNoData={hasNoData}
            repoUrl={repoUrl}
            repoName={repoName}
            tokenDensity={tokenDensity}
            commentToCodeRatio={commentToCodeRatio}
            defaultExpanded={!isMobile}
          />
        </div>

        {/* Right Content Grid (single column on mobile) */}
        <div className="flex-1">
          <div className={sectionGridClass}>
            {/* Features */}
            <FeaturesSection
              features={features}
              isExpanded={projectSectionsExpanded}
              onToggleExpanded={() => setProjectSectionsExpanded(!projectSectionsExpanded)}
              repoName={repoName}
              isAuthenticated={isAuthenticated}
            />

            {/* Roadmap */}
            <RoadmapSection
              roadmapItems={roadmapItems}
              isExpanded={projectSectionsExpanded}
              onToggleExpanded={() => setProjectSectionsExpanded(!projectSectionsExpanded)}
              repoUrl={repoUrl}
              repoName={repoName}
              isAuthenticated={isAuthenticated}
            />

            {/* Tasks */}
            <TasksSection 
              tasks={tasks}
              tasksDocExists={docStatuses.some((d) => d.doc_type === 'tasks' && d.exists)}
              isExpanded={projectSectionsExpanded}
              onToggleExpanded={() => setProjectSectionsExpanded(!projectSectionsExpanded)}
            />

            {/* Documentation Status */}
            <DocumentationSection 
              docStatuses={docStatuses} 
              readmeLastUpdated={readmeLastUpdated}
              repoName={repoName}
              isAuthenticated={isAuthenticated}
              onFixDoc={onFixDoc}
              onFixAllDocs={onFixAllDocs}
              isExpanded={row2Expanded}
              onToggleExpanded={() => setRow2Expanded(!row2Expanded)}
            />

            {/* Best Practices */}
            <BestPracticesSection
              bestPractices={bestPractices}
              repoName={repoName}
              isAuthenticated={isAuthenticated}
              onFixPractice={onFixPractice}
              onFixAllPractices={onFixAllPractices}
              isExpanded={row2Expanded}
              onToggleExpanded={() => setRow2Expanded(!row2Expanded)}
              data-tour="best-practices"
            />

            {/* Testing */}
            <TestingSection
              testingStatus={testingStatus}
              coverageScore={coverageScore}
              testCaseCount={testCaseCount}
              bestPractices={bestPractices}
              metrics={metrics}
              isExpanded={row2Expanded}
              onToggleExpanded={() => setRow2Expanded(!row2Expanded)}
            />

            {/* Community Standards */}
            <CommunityStandardsSection
              communityStandards={communityStandards}
              repoName={repoName}
              isAuthenticated={isAuthenticated}
              onFixStandard={onFixStandard}
              onFixAllStandards={onFixAllStandards}
              isExpanded={row3Expanded}
              onToggleExpanded={() => setRow3Expanded(!row3Expanded)}
              data-tour="community"
            />

            {/* Security */}
            <SecuritySection
              securityConfig={securityConfig}
              isExpanded={row3Expanded}
              onToggleExpanded={() => setRow3Expanded(!row3Expanded)}
            />

            {/* Metrics */}
            {metrics && metrics.length > 0 && (
              <MetricsSection 
                metrics={metrics}
                isExpanded={row3Expanded}
                onToggleExpanded={() => setRow3Expanded(!row3Expanded)}
              />
            )}

            {/* Issues */}
            <IssuesSection 
              vulnAlertCount={vulnAlertCount}
              vulnCriticalCount={vulnCriticalCount}
              vulnHighCount={vulnHighCount}
              isExpanded={row3Expanded}
              onToggleExpanded={() => setRow3Expanded(!row3Expanded)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Isolates render errors to this one row (see RowErrorBoundary). */
export default function ExpandableRow(props: ExpandableRowProps): JSX.Element {
  return (
    <RowErrorBoundary repoName={props.repoName}>
      <ExpandableRowContent {...props} />
    </RowErrorBoundary>
  );
}
