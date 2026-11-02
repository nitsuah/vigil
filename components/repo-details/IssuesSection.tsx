"use client";

import { AlertCircle } from 'lucide-react';
import { useState } from 'react';

// One open-issues link per count. A label of undefined links the plain open-issues filter.
function issuesHref(repoUrl: string | undefined, label?: string): string | undefined {
  const baseUrl = repoUrl?.trim().replace(/\/$/, '');
  if (!baseUrl) return undefined;
  const base = baseUrl + '/issues?q=is%3Aissue+is%3Aopen';
  return label ? base + '+label%3A' + label : base;
}

function CountLink({ label, count, href }: { label: string; count: number; href: string | undefined }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-slate-200 font-medium hover:underline">{count}</a>
      ) : (
        <span className="text-slate-200 font-medium">{count}</span>
      )}
    </div>
  );
}

interface IssuesSectionProps {
  vulnAlertCount?: number;
  vulnCriticalCount?: number;
  vulnHighCount?: number;
  issueCategoryCounts?: { total: number; vulnerability: number; bug: number; feedback: number; other: number; complete: boolean } | null;
  repoUrl?: string;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export function IssuesSection({ vulnAlertCount, vulnCriticalCount, vulnHighCount, issueCategoryCounts, repoUrl, isExpanded: isExpandedProp, onToggleExpanded }: IssuesSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const setIsExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));
  
  const hasVulnerabilities = vulnAlertCount !== undefined && vulnAlertCount > 0;
  const hasOpenIssues = (issueCategoryCounts?.total ?? 0) > 0;
  if (!hasVulnerabilities && !hasOpenIssues) return null;

  return (
    <div className="bg-gradient-to-br from-red-900/30 via-slate-800/50 to-red-800/20 rounded-lg overflow-hidden border border-red-500/40 shadow-lg shadow-red-500/10 hover:border-red-400/50 transition-colors" data-tour="issues">
      <div
        onClick={setIsExpanded}
        className="w-full px-4 py-3 hover:bg-red-900/20 transition-colors border-b border-red-500/20 cursor-pointer"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <h4 className="text-sm font-semibold text-slate-200">Issues</h4>
            <span className="text-slate-500 text-xs ml-2">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="px-4 py-3">
          <div className="space-y-2">
            {issueCategoryCounts && (
              <>
                <CountLink label="Total" count={issueCategoryCounts.total} href={issuesHref(repoUrl)} />
                <CountLink label="Feedback" count={issueCategoryCounts.feedback} href={issuesHref(repoUrl, 'enhancement')} />
                <CountLink label="Bugs" count={issueCategoryCounts.bug} href={issuesHref(repoUrl, 'bug')} />
                <CountLink label="Other" count={issueCategoryCounts.other} href={issuesHref(repoUrl)} />
              </>
            )}
            {issueCategoryCounts && !issueCategoryCounts.complete && (
              <p className="text-[10px] text-amber-400">Counts are incomplete: not every open issue page was read.</p>
            )}
            {/* Vulnerabilities */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1"><span>🔒</span>Vulnerabilities</span>
              <span className="text-red-400 font-medium">{vulnAlertCount}</span>
            </div>
            {vulnCriticalCount !== undefined && vulnCriticalCount > 0 && (
              <div className="flex items-center justify-between text-xs ml-4">
                <span className="text-slate-500 text-[10px]">Critical</span>
                <span className="text-red-400 font-medium">{vulnCriticalCount}</span>
              </div>
            )}
            {vulnHighCount !== undefined && vulnHighCount > 0 && (
              <div className="flex items-center justify-between text-xs ml-4">
                <span className="text-slate-500 text-[10px]">High</span>
                <span className="text-orange-400 font-medium">{vulnHighCount}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
