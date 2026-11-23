"use client";

import { useEffect, useState } from 'react';
import { RefreshCw, Route } from 'lucide-react';
import type { JourneysHealth } from '@/lib/journeys-metrics';
import { JourneysStatusBadge } from './JourneysStatusBadge';

interface JourneysSectionProps {
    repoName?: string;
    repoUrl?: string;
    /** Journeys practice state from best practices; the section hides when missing. */
    practiceStatus?: string;
    isAuthenticated?: boolean;
}

type LoadState =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'ready'; health: JourneysHealth };

function issuesHref(repoUrl: string | undefined, label: string): string | undefined {
    const base = repoUrl?.trim().replace(/\/$/, '');
    return base ? `${base}/issues?q=is%3Aissue+is%3Aopen+label%3A${encodeURIComponent(label)}` : undefined;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{label}</span>
            <span className="text-slate-200 font-medium">{children}</span>
        </div>
    );
}

function IssueCount({ count, capped, href }: { count: number; capped: boolean; href: string | undefined }) {
    const text = capped ? `${count}+` : String(count);
    return href
        ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">{text}</a>
        : <>{text}</>;
}

export function JourneysSection({ repoName, repoUrl, practiceStatus, isAuthenticated }: JourneysSectionProps) {
    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const hasNightly = practiceStatus === 'healthy';

    useEffect(() => {
        if (!hasNightly || !repoName || !isAuthenticated) return;
        const controller = new AbortController();
        void (async () => {
            try {
                const res = await fetch(`/api/repos/${encodeURIComponent(repoName)}/journeys`, { signal: controller.signal });
                if (!res.ok) throw new Error(String(res.status));
                const body = await res.json() as { health: JourneysHealth };
                setState({ kind: 'ready', health: body.health });
            } catch (err) {
                if ((err as Error).name !== 'AbortError') setState({ kind: 'error' });
            }
        })();
        return () => controller.abort();
    }, [hasNightly, repoName, isAuthenticated, attempt]);

    // Repos without journeys have nothing to show; dormant ones say what is missing.
    if (practiceStatus !== 'healthy' && practiceStatus !== 'dormant') return null;
    if (hasNightly && !isAuthenticated) return null;

    return (
        <div className="bg-slate-800/50 rounded-lg overflow-hidden border border-slate-600/40" data-tour="journeys">
            <div className="px-4 py-3 border-b border-slate-600/30 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                    <Route className="h-4 w-4 text-indigo-300" aria-hidden="true" />
                    Journeys
                </h3>
                {state.kind === 'ready' && hasNightly && <JourneysStatusBadge status={state.health.status} />}
            </div>
            <div className="px-4 py-3 space-y-1.5" aria-live="polite">
                {!hasNightly && (
                    <p className="text-xs text-slate-400">Journeys exist but no nightly workflow runs them, so there are no results to show.</p>
                )}
                {hasNightly && state.kind === 'loading' && (
                    <p className="flex items-center gap-2 text-xs text-slate-400" role="status">
                        <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" /> Loading journeys…
                    </p>
                )}
                {hasNightly && state.kind === 'error' && (
                    <div role="alert" className="text-xs text-red-300 flex items-center justify-between gap-2">
                        <span>Could not read journeys results from GitHub.</span>
                        <button
                            type="button"
                            onClick={() => { setState({ kind: 'loading' }); setAttempt((n) => n + 1); }}
                            className="px-2 py-0.5 rounded border border-red-500/40 hover:bg-red-500/10"
                        >
                            Retry
                        </button>
                    </div>
                )}
                {hasNightly && state.kind === 'ready' && (state.health.status === 'none'
                    ? <p className="text-xs text-slate-400">The nightly has not recorded a run yet.</p>
                    : (
                        <>
                            <Row label="Last run">
                                {state.health.lastRunUrl
                                    ? <a href={state.health.lastRunUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{state.health.lastRunDate ?? 'unknown date'}</a>
                                    : (state.health.lastRunDate ?? 'unknown date')}
                                {' · '}{state.health.passed}/{state.health.total} passed
                            </Row>
                            <Row label="Flaky">{state.health.flaky}</Row>
                            <Row label="@feature coverage">
                                {state.health.coverage ? `${state.health.coverage.covered}/${state.health.coverage.total}` : '—'}
                            </Row>
                        </>
                    ))}
                {hasNightly && state.kind === 'ready' && (
                    <>
                        <Row label="Open bot:journey issues"><IssueCount count={state.health.openJourneyIssues} capped={state.health.issueCountsCapped} href={issuesHref(repoUrl, 'bot:journey')} /></Row>
                        <Row label="Open bot:review issues"><IssueCount count={state.health.openReviewIssues} capped={state.health.issueCountsCapped} href={issuesHref(repoUrl, 'bot:review')} /></Row>
                    </>
                )}
            </div>
        </div>
    );
}
