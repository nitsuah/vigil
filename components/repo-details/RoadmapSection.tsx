"use client";

import { Map, GitPullRequest, Bot, Link2, Sparkles, Loader2 } from 'lucide-react';
import { RoadmapItem } from '@/types/repo';
import { renderInlineMarkdown } from '@/lib/markdown-utils';
import { useState } from 'react';

interface RoadmapSectionProps {
  roadmapItems: RoadmapItem[];
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  repoUrl?: string;
  repoName?: string;
  isAuthenticated?: boolean;
}

interface RoadmapLink {
  linked_pr_number: number | null;
  agent_task_id: string | null;
}

// Helper to get status icon and color
function getStatusDisplay(status: string) {
  switch (status) {
    case 'in-progress':
      return { icon: '🔵', label: 'In Progress', color: 'text-blue-400' };
    case 'completed':
      return { icon: '●', label: 'Completed', color: 'text-green-400' };
    default:
      return { icon: '○', label: 'Planned', color: 'text-purple-400' };
  }
}

type WorkflowStage = 'planned' | 'in-progress' | 'in-review' | 'done';

// Maps roadmap item status + linked PR presence to a pipeline stage.
// "In Review" is a sub-state of "in-progress" visible only when a PR is linked.
function getWorkflowStage(status: string, link: RoadmapLink): WorkflowStage {
  if (status === 'completed') return 'done';
  if (status === 'in-progress' && link.linked_pr_number) return 'in-review';
  if (status === 'in-progress') return 'in-progress';
  return 'planned';
}

