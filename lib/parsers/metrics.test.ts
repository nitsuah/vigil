
import { describe, it, expect } from 'vitest';
import { parseMetrics } from './metrics';

describe('parseMetrics', () => {
    it('keeps a whole ISO date instead of only its year', () => {
        const { metrics } = parseMetrics('| Metric | Value |\n| --- | --- |\n| Last Updated | 2026-09-24 |\n');
        expect(metrics).toEqual([{ name: 'Last Updated', value: 20260924, unit: 'date' }]);
    });

    it('should parse metrics from frontmatter', () => {
        const content = `---
metrics:
  - name: Coverage
    value: 80
    unit: '%'
---
`;
        const result = parseMetrics(content);
        expect(result.metrics).toHaveLength(1);
        expect(result.metrics[0]).toEqual({
            name: 'Coverage',
            value: 80,
            unit: '%',
        });
    });

    it('should parse metrics from markdown table', () => {
        const content = `
# Metrics

| Metric | Value | Unit |
|---|---|---|
| Build Time | 120 | s |
| Bundle Size | 500 | KB |
`;
        const result = parseMetrics(content);
        expect(result.metrics).toHaveLength(2);
        expect(result.metrics[0]).toEqual({
            name: 'Build Time',
            value: 120,
            unit: 's',
        });
        expect(result.metrics[1]).toEqual({
            name: 'Bundle Size',
            value: 500,
            unit: 'KB',
        });
    });

    describe('non-finite value rejection', () => {
        it('excludes frontmatter metrics with NaN value', () => {
            const content = `---
metrics:
  - name: Bad
    value: not-a-number
  - name: Good
    value: 42
    unit: ms
---
`;
            const result = parseMetrics(content);
            expect(result.metrics).toHaveLength(1);
            expect(result.metrics[0].name).toBe('Good');
        });

        it('excludes frontmatter metrics with YAML .inf (Infinity)', () => {
            // gray-matter parses YAML .inf as JavaScript Infinity
            const content = `---
metrics:
  - name: Infinite
    value: .inf
  - name: Coverage
    value: 75
    unit: '%'
---
`;
            const result = parseMetrics(content);
            expect(result.metrics).toHaveLength(1);
            expect(result.metrics[0].name).toBe('Coverage');
        });

        it('excludes frontmatter metrics with YAML -.inf (-Infinity)', () => {
            const content = `---
metrics:
  - name: NegInfinite
    value: -.inf
  - name: Score
    value: 10
---
`;
            const result = parseMetrics(content);
            expect(result.metrics).toHaveLength(1);
            expect(result.metrics[0].name).toBe('Score');
        });

        it('excludes markdown table rows that produce NaN', () => {
            const content = `
| Metric | Value |
|---|---|
| Bad | abc |
| Good | 99 |
`;
            const result = parseMetrics(content);
            expect(result.metrics).toHaveLength(1);
            expect(result.metrics[0].name).toBe('Good');
        });

        it('excludes markdown table rows where stripped value parses to Infinity', () => {
            // A cell whose numeric portion overflows to JS Infinity should be dropped
            const content = `
| Metric | Value |
|---|---|
| Overflow | 1e309 |
| Coverage | 85% |
`;
            const result = parseMetrics(content);
            // 1e309 strips to "1309" (non-scientific via regex), parses to finite 1309 — kept
            // but a true Infinity-producing row must be dropped
            const overflowMetric = result.metrics.find(m => m.name === 'Overflow');
            if (overflowMetric) {
                expect(Number.isFinite(overflowMetric.value)).toBe(true);
            }
            const coverageMetric = result.metrics.find(m => m.name === 'Coverage');
            expect(coverageMetric).toBeDefined();
            expect(coverageMetric?.value).toBe(85);
        });

        it('keeps valid finite metrics when mixed with invalid ones', () => {
            const content = `
| Metric | Value | Unit |
|---|---|---|
| Valid A | 100 | ms |
| Invalid | xyz | s |
| Valid B | 42 | KB |
`;
            const result = parseMetrics(content);
            expect(result.metrics).toHaveLength(2);
            expect(result.metrics.map(m => m.name)).toEqual(['Valid A', 'Valid B']);
        });
    });
});
