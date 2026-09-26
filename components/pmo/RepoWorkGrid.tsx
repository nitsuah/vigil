"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, Bot, CheckCircle2, ChevronRight, GitPullRequest, LayoutGrid, RefreshCw, Zap,
} from 'lucide-react';
import type { PmoRepoSummary, PmoInProgressItem } from '@/app/api/pmo/overview/route';
import type { OpenTaskRollup } from '@/lib/task-rollup';
import { MAX_ROLLUP_LIMIT } from '@/lib/task-rollup';
import { groupWorkByRepo, PRIORITY_KEYS, type PriorityKey, type RepoWorkGroup } from '@/lib/pmo-grid';
import { healthGrade } from '@/lib/health-grade';

const CHIP_COLOR: Record<PriorityKey, string> = {
    P0:   'text-red-400 border-red-500/40 bg-red-500/10',
    P1:   'text-amber-400 border-amber-500/40 bg-amber-500/10',
    P2:   'text-blue-400 border-blue-500/40 bg-blue-500/10',
    P3:   'text-slate-300 border-slate-500/40 bg-slate-500/10',
    none: 'text-slate-500 border-slate-600/40 bg-slate-600/10',
};

/** Tasks shown per card before "+N more". */
const PREVIEW_ROWS = 4;

type OnHandoff = (repoName: string, item: PmoInProgressItem, taskId: string) => void;

function ciColor(status: string | null): string {
    if (status === 'passing') return 'text-emerald-400';
    if (status === 'failing') return 'text-red-400';
    return 'text-slate-500';
}

function gradeColor(score: number | null): string {
    if (score === null) return 'text-slate-400 border-slate-600/40';
    if (score >= 90) return 'text-emerald-300 border-emerald-400/50 bg-emerald-500/15';
    if (score >= 80) return 'text-green-400 border-green-500/40 bg-green-500/10';
    if (score >= 70) return 'text-yellow-400 border-yellow-500/35 bg-yellow-500/10';
    if (score >= 60) return 'text-orange-400 border-orange-500/40 bg-orange-500/10';
    return 'text-red-400 border-red-500/50 bg-red-500/15';
}

function HealthBadge({ score }: { score: number | null }): React.JSX.Element {
    return (
        <span
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-black ${gradeColor(score)}`}
            title={`Health: ${score ?? 'unknown'}/100`}
        >
            {score === null ? '?' : healthGrade(score)}
            {score !== null && <span className="text-[9px] font-normal opacity-70 tabular-nums">{score}</span>}
        </span>
    );
}

// ─── handoff button (roadmap items in flight) ─────────────────────────────────

function HandoffButton({ repoName, item, onHandoff }: {
    repoName: string;
    item: PmoInProgressItem;
    onHandoff: OnHandoff;
}): React.JSX.Element {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(!!item.agent_task_id);
    const [err, setErr] = useState<string | null>(null);

    const handle = async (): Promise<void> => {
        setLoading(true);
        setErr(null);
        try {
            const taskRes = await fetch('/api/agent/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'roadmap-handoff',
                    priority: 'normal',
                    payload: { repoName, itemId: item.id, title: item.title, quarter: item.quarter },
                }),
            });
            if (!taskRes.ok) throw new Error('Agent task queue error');
            const { task } = await taskRes.json() as { task: { id: string } };

            const patchRes = await fetch(`/api/repos/${repoName}/roadmap-items/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentTaskId: task.id }),
            });
            if (!patchRes.ok) throw new Error('Failed to link agent task');

            onHandoff(repoName, item, task.id);
            setDone(true);
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Error');
        } finally {
            setLoading(false);
        }
    };

    if (done) {
        return (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium shrink-0">
                <CheckCircle2 className="h-3 w-3" /> Queued
            </span>
        );
    }

    return (
        <span className="flex items-center gap-1.5 shrink-0">
            {err && <span className="text-[10px] text-red-400">{err}</span>}
            <button
                type="button"
                onClick={() => void handle()}
                disabled={loading}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 disabled:opacity-50"
            >
                {loading ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <Bot className="h-2.5 w-2.5" />}
                {loading ? 'Queuing…' : 'Hand off'}
                {!loading && <ChevronRight className="h-2.5 w-2.5 opacity-60" />}
            </button>
        </span>
    );
}

