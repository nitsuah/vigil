import { describe, it, expect } from 'vitest';
import { burnUpPoints, filtersToQuery, formatDelta, formatMetricValue, niceMax, parseFilters, shortWeek } from './metrics-charts';
import { emptyRollup } from './metrics-scorecard';

describe('burnUpPoints', () => {
    it('accumulates leaf closures and lifts scope when work is filed', () => {
        const pts = burnUpPoints([
            { ...emptyRollup('2026-W46'), leafClosed: 2, scopeEnd: 6 },
            { ...emptyRollup('2026-W47'), leafClosed: 1, scopeEnd: 9 }, // a parent closed and 3 children opened
        ]);
        expect(pts).toEqual([{ week: '2026-W46', closed: 2, scope: 8 }, { week: '2026-W47', closed: 3, scope: 12 }]);
    });
});

describe('niceMax', () => {
    it.each([[0, 5], [3, 5], [7, 10], [13, 20], [41, 50], [101, 200]])('%d -> %d', (v, want) => expect(niceMax(v)).toBe(want));
});

describe('formatting', () => {
    it('formats values and deltas', () => {
        expect(formatMetricValue(null, 'count')).toBe('—');
        expect(formatMetricValue(4.25, 'hours')).toBe('4.3h');
        expect(formatMetricValue(8, 'count')).toBe('8');
        expect(formatDelta(0, 'count')).toBe('±0');
        expect(formatDelta(-1.5, 'hours')).toBe('−1.5h');
        expect(formatDelta(2, 'count')).toBe('+2');
        expect(shortWeek('2026-W48')).toBe('W48');
    });
});

describe('filters in the URL', () => {
    it('round-trips and omits defaults', () => {
        const f = parseFilters(new URLSearchParams('repos=a/b,c/d&label=bug&authorType=imp&weeks=26'));
        expect(f).toEqual({ repos: ['a/b', 'c/d'], label: 'bug', authorType: 'imp', weeks: 26 });
        expect(new URLSearchParams(filtersToQuery(f)).get('repos')).toBe('a/b,c/d');
        expect(filtersToQuery(parseFilters(new URLSearchParams('')))).toBe('');
    });
    it('ignores invalid values', () => {
        expect(parseFilters(new URLSearchParams('authorType=robot&weeks=999'))).toMatchObject({ authorType: null, weeks: 12 });
    });
});
