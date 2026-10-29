import { describe, it, expect } from 'vitest';
import { computeLCS, MAX_LCS_CELLS } from './diff-lcs';

describe('computeLCS', () => {
  it('finds the longest common subsequence of small inputs', () => {
    const out = computeLCS(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd']);
    expect(out.map((p) => [p.oldIdx, p.newIdx])).toEqual([[0, 0], [2, 2], [3, 3]]);
  });

  it('can ignore whitespace differences', () => {
    expect(computeLCS(['  a'], ['a'], true)).toEqual([{ oldIdx: 0, newIdx: 0 }]);
    expect(computeLCS(['  a'], ['a'], false)).toEqual([]);
  });

  it('stays fast and memory-bounded on huge inputs by matching only the common ends', () => {
    const side = Math.floor(Math.sqrt(MAX_LCS_CELLS)) + 50;
    const a = ['top', ...Array.from({ length: side }, (_, i) => `a${i}`), 'bottom'];
    const b = ['top', ...Array.from({ length: side }, (_, i) => `b${i}`), 'bottom'];
    const start = Date.now();
    const out = computeLCS(a, b);
    expect(Date.now() - start).toBeLessThan(200);
    expect(out).toEqual([
      { oldIdx: 0, newIdx: 0 },
      { oldIdx: a.length - 1, newIdx: b.length - 1 },
    ]);
  });
});
