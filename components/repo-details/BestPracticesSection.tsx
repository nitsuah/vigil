"use client";

import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import { BestPractice } from '@/types/repo';
import { getStatusColor } from '@/lib/expandable-row-utils';
import { useState } from 'react';
import type { RowFix, VisualDocsDetails, VisualRow } from '@/lib/visual-docs';
import { branchProtectionControls, type BranchProtectionDetails } from '@/lib/branch-protection-controls';

function HandoffCommand({ fix }: { fix: RowFix }) {
  if (fix.kind !== 'handoff') return null;
  return (
    <div className="mt-1">
      <code className="block select-all break-all rounded bg-slate-900/70 px-2 py-1 text-[10px] text-slate-200">{fix.command}</code>
      {fix.inputs.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-[10px] text-slate-500">
          {fix.inputs.map((i) => <li key={i}>{i}</li>)}
        </ul>
      )}
    </div>
  );
}

/** visual_docs is PR-fixable only when a row offers the recipe PR; with a workflow already in place the remedy is the /promo handoff. */
function hasPrFix(p: BestPractice): boolean {
  if (p.practice_type !== 'visual_docs' || !Array.isArray(p.details?.rows)) return true;
  return (p.details.rows as VisualRow[]).some((r) => r.fix?.kind === 'pr');
}

/** Why visual_docs is dormant: a missing README embed, or a scored row that CI doesn't regenerate. */
function visualDormantReason(details: BestPractice['details']): string {
  const d = (details ?? {}) as Partial<VisualDocsDetails>;
  const embedded = d.embedded ?? [];
  const shotShown = embedded.some((f) => d.screenshots?.includes(f));
  const diagramShown = !!d.inlineMermaid || embedded.some((f) => d.diagrams?.includes(f));
  if (!shotShown && !diagramShown) return 'Diagrams or screenshots exist but the README does not embed any of them.';
  if (!shotShown) return 'The README embeds diagrams but no screenshots.';
  if (!diagramShown) return 'The README embeds screenshots but no diagram.';
  const notCi = (['screenshots', 'diagrams'] as const).filter((k) => d.elements?.[k] !== 'ci');
  if (notCi.length) return `The README embeds them, but no workflow regenerates the ${notCi.join(' or ')} (graded ${notCi.map((k) => d.elements?.[k] ?? 'missing').join(' / ')}).`;
  return 'Not every scored row passes yet.';
}

