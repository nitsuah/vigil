"use client";

import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import { BestPractice } from '@/types/repo';
import { getStatusColor } from '@/lib/expandable-row-utils';
import { useState } from 'react';

interface BestPracticesSectionProps {
  bestPractices: BestPractice[];
  repoName?: string;
  isAuthenticated?: boolean;
  onFixPractice?: (repoName: string, practiceType: string) => void;
  onFixAllPractices?: (repoName: string) => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export function BestPracticesSection({
  bestPractices,
  repoName,
  isAuthenticated = true,
  onFixPractice,
  onFixAllPractices,
  isExpanded: isExpandedProp,
  onToggleExpanded,
}: BestPracticesSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const setIsExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-3 w-3 text-green-400" />;
      case 'dormant':
        return <Circle className="h-3 w-3 text-yellow-400 fill-yellow-400" />;
      case 'malformed':
        return <XCircle className="h-3 w-3 text-orange-400" />;
      case 'missing':
        return <XCircle className="h-3 w-3 text-red-400" />;
      default:
        return <Circle className="h-3 w-3 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">Healthy</span>;
      case 'dormant':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Dormant</span>;
      case 'malformed':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">Malformed</span>;
      case 'missing':
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Missing</span>;
      default:
        return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-500">Unknown</span>;
    }
  };

  const getLabel = (type: string) => {
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  // Calculate fixable missing practices with AI-powered context-aware fixes
  // See docs/BEST_PRACTICES_AI_STRATEGY.md for implementation details
  // Each practice uses: template + README + language + (CONTRIBUTING/existing files)
  const fixablePractices = ['dependabot', 'env_template', 'docker', 'deploy_badge', 'ci_cd', 'gitignore', 'pre_commit_hooks', 'testing_framework', 'linting'];
  const missingFixable = bestPractices.filter(
    (p) => p.status === 'missing' && fixablePractices.includes(p.practice_type)
  );

  return (
    <div className="bg-gradient-to-br from-purple-900/30 via-slate-800/50 to-purple-800/20 rounded-lg overflow-hidden border border-purple-500/40 shadow-lg shadow-purple-500/10 hover:border-purple-400/50 transition-colors" data-tour="best-practices">
      <div
        className="w-full px-4 py-3 hover:bg-purple-900/20 transition-colors border-b border-purple-500/20 cursor-pointer"
        onClick={setIsExpanded}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <h4 className="text-sm font-semibold text-slate-200">Best Practices</h4>
            <span
              title={`Best Practices: ${bestPractices.filter(p => p.status === 'healthy').length}/${bestPractices.length} healthy`}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ml-1 ${
                bestPractices.filter(p => p.status === 'healthy').length / bestPractices.length >= 0.7
                  ? 'bg-purple-500/20 text-purple-400'
                  : bestPractices.filter(p => p.status === 'healthy').length / bestPractices.length >= 0.4
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {bestPractices.filter(p => p.status === 'healthy').length}/{bestPractices.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && missingFixable.length > 0 && onFixAllPractices && repoName && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFixAllPractices(repoName);
                }}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-medium transition-colors"
                title="Fix all missing best practices"
              >
                Fix All ({missingFixable.length})
              </button>
            )}
            <span className="text-slate-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 py-3">
          {bestPractices.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No data available</p>
          ) : (
            <div className="space-y-2">
          {bestPractices
            .sort((a, b) => {
              // Ensure fixable items are always listed at the bottom
              const fixable = ['dependabot', 'env_template', 'docker', 'deploy_badge', 'ci_cd', 'gitignore', 'pre_commit_hooks', 'testing_framework', 'linting'];
              const isAFixable = fixable.includes(a.practice_type);
              const isBFixable = fixable.includes(b.practice_type);
              if (isAFixable && !isBFixable) return 1;
              if (!isAFixable && isBFixable) return -1;
              // Within groups, apply a sensible order
              const order = [
                'branch_protection',
                'ci_cd',
                'gitignore',
                'pre_commit_hooks',
                'testing_framework',
                'linting',
                'docker',
                'env_template',
                'dependabot',
                'deploy_badge',
                'visual_docs',
              ];
              const aIndex = order.indexOf(a.practice_type);
              const bIndex = order.indexOf(b.practice_type);
              const aPos = aIndex === -1 ? 999 : aIndex;
              const bPos = bIndex === -1 ? 999 : bIndex;
              return aPos - bPos;
            })
            .map((practice, i) => {
              // Determine if this practice can be auto-fixed
              const fixablePractices = ['dependabot', 'env_template', 'docker', 'deploy_badge', 'ci_cd', 'gitignore', 'pre_commit_hooks', 'testing_framework', 'linting'];
              const canFix = fixablePractices.includes(practice.practice_type);
              const isMissing = practice.status === 'missing';

              return (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(practice.status)}
                      <span className={getStatusColor(practice.status)}>
                        {getLabel(practice.practice_type)}
                      </span>
                      {practice.details?.informational === true && (
                        <span className="text-[10px] text-slate-500" title="Shown for guidance; not counted in the health score yet">
                          (not scored)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isAuthenticated && canFix && isMissing && onFixPractice && repoName && (
                        <button
                          onClick={() => onFixPractice(repoName, practice.practice_type)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-medium transition-colors"
                          title={`AI-powered context-aware fix for ${getLabel(practice.practice_type)}`}
                        >
                          Fix
                        </button>
                      )}
                      {getStatusBadge(practice.status)}
                    </div>
                  </div>

                  {practice.practice_type === 'visual_docs' && practice.status !== 'healthy' && (
                    <div className="mt-2 ml-6 text-xs text-slate-400">
                      {practice.status === 'dormant'
                        ? 'Diagrams or screenshots exist but the README does not embed any of them.'
                        : 'No architecture diagram or app screenshots found.'}
                      {' '}Add the CI recipe that regenerates them and rewrites a marked README block:{' '}
                      <a
                        href="https://github.com/nitsuah/vigil/blob/main/docs/VISUAL_DOCS.md"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        visual-docs recipe
                      </a>.
                    </div>
                  )}

                  {practice.practice_type === 'deploy_badge' && practice.status === 'dormant' && (
                    <div className="mt-2 ml-6 text-xs text-slate-400">
                      <div>Hint: Detected a possible deploy-related badge but confidence is low.</div>
                      {Array.isArray(practice.details?.evidence) && practice.details.evidence.length > 0 && (
                        <div className="truncate">Top evidence: {(practice.details.evidence[0]?.url || '').toString()}</div>
                      )}
                      <div>
                        Consider adding a platform badge:
                        <span className="ml-1 text-slate-300">Netlify</span>,
                        <span className="ml-1 text-slate-300">Vercel</span>,
                        <span className="ml-1 text-slate-300">GitHub Actions (deploy.yml)</span>.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}