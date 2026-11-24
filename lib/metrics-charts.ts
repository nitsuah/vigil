/** Pure helpers behind the /metrics charts (vigil#456, slice 5); unit-tested in lib/metrics-charts.test.ts. */
import type { WeeklyRollup } from '@/lib/metrics-rollup';

export interface BurnUpPoint {
    week: string;
    /** Leaf issues closed since the first shown week. */
    closed: number;
    /** closed + open leaf issues at week end: rises when work is filed or split. */
    scope: number;
}

/** Cumulative closed work against total scope, one point per week. */
export function burnUpPoints(series: readonly WeeklyRollup[]): BurnUpPoint[] {
    let closed = 0;
    return series.map((r) => {
        closed += r.leafClosed;
        return { week: r.isoWeek, closed, scope: closed + r.scopeEnd };
    });
}

/** A round axis maximum at or above `value` (1, 2, 5 times a power of ten); at least `min`. */
export function niceMax(value: number, min = 4): number {
    const v = Math.max(value, min);
    const pow = 10 ** Math.floor(Math.log10(v));
    const n = v / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** "W48" from "2026-W48". */
export const shortWeek = (isoWeek: string): string => isoWeek.slice(isoWeek.indexOf('W'));

/** Whole numbers plain, fractions to one decimal; null as an em dash. */
export function formatMetricValue(value: number | null, unit: 'count' | 'hours'): string {
    if (value === null) return '—';
    const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return unit === 'hours' ? `${n}h` : n;
}

/** Signed delta text such as "+2.5" or "−1"; null as an em dash. */
export function formatDelta(delta: number | null, unit: 'count' | 'hours'): string {
    if (delta === null) return '—';
    if (delta === 0) return '±0';
    const body = formatMetricValue(Math.abs(delta), unit);
    return `${delta > 0 ? '+' : '−'}${body}`;
}

export interface MetricsFilterState {
    repos: string[];
    label: string | null;
    authorType: 'human' | 'imp' | 'bot' | null;
    weeks: number;
}

export const DEFAULT_WEEKS = 12;
export const WEEK_OPTIONS = [4, 8, 12, 26, 52] as const;
export const LABEL_OPTIONS = ['bug', 'security', 'imp', 'bot:journey'] as const;
export const AUTHOR_OPTIONS = ['human', 'imp', 'bot'] as const;

/** Read the filter state from URL params, ignoring anything invalid. */
export function parseFilters(params: URLSearchParams): MetricsFilterState {
    const weeks = Number(params.get('weeks'));
    const author = params.get('authorType');
    return {
        repos: (params.get('repos') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        label: params.get('label') || null,
        authorType: (AUTHOR_OPTIONS as readonly string[]).includes(author ?? '') ? (author as MetricsFilterState['authorType']) : null,
        weeks: Number.isInteger(weeks) && weeks >= 1 && weeks <= 52 ? weeks : DEFAULT_WEEKS,
    };
}

/** Query string for a filter state; defaults are omitted so shared links stay short. */
export function filtersToQuery(f: MetricsFilterState): string {
    const p = new URLSearchParams();
    if (f.repos.length > 0) p.set('repos', f.repos.join(','));
    if (f.label) p.set('label', f.label);
    if (f.authorType) p.set('authorType', f.authorType);
    if (f.weeks !== DEFAULT_WEEKS) p.set('weeks', String(f.weeks));
    return p.toString();
}
