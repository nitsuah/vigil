"use client";

import { ListTodo } from 'lucide-react';
import { Task } from '@/types/repo';
import { parseBoldText } from '@/lib/markdown-utils';
import { useState } from 'react';

interface TasksSectionProps {
  tasks: Task[];
  /** TASKS.md exists (doc_status). With zero parsed items, show an empty card rather than nothing. */
  tasksDocExists?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

// Helper to get status icon and color
function getStatusDisplay(status: string) {
  switch (status) {
    case 'in-progress':
      return { icon: '🟡', label: 'In Progress', color: 'text-yellow-400' };
    case 'done':
      return { icon: '●', label: 'Done', color: 'text-green-400' };
    default:
      return { icon: '○', label: 'Todo', color: 'text-blue-400' };
  }
}

export function TasksSection({ tasks, tasksDocExists = false, isExpanded: isExpandedProp, onToggleExpanded }: TasksSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(true);
  const isMainExpanded = isExpandedProp !== undefined ? isExpandedProp : internalExpanded;
  const setIsMainExpanded = onToggleExpanded || (() => setInternalExpanded(!internalExpanded));
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(['card-0'])); // First card expanded by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(false);
  const [showAllTodo, setShowAllTodo] = useState(false);

  if (!tasks || tasks.length === 0) {
    // A missing TASKS.md is flagged by the Documentation card; nothing to show here.
    if (!tasksDocExists) return null;
    // The file exists but has no "- [ ]" items (e.g. every section says "None"):
    // say so, instead of the card vanishing as if the file were missing.
    return (
      <div className="bg-gradient-to-br from-blue-900/30 via-slate-800/50 to-blue-800/20 rounded-lg overflow-hidden border border-blue-500/40 shadow-lg shadow-blue-500/10" data-tour="tasks-section">
        <div className="w-full px-4 py-3 flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-blue-400" />
          <h4 className="text-sm font-semibold text-slate-200">Tasks</h4>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium ml-1 bg-slate-500/20 text-slate-400">0</span>
        </div>
        <p className="px-4 pb-3 text-xs text-slate-400">
          TASKS.md found, but it has no task items. Vigil reads <code className="text-slate-300">- [ ]</code> / <code className="text-slate-300">- [x]</code> checklist lines.
        </p>
      </div>
    );
  }

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

  // Filter out done items unless showDone is true
  const filteredTasks = showDone 
    ? tasks 
    : tasks.filter(task => task.status !== 'done');

  const doneCount = tasks.filter(task => task.status === 'done').length;

  // Group by subsection first, then by status as fallback
  const subsectionGroups: Record<string, Task[]> = {};
  filteredTasks.forEach(task => {
    // Prioritize subsection over status for grouping
    const key = task.subsection && task.subsection.trim() 
      ? task.subsection.trim()
      : `${task.status}-tasks`; // Use suffix to distinguish status-based groups
    if (!subsectionGroups[key]) {
      subsectionGroups[key] = [];
    }
    subsectionGroups[key].push(task);
  });

  // Get subsection order: prioritize actual subsections over status-based groups
  const subsections = Object.keys(subsectionGroups).sort((a, b) => {
    // Actual subsections first (not status-based groups)
    const aIsStatus = a.endsWith('-tasks');
    const bIsStatus = b.endsWith('-tasks');
    if (!aIsStatus && bIsStatus) return -1;
    if (aIsStatus && !bIsStatus) return 1;
    // Among status groups, in-progress first
    if (aIsStatus && bIsStatus) {
      if (a === 'in-progress-tasks') return -1;
      if (b === 'in-progress-tasks') return 1;
    }
    return 0;
  }).reverse();
  
  // When showing done, show all subsections by default
  const displayedSubsections = (showAllTodo || showDone) ? subsections : subsections.slice(0, 1);

