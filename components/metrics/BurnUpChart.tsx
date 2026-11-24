import type { WeeklyRollup } from '@/lib/metrics-rollup';
import { burnUpPoints, niceMax } from '@/lib/metrics-charts';
import { ChartFrame, PAD, plotH, slotX, yFor } from './ChartFrame';

/** Closed work (area) against total scope (line); scope rises when issues are filed or split. */
export function BurnUpChart({ series }: { series: WeeklyRollup[] }): React.JSX.Element {
    const pts = burnUpPoints(series);
    const max = niceMax(Math.max(0, ...pts.map((p) => p.scope)));
    const n = pts.length;
    const last = pts[n - 1];
    const closedLine = pts.map((p, i) => `${slotX(i, n)},${yFor(p.closed, max)}`).join(' ');
    const area = n > 0 ? `${slotX(0, n)},${PAD.t + plotH} ${closedLine} ${slotX(n - 1, n)},${PAD.t + plotH}` : '';
    return (
        <ChartFrame
            title="Burn-up"
            summary={last ? `${last.closed} leaf issues closed of ${last.scope} in scope by ${last.week}.` : 'No data.'}
            weeks={pts.map((p) => p.week)}
            max={max}
            legend={[{ label: 'Closed', className: 'bg-emerald-500/60' }, { label: 'Scope', className: 'bg-indigo-400' }]}
        >
            {n > 0 && <polygon points={area} className="fill-emerald-500/30" />}
            {n > 0 && <polyline points={closedLine} fill="none" className="stroke-emerald-400" strokeWidth={2} />}
            {n > 0 && <polyline points={pts.map((p, i) => `${slotX(i, n)},${yFor(p.scope, max)}`).join(' ')} fill="none" className="stroke-indigo-400" strokeWidth={2} />}
            {pts.map((p, i) => (
                <circle key={p.week} cx={slotX(i, n)} cy={yFor(p.scope, max)} r={2.5} className="fill-indigo-400">
                    <title>{`${p.week}: ${p.closed} closed, ${p.scope} in scope`}</title>
                </circle>
            ))}
        </ChartFrame>
    );
}
