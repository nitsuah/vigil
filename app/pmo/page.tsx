"use client";

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Circle, MessageSquare,
} from 'lucide-react';
import type { PmoRepoSummary, PmoPortfolio, PmoInProgressItem } from '@/app/api/pmo/overview/route';
import { PmoChat } from '@/components/pmo/PmoChat';
import { RepoWorkGrid } from '@/components/pmo/RepoWorkGrid';
import { DependencyGraph } from '@/components/dashboard/DependencyGraph';

// ─── pipeline stage count cell ────────────────────────────────────────────────

function StageCell({ label, count, color, sub }: {
    label: string;
    count: number;
    color: string;
    sub?: string;
}): React.JSX.Element {
    return (
        <div className="flex flex-col items-center gap-1 flex-1 py-4 px-2 sm:px-3 border-r last:border-r-0 border-white/5">
            <span className={`text-2xl sm:text-3xl font-black tabular-nums ${color}`}>{count}</span>
            <span className="text-[10px] sm:text-xs font-semibold text-slate-300 uppercase tracking-wider text-center">{label}</span>
            {sub && <span className="text-[9px] sm:text-[10px] text-slate-500 text-center">{sub}</span>}
        </div>
    );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PmoDashboard(): React.JSX.Element | null {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [repos, setRepos] = useState<PmoRepoSummary[]>([]);
    const [portfolio, setPortfolio] = useState<PmoPortfolio | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    const [chatOpen, setChatOpen] = useState(false);

    useEffect(() => {
        if (status === 'unauthenticated') router.replace('/');
    }, [status, router]);

    const fetchOverview = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/pmo/overview');
            if (res.status === 401) { router.replace('/'); return; }
            if (!res.ok) throw new Error('Failed to load PMO data');
            const data = await res.json() as { repos: PmoRepoSummary[]; portfolio: PmoPortfolio };
            setRepos(data.repos);
            setPortfolio(data.portfolio);
            setLastFetched(new Date());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        if (status === 'authenticated') void fetchOverview();
    }, [status, fetchOverview]);

    const handleHandoff = useCallback((repoName: string, item: PmoInProgressItem, taskId: string): void => {
        setRepos(prev => prev.map(r => {
            if (r.name !== repoName) return r;
            return {
                ...r,
                in_progress_items: r.in_progress_items.map(i =>
                    i.id === item.id ? { ...i, agent_task_id: taskId } : i
                ),
            };
        }));
    }, []);

    if (status === 'loading' || (status === 'authenticated' && loading && !portfolio)) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Loading PMO data…</span>
                </div>
            </div>
        );
    }

    if (!session) return null;

    const totalRoadmap = portfolio
        ? portfolio.roadmap_planned + portfolio.roadmap_in_progress + portfolio.roadmap_in_review + portfolio.roadmap_done
        : 0;

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            {/* Top bar */}
            <header className="sticky top-0 z-10 border-b border-white/8 bg-slate-950/90 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Link
                        href="/"
                        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Dashboard</span>
                    </Link>
                    <span className="text-slate-700 hidden sm:inline">|</span>
                    <h1 className="text-sm font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent truncate">
                        PMO
                    </h1>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {lastFetched && (
                        <span className="text-[11px] text-slate-600 hidden sm:inline">
                            {lastFetched.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setChatOpen(o => !o)}
                        aria-label={chatOpen ? 'Close PMO assistant' : 'Open PMO assistant'}
                        aria-expanded={chatOpen}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${chatOpen
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600 hover:text-slate-200'
                            }`}
                    >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Assistant</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => void fetchOverview()}
                        disabled={loading}
                        aria-label="Refresh PMO data"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </button>
                </div>
            </header>

            {/* Main layout: stacks on mobile, side-by-side on sm+ when chat is open */}
            <div className={`flex flex-col sm:flex-row h-[calc(100vh-52px)] ${chatOpen ? 'overflow-hidden' : ''}`}>
                {/* Main content */}
                <main className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
                    {error && (
                        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Portfolio pipeline summary */}
                    {portfolio && (
                        <section className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    Portfolio Pipeline
                                </h2>
                                <span className="text-xs text-slate-500 shrink-0">
                                    {portfolio.repo_count} repo{portfolio.repo_count !== 1 ? 's' : ''} · {totalRoadmap} items
                                </span>
                            </div>

                            <div className="rounded-xl border border-white/8 bg-slate-900/60 flex overflow-hidden">
                                <StageCell label="Planned"     count={portfolio.roadmap_planned}     color="text-slate-300"   sub="not started" />
                                <StageCell label="In Progress" count={portfolio.roadmap_in_progress} color="text-blue-400"    sub="no PR yet" />
                                <StageCell label="In Review"   count={portfolio.roadmap_in_review}   color="text-violet-400"  sub="PR open" />
                                <StageCell label="Done"        count={portfolio.roadmap_done}         color="text-emerald-400" sub="completed" />
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                                {portfolio.tasks_in_progress > 0 && (
                                    <span className="flex items-center gap-1 text-blue-400/80">
                                        <Circle className="h-2.5 w-2.5 fill-blue-400" />
                                        {portfolio.tasks_in_progress} task{portfolio.tasks_in_progress !== 1 ? 's' : ''} in progress
                                    </span>
                                )}
                                {portfolio.stale_count > 0 && (
                                    <span className="flex items-center gap-1 text-amber-400/80">
                                        <AlertTriangle className="h-3 w-3" />
                                        {portfolio.stale_count} item{portfolio.stale_count !== 1 ? 's' : ''} without a linked PR
                                    </span>
                                )}
                                {portfolio.stale_count === 0 && portfolio.roadmap_in_progress === 0 && (
                                    <span className="flex items-center gap-1 text-emerald-400/70">
                                        <CheckCircle2 className="h-3 w-3" />
                                        All in-progress items have linked PRs
                                    </span>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Repos and their open TASKS.md work, most urgent first */}
                    {repos.length > 0 && (
                        <RepoWorkGrid repos={repos} refreshKey={lastFetched?.getTime()} onHandoff={handleHandoff} />
                    )}

                    {/* Cross-Repo Dependencies */}
                    <section className="space-y-3">
                        <DependencyGraph />
                    </section>

                    {!loading && repos.length === 0 && !error && (
                        <div className="text-center py-16 text-slate-600">
                            <p>No repos tracked yet.</p>
                            <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
                                Add repos from the dashboard →
                            </Link>
                        </div>
                    )}
                </main>

                {/* Chat side panel */}
                {chatOpen && portfolio && (
                    <aside className="w-full sm:w-80 lg:w-96 xl:w-[420px] shrink-0 border-t sm:border-t-0 sm:border-l border-white/8 bg-slate-950/95 flex flex-col h-[60vh] sm:h-auto">
                        <PmoChat repos={repos} portfolio={portfolio} onClose={() => setChatOpen(false)} />
                    </aside>
                )}
            </div>
        </div>
    );
}
