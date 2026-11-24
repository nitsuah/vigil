import type { ReactNode } from 'react';
import { shortWeek } from '@/lib/metrics-charts';

export const W = 640;
export const H = 220;
export const PAD = { l: 36, r: 12, t: 12, b: 24 };
export const plotW = W - PAD.l - PAD.r;
export const plotH = H - PAD.t - PAD.b;

/** x of the centre of slot i of n equal slots. */
export const slotX = (i: number, n: number): number => PAD.l + (plotW / Math.max(n, 1)) * (i + 0.5);
export const yFor = (v: number, max: number): number => PAD.t + plotH - (plotH * v) / max;

/** Titled card with an inline SVG plot: gridlines, y labels and thinned week labels. */
export function ChartFrame({ title, summary, weeks, max, legend, children }: {
    title: string;
    /** Spoken description of the chart for assistive tech. */
    summary: string;
    weeks: string[];
    max: number;
    legend: Array<{ label: string; className: string }>;
    children: ReactNode;
}): React.JSX.Element {
    const top = max; // callers pass an already-rounded maximum, so axis labels match the plot
    const ticks = [0, 0.5, 1].map((f) => Math.round(top * f * 10) / 10);
    const every = Math.ceil(weeks.length / 6);
    return (
        <section className="rounded-xl border border-white/8 bg-slate-900/60 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{title}</h3>
                <ul className="flex items-center gap-3 text-[11px] text-slate-400">
                    {legend.map((l) => (
                        <li key={l.label} className="flex items-center gap-1.5">
                            <span className={`inline-block h-2 w-3 rounded-sm ${l.className}`} aria-hidden="true" />
                            {l.label}
                        </li>
                    ))}
                </ul>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="w-full h-auto">
                {ticks.map((t) => (
                    <g key={t}>
                        <line x1={PAD.l} x2={W - PAD.r} y1={yFor(t, top)} y2={yFor(t, top)} className="stroke-slate-700" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 3'} />
                        <text x={PAD.l - 6} y={yFor(t, top) + 3} textAnchor="end" className="fill-slate-400" fontSize={10}>{t}</text>
                    </g>
                ))}
                {weeks.map((w, i) => (i % every === 0 || i === weeks.length - 1) && (
                    <text key={w} x={slotX(i, weeks.length)} y={H - 6} textAnchor="middle" className="fill-slate-400" fontSize={10}>{shortWeek(w)}</text>
                ))}
                {children}
            </svg>
        </section>
    );
}
