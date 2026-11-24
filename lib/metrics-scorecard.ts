/**
 * Delivery-metrics scorecard (vigil#456, slice 4): pure helpers that turn
 * weekly rollups into the portfolio series and the "this week vs the average of
 * the previous 4 weeks" scorecard. No I/O; unit-tested in
 * lib/metrics-scorecard.test.ts.
 */
import { isoWeekOf, type WeeklyRollup } from '@/lib/metrics-rollup';

const WEEK_MS = 7 * 86_400_000;

export type MetricKey =
    | 'issuesOpened'
    | 'issuesClosed'
    | 'netBurn'
    | 'prsMerged'
    | 'leadTimeP50Hours'
    | 'bugsOpened'
    | 'bugsClosed'
    | 'impPrsMerged';

export type Direction = 'good' | 'bad' | 'neutral';

export interface ScorecardMetric {
    key: MetricKey;
    label: string;
    unit: 'count' | 'hours';
    current: number | null;
    /** Mean of the previous 4 weeks; null when there is no data for the metric. */
    previousAvg: number | null;
    /** current - previousAvg, null when either side is null. */
    delta: number | null;
    /** Whether the delta is an improvement. Neutral when it is flat or the metric has no good direction. */
    direction: Direction;
}

export interface WeeklyScorecard {
    week: string;
    metrics: ScorecardMetric[];
    /** True when this week's bugs opened exceed the bugs closed (shown red). */
    bugInflowExceedsFix: boolean;
}

/** Zero row for a week with no activity. */
export function emptyRollup(isoWeek: string, scopeEnd = 0): WeeklyRollup {
    return {
        isoWeek, issuesOpened: 0, issuesClosed: 0, leafClosed: 0, scopeEnd, prsOpened: 0, prsMerged: 0,
        bugsOpened: 0, bugsClosed: 0, impPrsOpened: 0, impPrsMerged: 0, leadTimeP50Hours: null, leadTimeP90Hours: null,
    };
}

/** The last `count` ISO weeks ending with the week of `now`, oldest first. */
export function recentWeeks(now: Date, count: number): string[] {
    const weeks: string[] = [];
    for (let i = count - 1; i >= 0; i--) weeks.push(isoWeekOf(new Date(now.getTime() - i * WEEK_MS)));
    return weeks;
}

/**
 * Sum several repos' rows into one row per week, zero-filling `weeks` with no
 * activity. Lead times are weighted by merged PRs (an approximation: exact
 * portfolio percentiles would need the PR rows). `scopeEnd` is carried forward
 * through weeks without a row, because an unchanged repo has the same open
 * scope; `scopeSeed` is each repo's last known scope before the first week.
 */
export function sumWeekly(
    rows: readonly WeeklyRollup[][],
    weeks: readonly string[],
    scopeSeed: readonly number[] = [],
): WeeklyRollup[] {
    const lastScope = rows.map((_, i) => scopeSeed[i] ?? 0);
    return weeks.map((week) => {
        const total = emptyRollup(week);
        let p50 = 0, p90 = 0, weight = 0;
        rows.forEach((repoRows, i) => {
            const r = repoRows.find((x) => x.isoWeek === week);
            if (r) lastScope[i] = r.scopeEnd;
            total.scopeEnd += lastScope[i];
            if (!r) return;
            total.issuesOpened += r.issuesOpened;
            total.issuesClosed += r.issuesClosed;
            total.leafClosed += r.leafClosed;
            total.prsOpened += r.prsOpened;
            total.prsMerged += r.prsMerged;
            total.bugsOpened += r.bugsOpened;
            total.bugsClosed += r.bugsClosed;
            total.impPrsOpened += r.impPrsOpened;
            total.impPrsMerged += r.impPrsMerged;
            if (r.leadTimeP50Hours !== null && r.prsMerged > 0) {
                p50 += r.leadTimeP50Hours * r.prsMerged;
                p90 += (r.leadTimeP90Hours ?? r.leadTimeP50Hours) * r.prsMerged;
                weight += r.prsMerged;
            }
        });
        if (weight > 0) {
            total.leadTimeP50Hours = Math.round((p50 / weight) * 100) / 100;
            total.leadTimeP90Hours = Math.round((p90 / weight) * 100) / 100;
        }
        return total;
    });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const SPECS: Array<{
    key: MetricKey;
    label: string;
    unit: 'count' | 'hours';
    /** 'up' means a higher value is better, 'down' lower, null has no good direction. */
    better: 'up' | 'down' | null;
    value: (r: WeeklyRollup) => number | null;
}> = [
    { key: 'issuesOpened', label: 'Issues opened', unit: 'count', better: null, value: (r) => r.issuesOpened },
    { key: 'issuesClosed', label: 'Issues closed', unit: 'count', better: 'up', value: (r) => r.issuesClosed },
    { key: 'netBurn', label: 'Net burn (closed - opened)', unit: 'count', better: 'up', value: (r) => r.issuesClosed - r.issuesOpened },
    { key: 'prsMerged', label: 'PRs merged', unit: 'count', better: 'up', value: (r) => r.prsMerged },
    { key: 'leadTimeP50Hours', label: 'Merge lead time p50', unit: 'hours', better: 'down', value: (r) => r.leadTimeP50Hours },
    { key: 'bugsOpened', label: 'Bugs opened', unit: 'count', better: 'down', value: (r) => r.bugsOpened },
    { key: 'bugsClosed', label: 'Bugs fixed', unit: 'count', better: 'up', value: (r) => r.bugsClosed },
    { key: 'impPrsMerged', label: 'imp PRs merged', unit: 'count', better: 'up', value: (r) => r.impPrsMerged },
];

/**
 * This week against the mean of the previous 4 weeks. `weekly` is the portfolio
 * series (see sumWeekly); a week missing from it counts as no activity. A
 * metric with no value in any compared week (lead time with no merges) is null
 * rather than zero.
 */
export function buildScorecard(weekly: readonly WeeklyRollup[], now: Date): WeeklyScorecard {
    const [week, ...prior] = recentWeeks(now, 5).reverse();
    const byWeek = new Map(weekly.map((r) => [r.isoWeek, r]));
    const get = (w: string) => byWeek.get(w) ?? emptyRollup(w);
    const current = get(week);
    const previous = prior.map(get);

    const metrics = SPECS.map((spec): ScorecardMetric => {
        const cur = spec.value(current);
        const prevValues = previous.map(spec.value).filter((v): v is number => v !== null);
        const previousAvg = prevValues.length > 0 ? round2(prevValues.reduce((a, b) => a + b, 0) / prevValues.length) : null;
        const delta = cur !== null && previousAvg !== null ? round2(cur - previousAvg) : null;
        let direction: Direction = 'neutral';
        if (delta !== null && delta !== 0 && spec.better) direction = (delta > 0) === (spec.better === 'up') ? 'good' : 'bad';
        // Net burn is judged on its sign, not only its movement: closing more than was opened is good.
        if (spec.key === 'netBurn' && cur !== null && cur !== 0) direction = cur > 0 ? 'good' : 'bad';
        return { key: spec.key, label: spec.label, unit: spec.unit, current: cur === null ? null : round2(cur), previousAvg, delta, direction };
    });

    return { week, metrics, bugInflowExceedsFix: current.bugsOpened > current.bugsClosed };
}
