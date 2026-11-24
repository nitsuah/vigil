import type { WeeklyScorecard } from '@/lib/metrics-scorecard';
import { formatDelta, formatMetricValue } from '@/lib/metrics-charts';

const TONE = { good: 'text-emerald-400', bad: 'text-red-400', neutral: 'text-slate-400' } as const;
const WORD = { good: 'better', bad: 'worse', neutral: 'no clear change' } as const;

/** This week against the mean of the previous four, with good/bad deltas. */
export function ScoreCard({ scorecard }: { scorecard: WeeklyScorecard }): React.JSX.Element {
    return (
        <section aria-label="Weekly scorecard" className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Scorecard · {scorecard.week} vs previous 4-week average
                </h2>
                {scorecard.bugInflowExceedsFix && (
                    <span className="text-xs font-medium text-red-400" role="status">Bug inflow is above the fix rate this week</span>
                )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {scorecard.metrics.map((m) => (
                    <div key={m.key} data-metric={m.key} className="rounded-xl border border-white/8 bg-slate-900/60 p-3 sm:p-4">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{m.label}</div>
                        <div className="mt-1 text-2xl sm:text-3xl font-black tabular-nums text-slate-100">{formatMetricValue(m.current, m.unit)}</div>
                        <div className="mt-1 flex items-baseline gap-2 text-xs">
                            <span className={`font-semibold tabular-nums ${TONE[m.direction]}`}>
                                {formatDelta(m.delta, m.unit)}
                                <span className="sr-only"> ({WORD[m.direction]})</span>
                            </span>
                            <span className="text-slate-500">avg {formatMetricValue(m.previousAvg, m.unit)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