export function RoadmapSection({ roadmapItems, isExpanded: isExpandedProp, onToggleExpanded, repoUrl, repoName, isAuthenticated }: RoadmapSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isMainExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const setIsMainExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(['card-0'])); // First card expanded by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAllPlanned, setShowAllPlanned] = useState(false);

  const [showSuggest, setShowSuggest] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const handleSuggest = async () => {
    if (!repoName) return;
    setSuggesting(true);
    setSuggestError(null);
    setSuggestions(null);
    try {
      const res = await fetch(`/api/repos/${repoName}/suggest-roadmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPrompt: userPrompt.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSuggestError(data.error || 'Failed to get suggestions');
        return;
      }
      setSuggestions(data.suggestions);
    } catch {
      setSuggestError('Failed to get suggestions');
    } finally {
      setSuggesting(false);
    }
  };

  // Local overrides applied after a successful link save, keyed by item id,
  // so the badge updates immediately without waiting for the next sync.
  const [linkOverrides, setLinkOverrides] = useState<Record<string, RoadmapLink>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [prInput, setPrInput] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hide section if no roadmap items
  if (!roadmapItems || roadmapItems.length === 0) {
    return null;
  }

  const getEffectiveLink = (item: RoadmapItem): RoadmapLink =>
    linkOverrides[item.id] || {
      linked_pr_number: item.linked_pr_number ?? null,
      agent_task_id: item.agent_task_id ?? null,
    };

  const handleEditToggle = (item: RoadmapItem) => {
    if (editingItemId === item.id) {
      setEditingItemId(null);
      return;
    }
    const effective = getEffectiveLink(item);
    setPrInput(effective.linked_pr_number ? String(effective.linked_pr_number) : '');
    setTaskInput(effective.agent_task_id || '');
    setSaveError(null);
    setEditingItemId(item.id);
  };

  const saveLink = async (itemId: string, linkedPrNumber: number | null, agentTaskId: string | null) => {
    if (!repoName) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/repos/${repoName}/roadmap-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedPrNumber, agentTaskId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save link');
        return;
      }
      setLinkOverrides(prev => ({ ...prev, [itemId]: { linked_pr_number: linkedPrNumber, agent_task_id: agentTaskId } }));
      setEditingItemId(null);
    } catch {
      setSaveError('Failed to save link');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (itemId: string) => {
    const trimmedPr = prInput.trim();
    const prNum = trimmedPr ? parseInt(trimmedPr, 10) : null;
    if (trimmedPr && (Number.isNaN(prNum) || (prNum as number) <= 0)) {
      setSaveError('PR # must be a positive number');
      return;
    }
    saveLink(itemId, prNum, taskInput.trim() || null);
  };

  const handleClear = (itemId: string) => {
    setPrInput('');
    setTaskInput('');
    saveLink(itemId, null, null);
  };

  const toggleCard = (cardKey: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(cardKey)) {
      newExpanded.delete(cardKey);
    } else {
      newExpanded.add(cardKey);
    }
    setExpandedCards(newExpanded);
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Filter out completed items unless showCompleted is true
  const filteredItems = showCompleted 
    ? roadmapItems 
    : roadmapItems.filter(item => item.status !== 'completed');

  const completedCount = roadmapItems.filter(item => item.status === 'completed').length;

  // Track total/completed counts per quarter across all items (including
  // completed ones) so progress bars stay accurate even when completed
  // items are hidden from the list.
  const quarterTotals: Record<string, { completed: number; total: number }> = {};
  roadmapItems.forEach(item => {
    const quarter = item.quarter || 'No Quarter';
    if (!quarterTotals[quarter]) {
      quarterTotals[quarter] = { completed: 0, total: 0 };
    }
    quarterTotals[quarter].total += 1;
    if (item.status === 'completed') {
      quarterTotals[quarter].completed += 1;
    }
  });

  // Group by quarter across all statuses
  const quarterGroups: Record<string, RoadmapItem[]> = {};
  filteredItems.forEach(item => {
    const quarter = item.quarter || 'No Quarter';
    if (!quarterGroups[quarter]) {
      quarterGroups[quarter] = [];
    }
    quarterGroups[quarter].push(item);
  });

  const quarters = Object.keys(quarterGroups).reverse();

  // Prefer the quarter explicitly marked "(IN PROGRESS)" in ROADMAP.md as the
  // current quarter so it surfaces first regardless of section ordering.
  const inProgressIndex = quarters.findIndex(q => /in progress/i.test(q));
  const orderedQuarters = inProgressIndex > 0
    ? [quarters[inProgressIndex], ...quarters.filter((_, idx) => idx !== inProgressIndex)]
    : quarters;

  // When showing completed, show all quarters by default
  const displayedQuarters = (showAllPlanned || showCompleted) ? orderedQuarters : orderedQuarters.slice(0, 1);

  // Count items per pipeline stage for the summary bar
  const stageCounts: Record<WorkflowStage, number> = { planned: 0, 'in-progress': 0, 'in-review': 0, done: 0 };
  roadmapItems.forEach(item => {
    stageCounts[getWorkflowStage(item.status, getEffectiveLink(item))]++;
  });
  const hasActiveWork = stageCounts['in-progress'] + stageCounts['in-review'] > 0;

  return (
    <div className="bg-gradient-to-br from-purple-900/30 via-slate-800/50 to-purple-800/20 rounded-lg overflow-hidden border border-purple-500/40 shadow-lg shadow-purple-500/10 hover:border-purple-400/50 transition-colors" data-tour="roadmap-section">
      <div
        onClick={setIsMainExpanded}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-purple-900/20 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Map className="h-4 w-4 text-purple-400" />
          <h4 className="text-sm font-semibold text-slate-200">Roadmap</h4>
          <span
            title={`Roadmap: ${roadmapItems.filter(i => i.status === 'completed').length}/${filteredItems.length} completed (${filteredItems.length} shown)`}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ml-1 ${
              roadmapItems.filter(i => i.status === 'completed').length === filteredItems.length
                ? 'bg-green-500/20 text-green-400'
                : roadmapItems.filter(i => i.status === 'completed').length >= filteredItems.length / 2
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {roadmapItems.filter(i => i.status === 'completed').length}/{filteredItems.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAuthenticated && repoName && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSuggest(!showSuggest);
                if (!showSuggest) setSuggestions(null);
              }}
              title="Get AI-powered roadmap suggestions"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                showSuggest ? 'bg-purple-500/30 text-purple-300' : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              }`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              Suggest
            </button>
          )}
          {quarters.length > 1 && !showCompleted && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAllPlanned(!showAllPlanned);
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              {showAllPlanned ? 'Show less' : `Show all (${quarters.length - 1})`}
            </button>
          )}
          {completedCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCompleted(!showCompleted);
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
            >
              {showCompleted ? 'Hide completed' : `Show completed (${completedCount})`}
            </button>
          )}
          <span className="text-slate-500 text-xs">{isMainExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      {isMainExpanded && (
        <div className="p-4 space-y-4">
          {showSuggest && isAuthenticated && repoName && (
            <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                <span className="text-[11px] font-semibold text-purple-300">AI Roadmap Suggestions</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Optional: focus area (e.g. 'performance', 'developer experience')"
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !suggesting && handleSuggest()}
                  className="flex-1 bg-slate-900/60 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleSuggest}
                  disabled={suggesting}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 shrink-0"
                >
                  {suggesting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                  {suggesting ? 'Thinking…' : 'Suggest'}
                </button>
              </div>
              {suggestError && <p className="text-[10px] text-red-400">{suggestError}</p>}
              {suggestions && (
                <div className="mt-2 space-y-1">
                  {suggestions.split('\n').filter(line => line.trim()).map((line, i) => (
                    <p key={i} className="text-[10px] text-slate-300 leading-relaxed">{line}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {hasActiveWork && (
            <div className="flex items-center gap-1 flex-wrap" title="Workflow pipeline stage breakdown">
              {(
                [
                  { stage: 'planned' as WorkflowStage, label: 'Planned', active: 'bg-purple-500/20 text-purple-400', inactive: 'bg-slate-800/50 text-slate-600' },
                  { stage: 'in-progress' as WorkflowStage, label: 'In Progress', active: 'bg-blue-500/20 text-blue-400', inactive: 'bg-slate-800/50 text-slate-600' },
                  { stage: 'in-review' as WorkflowStage, label: 'In Review', active: 'bg-cyan-500/20 text-cyan-400', inactive: 'bg-slate-800/50 text-slate-600' },
                  { stage: 'done' as WorkflowStage, label: 'Done', active: 'bg-green-500/20 text-green-400', inactive: 'bg-slate-800/50 text-slate-600' },
                ] as const
              ).map(({ stage, label, active, inactive }, idx) => (
                <span key={stage} className="flex items-center gap-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stageCounts[stage] > 0 ? active : inactive}`}>
                    {stageCounts[stage]} {label}
                  </span>
                  {idx < 3 && <span className="text-slate-600 text-[10px]">→</span>}
                </span>
              ))}
            </div>
          )}
          {roadmapItems.length === 0 ? (
            <div className="bg-slate-800/30 rounded-lg p-4">
              <p className="text-xs text-slate-500 italic">No roadmap items</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedQuarters.map(q => ({ quarter: q, items: quarterGroups[q] })).map((group, i) => {
            const cardKey = `card-${i}`;
            const isCardExpanded = expandedCards.has(cardKey);
            const isCompleted = group.items.every(item => item.status === 'completed');
            const headerColor = isCompleted ? 'text-green-400' : 'text-purple-400';
            const linkColor = isCompleted ? 'text-green-400 hover:text-green-300' : 'text-blue-400 hover:text-blue-300';
            const totals = quarterTotals[group.quarter] || { completed: 0, total: group.items.length };
            const progressPct = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0;
            const progressColor = progressPct === 100 ? 'bg-green-500' : progressPct > 0 ? 'bg-purple-500' : 'bg-slate-600';

            return (
              <div key={i} className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700/50 hover:border-slate-600/50 transition-colors">
                <button
                  onClick={() => toggleCard(cardKey)}
                  className="w-full px-4 py-3 text-left hover:bg-slate-700/40 transition-colors border-b border-slate-700/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${headerColor}`}>{group.quarter}</span>
                      <span className="text-[11px] text-slate-500">({group.items.length} items)</span>
                    </div>
                    <span className="text-slate-500 text-xs">{isCardExpanded ? '▼' : '▶'}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2" title={`${totals.completed}/${totals.total} completed`}>
                    <div className="flex-1 bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progressColor}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                      {totals.completed}/{totals.total} done
                    </span>
                  </div>
                </button>
                {isCardExpanded && (
                  <div className="px-4 py-3">
                    <ul className="space-y-1">
                      {(expandedSections.has(`quarter-${i}`)
                        ? group.items
                        : group.items.slice(0, 5)
                      ).map((item, j) => {
                        const statusDisplay = getStatusDisplay(item.status);
                        const link = getEffectiveLink(item);
                        const stage = getWorkflowStage(item.status, link);
                        const isEditing = editingItemId === item.id;
                        return (
                          <li key={j} className="text-xs text-slate-300 flex flex-col gap-1">
                            <div className="flex items-start gap-2">
                              <span
                                className={`mt-1 text-[10px] ${statusDisplay.color}`}
                                title={stage === 'in-review' ? 'In Review' : statusDisplay.label}
                              >
                                {stage === 'in-review' ? '⬤' : statusDisplay.icon}
                              </span>
                              <span className={item.status === 'completed' ? 'line-through text-slate-500' : ''}>
                                {renderInlineMarkdown(item.title)}
                              </span>
                              {link.linked_pr_number && repoUrl && (
                                <a
                                  href={`${repoUrl}/pull/${link.linked_pr_number}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Linked PR #${link.linked_pr_number}`}
                                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors shrink-0"
                                >
                                  <GitPullRequest className="h-2.5 w-2.5" />
                                  #{link.linked_pr_number}
                                </a>
                              )}
                              {link.agent_task_id && (
                                <span
                                  title={`Linked agent task: ${link.agent_task_id}`}
                                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-400 shrink-0 max-w-[8rem] truncate"
                                >
                                  <Bot className="h-2.5 w-2.5 shrink-0" />
                                  {link.agent_task_id}
                                </span>
                              )}
                              {isAuthenticated && repoName && (
                                <button
                                  onClick={() => handleEditToggle(item)}
                                  title="Link to a PR or Agent Task Queue entry"
                                  className={`inline-flex items-center px-1 py-0.5 rounded text-[10px] shrink-0 transition-colors ${
                                    isEditing ? 'bg-slate-600/60 text-slate-200' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                                  }`}
                                >
                                  <Link2 className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>
                            {isEditing && (
                              <div className="ml-5 flex items-center gap-1.5 flex-wrap">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="PR #"
                                  value={prInput}
                                  onChange={(e) => setPrInput(e.target.value)}
                                  className="w-16 bg-slate-900/60 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:border-blue-500"
                                />
                                <input
                                  type="text"
                                  placeholder="Agent task ID"
                                  value={taskInput}
                                  onChange={(e) => setTaskInput(e.target.value)}
                                  className="w-32 bg-slate-900/60 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:border-blue-500"
                                />
                                <button
                                  onClick={() => handleSave(item.id)}
                                  disabled={saving}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => handleClear(item.id)}
                                  disabled={saving}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors disabled:opacity-50"
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setEditingItemId(null)}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
                                >
                                  Cancel
                                </button>
                                {saveError && <span className="text-[10px] text-red-400">{saveError}</span>}
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {group.items.length > 5 && (
                        <button
                          onClick={() => toggleSection(`quarter-${i}`)}
                          className={`text-[10px] ${linkColor} pl-3`}
                        >
                          {expandedSections.has(`quarter-${i}`)
                            ? 'Show less'
                            : `+${group.items.length - 5} more`}
                        </button>
                      )}
                    </ul>
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