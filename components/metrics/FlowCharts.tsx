import type { WeeklyRollup } from '@/lib/metrics-rollup';
import { niceMax } from '@/lib/metrics-charts';
import { ChartFrame, plotW, slotX, yFor } from './ChartFrame';

/** Weekly grouped bars: issues opened against issues closed as progress. */
export function OpenedClosedBars({ series }: { series: WeeklyRollup[] }): React.JSX.Element {
    const n = series.length;
    const max = niceMax(Math.max(0, ...series.map((r) => Math.max(r.issuesOpened, r.issuesClosed))));
    const barW = Math.max(2, Math.min(18, plotW / Math.max(n, 1) / 2 - 2));
    const base = yFor(0, max);
    const opened = series.reduce((a, r) => a + r.issuesOpened, 0);
    const closed = series.reduce((a, r) => a + r.issuesClosed, 0);
    return (
        <ChartFrame
            title="Opened vs closed"
            summary={`${opened} issues opened and ${closed} closed over ${n} weeks.`}
            weeks={series.map((r) => r.isoWeek)}
            max={max}
            legend={[{ label: 'Opened', className: 'bg-amber-400' }, { label: 'Closed', className: 'bg-emerald-400' }]}
        >
            {series.map((r, i) => (
                <g key={r.isoWeek}>
                    <rect x={slotX(i, n) - barW - 1} y={yFor(r.issuesOpened, max)} width={barW} height={base - yFor(r.issuesOpened, max)} className="fill-amber-400">
                        <title>{`${r.isoWeek}: ${r.issuesOpened} opened`}</title>
                    </rect>
                    <rect x={slotX(i, n) + 1} y={yFor(r.issuesClosed, max)} width={barW} height={base - yFor(r.issuesClosed, max)} className="fill-emerald-400">
                        <title>{`${r.isoWeek}: ${r.issuesClosed} closed`}</title>
                    </rect>
                </g>
            ))}
        </ChartFrame>
    );
}

/** Merge lead time p50 and p90 in hours; a week with no merges leaves a gap. */
export function LeadTimeChart({ series }: { series: WeeklyRollup[] }): React.JSX.Element {
    const n = series.length;
    const max = niceMax(Math.max(0, ...series.map((r) => r.leadTimeP90Hours ?? r.leadTimeP50Hours ?? 0)), 2);
    const runs = (pick: (r: WeeklyRollup) => number | null): string[] => {
        const out: string[] = [];
        let cur: string[] = [];
        series.forEach((r, i) => {
            const v = pick(r);
            if (v === null) { if (cur.length) out.push(cur.join(' ')); cur = []; return; }
            cur.push(`${slotX(i, n)},${yFor(v, max)}`);
        });
        if (cur.length) out.push(cur.join(' '));
        return out;
    };
    const withData = series.filter((r) => r.leadTimeP50Hours !== null).length;
    return (
        <ChartFrame
            title="Merge lead time (hours)"
            summary={withData === 0 ? 'No merged PRs in this range.' : `Lead time recorded in ${withData} of ${n} weeks.`}
            weeks={series.map((r) => r.isoWeek)}
            max={max}
            legend={[{ label: 'p50', className: 'bg-sky-400' }, { label: 'p90', className: 'bg-violet-400' }]}
        >
            {runs((r) => r.leadTimeP90Hours).map((pts) => <polyline key={`90-${pts}`} points={pts} fill="none" className="stroke-violet-400" strokeWidth={2} />)}
            {runs((r) => r.leadTimeP50Hours).map((pts) => <polyline key={`50-${pts}`} points={pts} fill="none" className="stroke-sky-400" strokeWidth={2} />)}
            {series.map((r, i) => r.leadTimeP50Hours !== null && (
                <circle key={r.isoWeek} cx={slotX(i, n)} cy={yFor(r.leadTimeP50Hours, max)} r={2.5} className="fill-sky-400">
                    <title>{`${r.isoWeek}: p50 ${r.leadTimeP50Hours}h, p90 ${r.leadTimeP90Hours ?? '—'}h`}</title>
                </circle>
            ))}
        </ChartFrame>
    );
}
