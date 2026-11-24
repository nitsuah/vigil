import { describe, it, expect } from 'vitest';
import { renderMetricsDigest } from './metrics-digest';
import { buildScorecard, emptyRollup } from './metrics-scorecard';

const NOW = new Date('2026-11-24T12:00:00Z');

describe('renderMetricsDigest', () => {
    const sc = buildScorecard(
        [
            { ...emptyRollup('2026-W47'), issuesClosed: 4, issuesOpened: 2, prsMerged: 6, leadTimeP50Hours: 6 },
            { ...emptyRollup('2026-W48'), issuesClosed: 23, issuesOpened: 18, prsMerged: 12, leadTimeP50Hours: 4.2, bugsClosed: 8, bugsOpened: 2, impPrsMerged: 3 },
        ],
        NOW,
    );
    const md = renderMetricsDigest(sc);

    it('states the week and the headline numbers from the scorecard', () => {
        expect(md).toContain('### Delivery metrics (2026-W48)');
        expect(md).toContain('closed 23 issues (net +5), merged 12 PRs (p50 4.2h), fixed 8 bugs against 2 opened, and imp merged 3 PRs.');
        expect(md).not.toContain('Bug inflow is above');
    });

    it('lists every scorecard metric with its average and delta', () => {
        for (const m of sc.metrics) expect(md).toContain(`| ${m.label} |`);
        expect(md).toContain('| Issues closed | 23 | 1 | +22 ✅ |');
    });

    it('flags bug inflow above the fix rate and handles singulars and no lead time', () => {
        const bad = renderMetricsDigest(buildScorecard([{ ...emptyRollup('2026-W48'), issuesClosed: 1, issuesOpened: 3, prsMerged: 1, bugsOpened: 2 }], NOW));
        expect(bad).toContain('closed 1 issue (net −2), merged 1 PR, fixed 0 bugs against 2 opened');
        expect(bad).toContain('Bug inflow is above the fix rate.');
    });
});
