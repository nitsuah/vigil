"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Route } from 'lucide-react';
import type { PmoJourneysRow } from '@/app/api/pmo/journeys/route';
import { JourneysStatusBadge } from '@/components/repo-details/JourneysStatusBadge';

type LoadState =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'ready'; repos: PmoJourneysRow[]; skipped: number };

/** Red first, then stale and unreadable, then the rest. */
function rank(row: PmoJourneysRow): number {
    const s = row.health?.status;
    return s === 'red' ? 0 : !s ? 1 : s === 'stale' ? 2 : s === 'none' ? 3 : 4;
}

export function JourneysRollup({ refreshKey }: { refreshKey?: number }) {
    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const requestSeq = useRef(0);

    const load = useCallback(async (signal?: AbortSignal) => {
        // Only the latest request may write state (retry vs. refresh races).
        const id = ++requestSeq.current;
        try {
            const res = await fetch('/api/pmo/journeys', { signal });
            if (!res.ok) throw new Error(String(res.status));
            const body = await res.json() as { repos: PmoJourneysRow[]; skipped?: number };
            if (id === requestSeq.current) setState({ kind: 'ready', repos: body.repos, skipped: body.skipped ?? 0 });
        } catch (err) {
            if ((err as Error).name !== 'AbortError' && id === requestSeq.current) setState({ kind: 'error' });
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void (async () => { await load(controller.signal); })();
        return () => controller.abort();
    }, [load, refreshKey]);

    const repos = state.kind === 'ready' ? [...state.repos].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)) : [];
    const red = repos.filter((r) => r.health?.status === 'red');
    const allGreen = repos.every((r) => r.health?.status === 'green');
    const skipped = state.kind === 'ready' ? state.skipped : 0;

    if (state.kind === 'ready' && repos.length === 0) return null;

    return (
        <section className="space-y-3" aria-labelledby="journeys-rollup-heading">
            <div className="flex items-center justify-between gap-2">
                <h2 id="journeys-rollup-heading" className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <Route className="h-3.5 w-3.5" aria-hidden="true" /> Nightly Journeys
                </h2>
                {state.kind === 'ready' && (
                    <span className={`flex items-center gap-1 text-xs ${red.length ? 'text-red-300' : allGreen ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {red.length
                            ? <><AlertTriangle className="h-3 w-3" aria-hidden="true" />{red.length} red</>
                            : allGreen
                                ? <><CheckCircle2 className="h-3 w-3" aria-hidden="true" />All green</>
                                : <><AlertTriangle className="h-3 w-3" aria-hidden="true" />None red, some need a look</>}
                    </span>
                )}
            </div>
            {state.kind === 'loading' && (
                <p role="status" className="flex items-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> Loading journeys…
                </p>
            )}
            {state.kind === 'error' && (
                <div role="alert" className="flex items-center justify-between gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                    <span>Could not load the journeys rollup.</span>
                    <button type="button" onClick={() => { setState({ kind: 'loading' }); void load(); }} className="px-2 py-0.5 rounded border border-red-500/40 hover:bg-red-500/10">Retry</button>
                </div>
            )}
            {state.kind === 'ready' && (
                <ul className="rounded-xl border border-white/8 bg-slate-900/60 divide-y divide-white/5">
                    {repos.map((r) => (
                        <li key={r.full_name} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                            <span className="font-medium text-slate-200 truncate">{r.name}</span>
                            <span className="flex items-center gap-3 shrink-0 text-slate-400">
                                {r.health ? (
                                    <>
                                        {r.health.status !== 'none' && <span className="tabular-nums">{r.health.passed}/{r.health.total}</span>}
                                        <span className="tabular-nums">{r.health.openJourneyIssues}{r.health.issueCountsCapped ? '+' : ''} journey · {r.health.openReviewIssues}{r.health.issueCountsCapped ? '+' : ''} review</span>
                                        <JourneysStatusBadge status={r.health.status} />
                                    </>
                                ) : (
                                    <span className="text-amber-300 flex items-center gap-1"><AlertTriangle className="h-3 w-3" aria-hidden="true" />Unreadable</span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {skipped > 0 && (
                <p className="text-xs text-amber-300">
                    {skipped} more repo{skipped !== 1 ? 's' : ''} with nightlies not checked (per-request GitHub read limit); the rollup is incomplete.
                </p>
            )}
        </section>
    );
}
