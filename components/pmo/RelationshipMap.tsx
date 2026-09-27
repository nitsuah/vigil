"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Network, Plus, RefreshCw, X } from 'lucide-react';
import type { PmoRepoSummary } from '@/app/api/pmo/overview/route';
import type { Relationship, RelationshipKind } from '@/lib/relationships';

const KIND_COLOR: Record<RelationshipKind, string> = {
    depends_on:  '#60a5fa', // blue-400
    calls:       '#34d399', // emerald-400
    deploys:     '#f472b6', // pink-400
    embeds:      '#fbbf24', // amber-400
    shares_data: '#a78bfa', // violet-400
    tracks:      '#94a3b8', // slate-400
};

const SIZE = 360;
const RADIUS = 140;
const NODE_R = 18;

const short = (fullName: string) => fullName.split('/')[1] ?? fullName;
const isUrl = (s: string) => /^https?:\/\//.test(s);

/** Circle layout over the repos that have at least one edge; direction shown by arrowheads. */
function Graph({ edges, tracked, focus, onFocus }: {
    edges: Relationship[];
    tracked: Set<string>;
    focus: string | null;
    onFocus: (name: string | null) => void;
}): React.JSX.Element {
    const names = useMemo(() => [...new Set(edges.flatMap((e) => [e.source, e.target]))].sort(), [edges]);
    const pos = useMemo(() => new Map(names.map((n, i) => {
        const a = (2 * Math.PI * i) / names.length - Math.PI / 2;
        return [n, { x: SIZE / 2 + RADIUS * Math.cos(a), y: SIZE / 2 + RADIUS * Math.sin(a) }];
    })), [names]);

    return (
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[360px] mx-auto" role="img" aria-label="Cross-repo relationship graph">
            <defs>
                {Object.entries(KIND_COLOR).map(([k, c]) => (
                    <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M0,0 L10,5 L0,10 z" fill={c} />
                    </marker>
                ))}
            </defs>
            {edges.map((e) => {
                const a = pos.get(e.source)!;
                const b = pos.get(e.target)!;
                const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
                const dim = focus && e.source !== focus && e.target !== focus;
                return (
                    <line
                        key={e.id}
                        x1={a.x + ux * NODE_R} y1={a.y + uy * NODE_R}
                        x2={b.x - ux * (NODE_R + 2)} y2={b.y - uy * (NODE_R + 2)}
                        stroke={KIND_COLOR[e.kind]}
                        strokeWidth={1.75}
                        strokeDasharray={e.status === 'proposed' ? '4 3' : undefined}
                        opacity={dim ? 0.12 : e.status === 'proposed' ? 0.6 : 0.95}
                        markerEnd={`url(#arrow-${e.kind})`}
                    >
                        <title>{`${short(e.source)} ${e.kind} ${short(e.target)}: ${e.context}`}</title>
                    </line>
                );
            })}
            {names.map((n) => {
                const p = pos.get(n)!;
                const on = focus === n;
                return (
                    <g key={n} onClick={() => onFocus(on ? null : n)} className="cursor-pointer">
                        <circle
                            cx={p.x} cy={p.y} r={NODE_R}
                            className={on ? 'fill-indigo-500/30 stroke-indigo-300' : 'fill-slate-900 stroke-slate-500'}
                            strokeWidth={1.5}
                            strokeDasharray={tracked.has(n) ? undefined : '3 2'}
                        />
                        <text x={p.x} y={p.y + NODE_R + 11} textAnchor="middle" className="fill-slate-300 text-[10px]">
                            {short(n)}
                        </text>
                        <title>{tracked.has(n) ? n : `${n} (not tracked)`}</title>
                    </g>
                );
            })}
        </svg>
    );
}

