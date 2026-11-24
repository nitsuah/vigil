"use client";

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import type { MetricsOverview } from '@/app/api/metrics/overview/route';
import { BurnUpChart } from '@/components/metrics/BurnUpChart';
import { LeadTimeChart, OpenedClosedBars } from '@/components/metrics/FlowCharts';
import { MetricsFilters } from '@/components/metrics/MetricsFilters';
import { RepoBreakdown } from '@/components/metrics/RepoBreakdown';
import { ScoreCard } from '@/components/metrics/ScoreCard';
import { filtersToQuery, parseFilters, type MetricsFilterState } from '@/lib/metrics-charts';

function MetricsDashboard(): React.JSX.Element | null {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    // The filters are state seeded from the URL and mirrored back to it, so quick
    // successive clicks compose; the URL (not state) is what a shared link carries.
    const [filters, setFiltersState] = useState<MetricsFilterState>(() => parseFilters(new URLSearchParams(params.toString())));
    const query = filtersToQuery(filters);

    const [data, setData] = useState<MetricsOverview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (status === 'unauthenticated') router.replace('/');
    }, [status, router]);

    useEffect(() => {
        if (status !== 'authenticated') return;
        const controller = new AbortController();
        void (async () => {
            try {
                const res = await fetch(`/api/metrics/overview${query ? `?${query}` : ''}`, { signal: controller.signal });
                if (res.status === 401) { router.replace('/'); return; }
                if (!res.ok) throw new Error('Failed to load metrics');
                setData(await res.json() as MetricsOverview);
                setError(null);
            } catch (e) {
                if (controller.signal.aborted) return;
                setError(e instanceof Error ? e.message : 'Unknown error');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [status, query, tick, router]);

    useEffect(() => {
        if (query !== new URLSearchParams(window.location.search).toString()) {
            router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }
    }, [query, pathname, router]);

    const setFilters = useCallback((update: (prev: MetricsFilterState) => MetricsFilterState): void => {
        setFiltersState(update);
    }, []);

    if (status === 'loading' || (status === 'authenticated' && loading && !data)) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="flex items-center gap-3 text-slate-400" role="status">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Loading metrics…</span>
                </div>
            </div>
        );
    }
    if (!session) return null;

    const hasData = !!data && data.series.some((r) => r.issuesOpened + r.issuesClosed + r.prsOpened + r.prsMerged > 0);

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className="sticky top-0 z-10 border-b border-white/8 bg-slate-950/90 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors shrink-0">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Dashboard</span>
                    </Link>
                    <span className="text-slate-700 hidden sm:inline">|</span>
                    <h1 className="text-sm font-bold bg-gradient-to-r from-indigo-300 to-purple-300 bg-clip-text text-transparent truncate">Metrics</h1>
                </div>
                <button
                    type="button"
                    onClick={() => { setLoading(true); setTick((t) => t + 1); }}
                    disabled={loading}
                    aria-label="Refresh metrics"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 hover:text-slate-200 transition-all disabled:opacity-50"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </button>
            </header>

            <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
                {error && (
                    <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm" role="alert">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {error}
                    </div>
                )}
                {data && (
                    <>
                        <MetricsFilters value={filters} available={data.available} onChange={setFilters} />
                        <ScoreCard scorecard={data.scorecard} />
                        {!hasData && (
                            <p className="text-sm text-slate-400" role="status">
                                No issue or PR activity in this range yet. The daily sync fills these charts in.
                            </p>
                        )}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <BurnUpChart series={data.series} />
                            <OpenedClosedBars series={data.series} />
                            <LeadTimeChart series={data.series} />
                        </div>
                        {data.repos.length > 0 && <RepoBreakdown repos={data.repos} />}
                    </>
                )}
            </main>
        </div>
    );
}

export default function MetricsPage(): React.JSX.Element {
    return (
        <Suspense fallback={null}>
            <MetricsDashboard />
        </Suspense>
    );
}
