/**
 * Weekly metrics digest (vigil#456, slice 6): the scorecard as a markdown
 * section for the weekly state-of-the-union. Built from the same
 * WeeklyScorecard the /metrics page renders, so the numbers cannot differ.
 */
import { formatDelta, formatMetricValue } from '@/lib/metrics-charts';
import type { ScorecardMetric, WeeklyScorecard } from '@/lib/metrics-scorecard';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function renderMetricsDigest(sc: WeeklyScorecard): string {
    const get = (key: ScorecardMetric['key']) => sc.metrics.find((m) => m.key === key);
    const num = (key: ScorecardMetric['key']) => get(key)?.current ?? 0;
    const net = num('netBurn');
    const lead = get('leadTimeP50Hours')?.current ?? null;
    const sign = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '±0');

    const summary =
        `This week (${sc.week}) we closed ${plural(num('issuesClosed'), 'issue')} (net ${sign(net)}), ` +
        `merged ${plural(num('prsMerged'), 'PR')}` +
        `${lead === null ? '' : ` (p50 ${formatMetricValue(lead, 'hours')})`}, ` +
        `fixed ${plural(num('bugsClosed'), 'bug')} against ${num('bugsOpened')} opened, ` +
        `and imp merged ${plural(num('impPrsMerged'), 'PR')}.` +
        `${sc.bugInflowExceedsFix ? ' Bug inflow is above the fix rate.' : ''}`;

    const rows = sc.metrics.map((m) => {
        const mark = m.direction === 'good' ? ' ✅' : m.direction === 'bad' ? ' ⚠️' : '';
        return `| ${m.label} | ${formatMetricValue(m.current, m.unit)} | ${formatMetricValue(m.previousAvg, m.unit)} | ${formatDelta(m.delta, m.unit)}${mark} |`;
    });

    return [
        `### Delivery metrics (${sc.week})`,
        '',
        summary,
        '',
        '| Metric | This week | Previous 4-week avg | Change |',
        '|---|---:|---:|---:|',
        ...rows,
    ].join('\n');
}