function AddForm({ repos, kinds, onSaved, onCancel }: {
    repos: PmoRepoSummary[];
    kinds: Record<RelationshipKind, string>;
    onSaved: () => void;
    onCancel: () => void;
}): React.JSX.Element {
    const [source, setSource] = useState(repos[0]?.full_name ?? '');
    const [target, setTarget] = useState('');
    const [kind, setKind] = useState<RelationshipKind>('depends_on');
    const [context, setContext] = useState('');
    const [evidence, setEvidence] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setErr(null);
        try {
            const res = await fetch('/api/relationships', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source, target, kind, context, evidence }),
            });
            const body = await res.json().catch(() => ({})) as { error?: string };
            if (!res.ok) throw new Error(body.error ?? 'Failed to save');
            onSaved();
        } catch (e2) {
            setErr(e2 instanceof Error ? e2.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const field = 'bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 min-w-0';
    return (
        <form onSubmit={(e) => void submit(e)} className="rounded-lg border border-indigo-500/30 bg-slate-900/80 p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source repo" className={field}>
                    {repos.map((r) => <option key={r.id} value={r.full_name}>{r.name}</option>)}
                </select>
                <select value={kind} onChange={(e) => setKind(e.target.value as RelationshipKind)} aria-label="Relationship kind" className={field}>
                    {Object.keys(kinds).map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
                </select>
                <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    list="relationship-targets"
                    placeholder="target (name or owner/repo)"
                    aria-label="Target repo"
                    className={`${field} flex-1`}
                    required
                />
                <datalist id="relationship-targets">
                    {repos.map((r) => <option key={r.id} value={r.full_name} />)}
                </datalist>
            </div>
            <p className="text-[10px] text-slate-500">{kinds[kind]}</p>
            <input
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Context: what the usage is (e.g. posts chat turns to its /api/chat endpoint)"
                aria-label="Context"
                className={`${field} w-full`}
                required
            />
            <input
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Evidence (optional): file path, URL or PR"
                aria-label="Evidence"
                className={`${field} w-full`}
            />
            <div className="flex items-center gap-2">
                {err && <span className="text-[11px] text-red-400">{err}</span>}
                <button type="button" onClick={onCancel} className="ml-auto text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                <button
                    type="submit"
                    disabled={saving}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-indigo-600/30 border border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/40 disabled:opacity-50"
                >
                    {saving ? 'Saving…' : 'Add relationship'}
                </button>
            </div>
        </form>
    );
}

function EdgeRow({ edge, onChanged }: { edge: Relationship; onChanged: () => void }): React.JSX.Element {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const act = async (method: 'PATCH' | 'DELETE') => {
        if (method === 'DELETE' && edge.status === 'confirmed' &&
            !window.confirm(`Remove "${short(edge.source)} ${edge.kind} ${short(edge.target)}"?`)) return;
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(`/api/relationships/${edge.id}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'PATCH' ? JSON.stringify({ confirm: true }) : undefined,
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? `${method === 'PATCH' ? 'Confirm' : 'Remove'} failed (${res.status})`);
            }
            onChanged();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <li className="px-3 py-1.5 text-xs flex items-start gap-2">
            <span className="mt-1 shrink-0 h-2 w-2 rounded-full" style={{ background: KIND_COLOR[edge.kind] }} />
            <div className="min-w-0 flex-1">
                <p className="text-slate-200">
                    <span className="font-semibold">{short(edge.source)}</span>
                    <span className="text-slate-500"> {edge.kind.replace('_', ' ')} </span>
                    <span className="font-semibold">{short(edge.target)}</span>
                    {edge.status === 'proposed' && (
                        <span className="ml-1.5 text-[10px] text-amber-400/90">proposed by {edge.origin}</span>
                    )}
                </p>
                <p className="text-slate-400 break-words">{edge.context}</p>
                {edge.evidence && (
                    <p className="text-[10px] text-slate-500 truncate" title={edge.evidence}>
                        {isUrl(edge.evidence)
                            ? <a href={edge.evidence} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 underline">{edge.evidence}</a>
                            : edge.evidence}
                    </p>
                )}
                {err && <p role="alert" className="text-[10px] text-red-400">{err}</p>}
            </div>
            <span className="shrink-0 flex items-center gap-1">
                {edge.status === 'proposed' && (
                    <button type="button" disabled={busy} onClick={() => void act('PATCH')} aria-label="Confirm relationship"
                        className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40">
                        <Check className="h-3.5 w-3.5" />
                    </button>
                )}
                <button type="button" disabled={busy} onClick={() => void act('DELETE')}
                    aria-label={edge.status === 'proposed' ? 'Reject relationship' : 'Remove relationship'}
                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                    <X className="h-3.5 w-3.5" />
                </button>
            </span>
        </li>
    );
}

/**
 * Cross-repo relationship map: durable, directed edges with context, added by
 * people here, proposed by agents over MCP (`propose_relationship`) or bulk
 * imported via POST /api/relationships. Proposed edges are dashed until confirmed.
 */
export function RelationshipMap({ repos }: { repos: PmoRepoSummary[] }): React.JSX.Element {
    const [edges, setEdges] = useState<Relationship[] | null>(null);
    const [kinds, setKinds] = useState<Record<RelationshipKind, string> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [focus, setFocus] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch('/api/relationships');
            if (!res.ok) throw new Error('Failed to load relationships');
            const data = await res.json() as { relationships: Relationship[]; kinds: Record<RelationshipKind, string> };
            setEdges(data.relationships);
            setKinds(data.kinds);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load relationships');
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const tracked = useMemo(() => new Set(repos.map((r) => r.full_name.toLowerCase())), [repos]);
    const all = edges ?? [];
    const visible = focus ? all.filter((e) => e.source === focus || e.target === focus) : all;
    const proposed = visible.filter((e) => e.status === 'proposed');
    const confirmed = visible.filter((e) => e.status === 'confirmed');

    return (
        <section className="space-y-3" aria-labelledby="relationships-heading">
            <div className="flex items-center gap-2 flex-wrap">
                <h2 id="relationships-heading" className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Network className="h-3.5 w-3.5" /> Relationships
                </h2>
                {edges && (
                    <span className="text-xs text-slate-500">
                        {all.filter((e) => e.status === 'confirmed').length} confirmed · {all.filter((e) => e.status === 'proposed').length} proposed
                    </span>
                )}
                {focus && (
                    <button type="button" onClick={() => setFocus(null)} className="text-[11px] text-indigo-300 hover:text-indigo-200">
                        {short(focus)} ✕
                    </button>
                )}
                {kinds && !adding && (
                    <button type="button" onClick={() => setAdding(true)}
                        className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded border border-white/10 text-[11px] text-slate-300 hover:border-white/25">
                        <Plus className="h-3 w-3" /> Add
                    </button>
                )}
            </div>

            {adding && kinds && (
                <AddForm repos={repos} kinds={kinds} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/30 text-red-400 text-xs">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
                    <button type="button" onClick={() => void load()} className="ml-auto underline">Retry</button>
                </div>
            )}
            {!edges && !error && (
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading relationships…
                </div>
            )}

            {edges && all.length === 0 && (
                <p className="text-xs text-slate-500 rounded-lg border border-dashed border-white/10 p-3">
                    No relationships yet. Add one to record how one repo actually uses another. Agents can propose
                    edges with evidence through the <code className="text-slate-400">propose_relationship</code> MCP tool,
                    and they show up here for you to confirm.
                </p>
            )}

            {all.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_1fr] gap-3 items-start">
                    <div className="rounded-xl border border-white/8 bg-slate-900/60 p-2">
                        <Graph edges={all} tracked={tracked} focus={focus} onFocus={setFocus} />
                        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-1 text-[10px] text-slate-400">
                            {Object.entries(KIND_COLOR).map(([k, c]) => (
                                <span key={k} className="flex items-center gap-1">
                                    <span className="h-1.5 w-3 rounded-full" style={{ background: c }} /> {k.replace('_', ' ')}
                                </span>
                            ))}
                            <span className="text-slate-500">dashed = proposed / untracked</span>
                        </div>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-slate-900/60 divide-y divide-white/5">
                        {proposed.length > 0 && (
                            <div>
                                <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">Needs review</p>
                                <ul>{proposed.map((e) => <EdgeRow key={e.id} edge={e} onChanged={() => void load()} />)}</ul>
                            </div>
                        )}
                        {confirmed.length > 0 && (
                            <ul>{confirmed.map((e) => <EdgeRow key={e.id} edge={e} onChanged={() => void load()} />)}</ul>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