// ─── repo card: header + its open work, most urgent first ─────────────────────

function RepoWorkCard({ group, onHandoff }: {
    group: RepoWorkGroup<PmoRepoSummary>;
    onHandoff: OnHandoff;
}): React.JSX.Element {
    const { repo, tasks, open_total } = group;
    const [showAll, setShowAll] = useState(false);
    const [showRoadmap, setShowRoadmap] = useState(false);
    const shown = showAll ? tasks : tasks.slice(0, PREVIEW_ROWS);
    const hidden = tasks.length - shown.length;
    const pct = repo.roadmap.total ? Math.round((repo.roadmap.done / repo.roadmap.total) * 100) : null;
    const stale = repo.roadmap.stale_count;

    return (
        <article
            className={`rounded-xl border bg-slate-900/60 flex flex-col min-w-0 ${stale ? 'border-amber-500/30' : 'border-white/8'}`}
            aria-label={repo.full_name}
        >
            <header className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
                <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={repo.full_name}
                    className="text-sm font-bold text-slate-100 hover:text-sky-300 truncate min-w-0"
                >
                    {repo.name}
                </a>
                {stale > 0 && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold text-amber-400" title={`${stale} roadmap item(s) in progress without a PR`}>
                        <AlertTriangle className="h-2.5 w-2.5" /> {stale}
                    </span>
                )}
                <span className="ml-auto flex items-center gap-2 shrink-0">
                    {pct !== null && (
                        <span className="text-[10px] text-slate-500 tabular-nums" title={`Roadmap ${repo.roadmap.done}/${repo.roadmap.total} done`}>
                            {pct}%
                        </span>
                    )}
                    {repo.open_prs > 0 && (
                        <span className="flex items-center gap-0.5 text-[11px] text-sky-400" title={`${repo.open_prs} open PR(s)`}>
                            <GitPullRequest className="h-3 w-3" /> {repo.open_prs}
                        </span>
                    )}
                    <Zap className={`h-3 w-3 ${ciColor(repo.ci_status)}`} aria-label={`CI ${repo.ci_status ?? 'unknown'}`} />
                    <HealthBadge score={repo.health_score} />
                </span>
            </header>

            <ul className="flex-1 divide-y divide-white/5">
                {shown.map((t, i) => (
                    <li key={`${t.title}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <span className={`shrink-0 w-8 text-center rounded border py-px text-[10px] font-semibold ${CHIP_COLOR[t.priority ?? 'none']}`}>
                            {t.priority ?? '—'}
                        </span>
                        {t.status === 'in-progress' && (
                            <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-blue-400" title="In progress" />
                        )}
                        <span className="text-slate-200 truncate" title={t.title.replace(/\*\*/g, '')}>
                            {t.title.replace(/\*\*/g, '')}
                        </span>
                    </li>
                ))}
            </ul>

            <footer className="px-3 py-1.5 flex items-center gap-3 text-[11px] text-slate-500 border-t border-white/5">
                {hidden > 0 || showAll ? (
                    <button type="button" onClick={() => setShowAll((s) => !s)} className="hover:text-slate-300">
                        {showAll ? 'Show less' : `+${hidden} more`}
                    </button>
                ) : null}
                <span className="tabular-nums">{open_total} open</span>
                {repo.in_progress_items.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowRoadmap((s) => !s)}
                        aria-expanded={showRoadmap}
                        className="ml-auto text-blue-400/80 hover:text-blue-300"
                    >
                        {repo.in_progress_items.length} roadmap in flight
                    </button>
                )}
            </footer>

            {showRoadmap && (
                <ul className="px-3 pb-2 space-y-1 border-t border-white/5 pt-1.5">
                    {repo.in_progress_items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 text-[11px]">
                            <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${item.linked_pr_number ? 'bg-violet-400' : 'bg-blue-400'}`} />
                            <span className="text-slate-300 truncate flex-1" title={item.title}>{item.title}</span>
                            {item.linked_pr_number
                                ? <span className="shrink-0 text-[10px] text-violet-400">#{item.linked_pr_number}</span>
                                : <HandoffButton repoName={repo.name} item={item} onHandoff={onHandoff} />}
                        </li>
                    ))}
                </ul>
            )}
        </article>
    );
}