  return (
    <div className="bg-gradient-to-br from-blue-900/30 via-slate-800/50 to-blue-800/20 rounded-lg overflow-hidden border border-blue-500/40 shadow-lg shadow-blue-500/10 hover:border-blue-400/50 transition-colors" data-tour="tasks-section">
      <div
        onClick={setIsMainExpanded}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-900/20 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-blue-400" />
          <h4 className="text-sm font-semibold text-slate-200">Tasks</h4>
          <span
            title={`Tasks: ${tasks.filter(t => t.status === 'done').length}/${filteredTasks.length} completed (${filteredTasks.length} shown)`}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ml-1 ${
              tasks.filter(t => t.status === 'done').length === filteredTasks.length
                ? 'bg-green-500/20 text-green-400'
                : tasks.filter(t => t.status === 'done').length >= filteredTasks.length / 2
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}
          >
            {tasks.filter(t => t.status === 'done').length}/{filteredTasks.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {subsections.length > 1 && !showDone && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAllTodo(!showAllTodo);
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
            >
              {showAllTodo ? 'Show less' : `Show all (${subsections.length - 1})`}
            </button>
          )}
          {doneCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDone(!showDone);
              }}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
            >
              {showDone ? 'Hide done' : `Show done (${doneCount})`}
            </button>
          )}
          <span className="text-slate-500 text-xs">{isMainExpanded ? '▼' : '▶'}</span>
        </div>
      </div>
      {isMainExpanded && (
        <div className="p-4 space-y-4">
          {tasks.length === 0 ? (
            <div className="bg-slate-800/30 rounded-lg p-4">
              <p className="text-xs text-slate-500 italic">No tasks defined</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedSubsections.map(s => ({ subsection: s, items: subsectionGroups[s] })).map((group, i) => {
            // Format display name - handle status-based groups
            let displayName = group.subsection;
            if (group.subsection.endsWith('-tasks')) {
              const status = group.subsection.replace('-tasks', '');
              displayName = status === 'in-progress' 
                ? 'In Progress' 
                : status.charAt(0).toUpperCase() + status.slice(1);
            }
            
            const cardKey = `card-${i}`;
            const isCardExpanded = expandedCards.has(cardKey);
            const isDone = group.items.every(item => item.status === 'done');
            const headerColor = isDone ? 'text-green-400' : 'text-blue-400';
            const linkColor = isDone ? 'text-green-400 hover:text-green-300' : 'text-blue-400 hover:text-blue-300';
            
            return (
              <div key={i} className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-700/50 hover:border-slate-600/50 transition-colors">
                <button
                  onClick={() => toggleCard(cardKey)}
                  className="w-full px-4 py-3 text-left hover:bg-slate-700/40 transition-colors border-b border-slate-700/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${headerColor}`}>{displayName}</span>
                      <span className="text-[11px] text-slate-500">({group.items.length} items)</span>
                    </div>
                    <span className="text-slate-500 text-xs">{isCardExpanded ? '▼' : '▶'}</span>
                  </div>
                </button>
                {isCardExpanded && (
                  <div className="px-4 py-3">
                    <ul className="space-y-1">
                      {(expandedSections.has(`subsection-${i}`)
                        ? group.items
                        : group.items.slice(0, 5)
                      ).map((item, j) => {
                        const statusDisplay = getStatusDisplay(item.status);
                        return (
                          <li key={j} className="text-xs text-slate-300 flex items-start gap-2">
                            <span className={`mt-1 text-[10px] ${statusDisplay.color}`} title={statusDisplay.label}>
                              {statusDisplay.icon}
                            </span>
                            <span className={item.status === 'done' ? 'line-through text-slate-500' : ''}>
                              {parseBoldText(item.title)}
                            </span>
                          </li>
                        );
                      })}
                      {group.items.length > 5 && (
                        <button
                          onClick={() => toggleSection(`subsection-${i}`)}
                          className={`text-[10px] ${linkColor} pl-3`}
                        >
                          {expandedSections.has(`subsection-${i}`)
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
