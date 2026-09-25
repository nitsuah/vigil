"use client";

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ListTodo, RefreshCw } from 'lucide-react';
import { rollupOpenTasks, MAX_ROLLUP_LIMIT, type OpenTask, type OpenTaskRollup } from '@/lib/task-rollup';
import type { TaskPriority } from '@/types/repo';

type PriorityChip = TaskPriority | 'none';

const CHIPS: { key: PriorityChip; label: string; color: string }[] = [
    { key: 'P0',   label: 'P0',   color: 'text-red-400 border-red-500/40 bg-red-500/10' },
    { key: 'P1',   label: 'P1',   color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
    { key: 'P2',   label: 'P2',   color: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
    { key: 'P3',   label: 'P3',   color: 'text-slate-300 border-slate-500/40 bg-slate-500/10' },
    { key: 'none', label: 'None', color: 'text-slate-500 border-slate-600/40 bg-slate-600/10' },
];

const VISIBLE_ROWS = 50;

/**
 * Cross-repo "Open work": every unfinished TASKS.md item across the tracked
 * portfolio, grouped by priority. Loads the whole open set once and filters
 * locally with the same rollup the get_open_tasks MCP tool uses.
 */
export function OpenWorkPanel() {
    const [all, setAll] = useState<OpenTask[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // P0/P1 by default: the view is "what matters now", not the whole backlog.
    const [priorities, setPriorities] = useState<Set<PriorityChip>>(new Set(['P0', 'P1']));
    const [repo, setRepo] = useState('');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/pmo/tasks?limit=${MAX_ROLLUP_LIMIT}`);
            if (!res.ok) throw new Error('Failed to load open tasks');
            const data = await res.json() as OpenTaskRollup;
            setAll(data.tasks);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const unfiltered = useMemo(() => rollupOpenTasks(all ?? [], { limit: 1 }), [all]);
    const view = useMemo(
        () => rollupOpenTasks(all ?? [], {
            priorities: [...priorities],
            repos: repo ? [repo] : undefined,
            limit: VISIBLE_ROWS,
        }),
        [all, priorities, repo],
    );
    const repoNames = useMemo(() => Object.keys(unfiltered.by_repo).sort(), [unfiltered]);

    const toggle = (p: PriorityChip) => setPriorities(prev => {
        const next = new Set(prev);
        if (next.has(p)) next.delete(p); else next.add(p);
        return next;
    });

    return (
        <section className="space-y-3" aria-labelledby="open-work-heading">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 id="open-work-heading" className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ListTodo className="h-3.5 w-3.5" />
                    Open work
                </h2>
                <span className="text-xs text-slate-500">
                    {unfiltered.total} open task{unfiltered.total !== 1 ? 's' : ''} across {repoNames.length} repo{repoNames.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                {CHIPS.map(c => {
                    const on = priorities.has(c.key);
                    return (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => toggle(c.key)}
                            aria-pressed={on}
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-opacity ${c.color} ${on ? '' : 'opacity-40'}`}
                        >
                            {c.label} <span className="tabular-nums">{unfiltered.by_priority[c.key]}</span>
                        </button>
                    );
                })}
                <select
                    value={repo}
                    onChange={e => setRepo(e.target.value)}
                    aria-label="Filter by repo"
                    className="ml-auto text-xs bg-slate-900 border border-white/10 rounded px-2 py-1 text-slate-300"
                >
                    <option value="">All repos</option>
                    {repoNames.map(n => <option key={n} value={n}>{n} ({unfiltered.by_repo[n]})</option>)}
                </select>
            </div>

            <div className="rounded-xl border border-white/8 bg-slate-900/60 divide-y divide-white/5">
                {error && (
                    <div className="flex items-center gap-2 p-3 text-red-400 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
                        <button type="button" onClick={() => void load()} className="ml-auto underline">Retry</button>
                    </div>
                )}
                {loading && !all && (
                    <div className="flex items-center gap-2 p-3 text-slate-500 text-xs">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading open tasks…
                    </div>
                )}
                {all && view.tasks.length === 0 && (
                    <p className="p-3 text-xs text-slate-500">No open tasks match these filters.</p>
                )}
                {view.tasks.map((t, i) => (
                    <div key={`${t.full_name}-${i}`} className="flex items-start gap-3 px-3 py-2 text-xs">
                        <span className={`shrink-0 w-9 text-center rounded border px-1 py-0.5 text-[10px] font-semibold ${CHIPS.find(c => c.key === (t.priority ?? 'none'))?.color}`}>
                            {t.priority ?? '—'}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-slate-200 break-words">{t.title.replace(/\*\*/g, '')}</p>
                            <p className="text-slate-500 mt-0.5 truncate">
                                {t.repo_url
                                    ? <a href={t.repo_url} target="_blank" rel="noreferrer" className="hover:text-slate-300">{t.repo}</a>
                                    : t.repo}
                                {t.subsection || t.section ? ` · ${t.subsection || t.section}` : ''}
                                {t.owner ? ` · owner: ${t.owner}` : ''}
                            </p>
                        </div>
                        {t.status === 'in-progress' && (
                            <span className="shrink-0 text-[10px] text-blue-400">in progress</span>
                        )}
                    </div>
                ))}
                {view.truncated && (
                    <p className="px-3 py-2 text-[11px] text-slate-500">
                        Showing {view.tasks.length} of {view.total}. Narrow by repo or priority to see the rest.
                    </p>
                )}
            </div>
        </section>
    );
}