// ─── section ──────────────────────────────────────────────────────────────────

/**
 * Repos and their open TASKS.md work in one grid. Each card lists that repo's
 * open tasks, most urgent first; cards are ordered by the urgency of their
 * work. Repos with nothing matching the priority filter collapse into one row.
 * Tasks come from the same rollup as the get_open_tasks MCP tool.
 */
export function RepoWorkGrid({ repos, refreshKey, onHandoff }: {
    repos: PmoRepoSummary[];
    refreshKey?: number;
    onHandoff: OnHandoff;
}): React.JSX.Element {
    const [rollup, setRollup] = useState<OpenTaskRollup | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // P0/P1 by default: "what matters now", not the whole backlog.
    const [priorities, setPriorities] = useState<Set<PriorityKey>>(new Set(['P0', 'P1']));
    const loadSeq = useRef(0);

    // One unfiltered load; priority filtering is client-side so chips are instant.
    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/pmo/tasks?limit=${MAX_ROLLUP_LIMIT}`);
            if (!res.ok) throw new Error('Failed to load open tasks');
            const data = await res.json() as OpenTaskRollup;
            if (seq === loadSeq.current) setRollup(data);
        } catch (e) {
            if (seq === loadSeq.current) setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            if (seq === loadSeq.current) setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load, refreshKey]);

    const { active, idle } = useMemo(
        () => groupWorkByRepo(repos, rollup?.tasks ?? [], priorities),
        [repos, rollup, priorities],
    );

    const toggle = (p: PriorityKey) => setPriorities((prev) => {
        const next = new Set(prev);
        if (next.has(p)) next.delete(p); else next.add(p);
        return next;
    });

    const total = rollup?.total ?? 0;

    return (
        <section className="space-y-3" aria-labelledby="repo-work-heading">
            <div className="flex items-center gap-2 flex-wrap">
                <h2 id="repo-work-heading" className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-2">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Repos &amp; open work
                </h2>
                {PRIORITY_KEYS.map((p) => (
                    <button
                        key={p}
                        type="button"
                        onClick={() => toggle(p)}
                        aria-pressed={priorities.has(p)}
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-opacity ${CHIP_COLOR[p]} ${priorities.has(p) ? '' : 'opacity-40'}`}
                    >
                        {p === 'none' ? 'None' : p} <span className="tabular-nums">{rollup?.by_priority[p] ?? 0}</span>
                    </button>
                ))}
                <span className="ml-auto text-xs text-slate-500">
                    {total} open task{total !== 1 ? 's' : ''} · {repos.length} repo{repos.length !== 1 ? 's' : ''}
                </span>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/30 text-red-400 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
                    <button type="button" onClick={() => void load()} className="ml-auto underline">Retry</button>
                </div>
            )}
            {loading && !rollup && (
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading open tasks…
                </div>
            )}
            {rollup?.truncated && (
                <p className="text-[11px] text-amber-400/80">
                    Showing the {rollup.tasks.length} most urgent of {rollup.total} open tasks.
                </p>
            )}

            {active.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5 items-start">
                    {active.map((g) => <RepoWorkCard key={g.repo.id} group={g} onHandoff={onHandoff} />)}
                </div>
            )}
            {rollup && priorities.size > 0 && active.length === 0 && (
                <p className="text-xs text-slate-500">No open tasks at these priorities.</p>
            )}

            {idle.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    <span className="text-slate-500 mr-1">
                        {priorities.size === 0 ? 'Select a priority' : 'Nothing at these priorities'}:
                    </span>
                    {idle.map(({ repo, open_total }) => (
                        <a
                            key={repo.id}
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${repo.full_name} · ${open_total} open task(s) at other priorities`}
                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/8 bg-slate-900/60 text-slate-300 hover:border-white/20"
                        >
                            {repo.name}
                            <span className={`tabular-nums text-[10px] ${gradeColor(repo.health_score).split(' ')[0]}`}>{repo.health_score ?? '?'}</span>
                            {open_total > 0 && <span className="text-slate-500 tabular-nums">· {open_total}</span>}
                        </a>
                    ))}
                </div>
            )}
        </section>
    );
}