/** Per-row grade plus its fix: a PR vigil opens (CI recipe) or a handoff (skill run, setting). */
function VisualRowsList({ rows, canFix, onFix }: { rows: VisualRow[]; canFix: boolean; onFix: () => void }) {
  const tone = { pass: 'border-green-700 text-green-400', partial: 'border-yellow-700 text-yellow-400', fail: 'border-slate-700 text-slate-500' } as const;
  return (
    <div className="mt-2 ml-6 space-y-1.5 text-[10px]" aria-label="Visual showcase elements">
      {rows.map((r) => (
        <div key={r.row}>
          <span title={r.scored ? 'Scored' : 'Graded, not scored'} className={`px-1.5 py-0.5 rounded border ${tone[r.grade]}`}>
            {r.row} · {r.state}{r.scored ? '' : ' (not scored)'}
          </span>
          {r.fix?.kind === 'pr' && canFix && (
            <button onClick={onFix} className="ml-2 px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium">
              {r.fix.label}
            </button>
          )}
          {r.fix?.kind === 'handoff' && (
            <details className="ml-2 inline-block align-top text-slate-400">
              <summary className="cursor-pointer">Handoff{r.fix.skill ? `: ${r.fix.skill}` : ''}</summary>
              <HandoffCommand fix={r.fix} />
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function BranchControlList({ details, repoName }: { details: BranchProtectionDetails; repoName: string }) {
  const summary = branchProtectionControls(details, repoName);
  return (
    <div className="mt-2 ml-6 text-xs">
      <div className="text-[10px] text-slate-400">{`${summary.enabled} of ${summary.total} controls`}</div>
      <ul className="mt-1 space-y-1">
        {summary.controls.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            {c.status === 'enabled' && <CheckCircle2 aria-label="Enabled" className="h-3 w-3 text-green-400" />}
            {c.status === 'missing' && <XCircle aria-label="Missing" className="h-3 w-3 text-red-400" />}
            {c.status === 'unknown' && <Circle aria-label="Unknown" className="h-3 w-3 text-slate-500" />}
            <span className="text-slate-300">{c.label}</span>
            {c.status === 'missing' && (
              <a href={c.fixUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline text-[10px]">
                Fix in Settings
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

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

  // Nest actions_pr_permission under visual_docs when visual_docs exists
  const actionsPr = bestPractices.find(p => p.practice_type === 'actions_pr_permission');
  const hasVisual = bestPractices.some(p => p.practice_type === 'visual_docs');

  const displayPractices = hasVisual
    ? bestPractices.filter(p => p.practice_type !== 'actions_pr_permission')
    : bestPractices;

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
  const fixablePractices = ['dependabot', 'env_template', 'docker', 'deploy_badge', 'ci_cd', 'gitignore', 'pre_commit_hooks', 'testing_framework', 'linting', 'visual_docs'];
  const missingFixable = bestPractices.filter(
    (p) => p.status === 'missing' && fixablePractices.includes(p.practice_type) && hasPrFix(p)
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
              const fixablePractices = ['dependabot', 'env_template', 'docker', 'deploy_badge', 'ci_cd', 'gitignore', 'pre_commit_hooks', 'testing_framework', 'linting', 'visual_docs'];
              const canFix = fixablePractices.includes(practice.practice_type) && hasPrFix(practice);
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

                  {practice.practice_type === 'branch_protection' && repoName && (
                    <BranchControlList details={practice.details as BranchProtectionDetails} repoName={repoName} />
                  )}

                  {practice.practice_type === 'journeys' && practice.status !== 'healthy' && !!practice.details?.fix && (
                    <div className="mt-2 ml-6 text-xs">
                      <HandoffCommand fix={practice.details.fix as RowFix} />
                    </div>
                  )}

                  {practice.practice_type === 'visual_docs' && Array.isArray(practice.details?.rows) && (
                    <VisualRowsList
                      rows={practice.details.rows as VisualRow[]}
                      canFix={isAuthenticated && !!onFixPractice && !!repoName}
                      onFix={() => repoName && onFixPractice?.(repoName, 'visual_docs')}
                    />
                  )}

                  {practice.practice_type === 'actions_pr_permission' && !hasVisual && practice.status !== 'healthy' && !!practice.details?.fix && (
                    <div className="mt-2 ml-6 text-xs text-slate-400">
                      The visual-docs bot can&apos;t open its PR until this is on. Run (repo admin):
                      <HandoffCommand fix={practice.details.fix as RowFix} />
                      {(() => {
                        const fix = practice.details.fix as RowFix | undefined;
                        if (fix && fix.kind === 'handoff') {
                          const match = fix.command?.match(/\/repos\/([^/]+\/[^/]+)\/actions/);
                          if (match) {
                            return (
                              <a
                                href={`https://github.com/${match[1]}/settings/actions`}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-2 text-blue-400 hover:text-blue-300 underline text-[10px]"
                              >
                                Fix in Settings
                              </a>
                            );
                          }
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  {practice.practice_type === 'visual_docs' && practice.status !== 'healthy' && (
                    <div className="mt-2 ml-6 text-xs text-slate-400">
                      {practice.status === 'dormant'
                        ? visualDormantReason(practice.details)
                        : 'No architecture diagram or app screenshots found.'}
                      {' '}{(practice.details?.workflows as string[] | undefined)?.length ? 'See' : 'Add the CI recipe that regenerates them and rewrites a marked README block:'}{' '}
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

                  {/* Nested actions_pr_permission under visual_docs */}
                  {hasVisual && actionsPr && practice.practice_type === 'visual_docs' && (
                    <div className="mt-2 ml-6 text-xs">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(actionsPr.status)}
                        <span className="text-slate-300">Actions PR permission</span>
                        {getStatusBadge(actionsPr.status)}
                      </div>
                      <div className="text-slate-400 ml-5 mt-1">
                        Lets workflows that open or update PRs (the visual-docs bot) do so. Other workflows don&apos;t need it.
                      </div>
                      {actionsPr.status !== 'healthy' && !!actionsPr.details?.fix && (
                        <>
                          <HandoffCommand fix={actionsPr.details.fix as RowFix} />
                          {(() => {
                            const fix = actionsPr.details.fix as RowFix | undefined;
                            if (fix && fix.kind === 'handoff') {
                              const match = fix.command?.match(/\/repos\/([^/]+\/[^/]+)\/actions/);
                              if (match) {
                                return (
                                  <a
                                    href={`https://github.com/${match[1]}/settings/actions`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ml-2 text-blue-400 hover:text-blue-300 underline text-[10px]"
                                  >
                                    Fix in Settings
                                  </a>
                                );
                              }
                            }
                            return null;
                          })()}
                        </>
                      )}
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