/** Upper bound on the LCS matrix size (about 4 million cells, roughly 2000 x 2000 lines). */
export const MAX_LCS_CELLS = 4_000_000;

/** Cheap fallback for very large inputs: match only the identical leading and trailing lines. */
function commonEnds(a: string[], b: string[], ignoreWhitespace: boolean): Array<{ oldIdx: number; newIdx: number }> {
  const same = (x: string, y: string) => (ignoreWhitespace ? x.trim() === y.trim() : x === y);
  const out: Array<{ oldIdx: number; newIdx: number }> = [];
  let head = 0;
  while (head < a.length && head < b.length && same(a[head], b[head])) {
    out.push({ oldIdx: head, newIdx: head });
    head++;
  }
  let ai = a.length - 1;
  let bi = b.length - 1;
  const tail: Array<{ oldIdx: number; newIdx: number }> = [];
  while (ai >= head && bi >= head && same(a[ai], b[bi])) {
    tail.unshift({ oldIdx: ai, newIdx: bi });
    ai--;
    bi--;
  }
  return [...out, ...tail];
}

/**
 * Computes the Longest Common Subsequence (LCS) between two arrays of strings.
 * Optionally ignores whitespace differences by trimming lines before comparison.
 * Note: When ignoreWhitespace is true, whitespace-only changes will be treated as unchanged.
 * @param a - The first array of lines.
 * @param b - The second array of lines.
 * @param ignoreWhitespace - If true, trims lines before comparison. Default: false.
 */
export function computeLCS(
  a: string[],
  b: string[],
  ignoreWhitespace: boolean = false
): Array<{ oldIdx: number; newIdx: number }> {
  const m = a.length;
  const n = b.length;

  // The DP matrix has (m+1)*(n+1) cells. Past the budget, fall back to matching only the common head and tail,
  // so a repository-controlled document with many lines cannot freeze or exhaust the rendering thread.
  if (m * n > MAX_LCS_CELLS) return commonEnds(a, b, ignoreWhitespace);
  
  // Normalize lines for comparison if requested
  const aNorm = ignoreWhitespace ? a.map(line => line.trim()) : a;
  const bNorm = ignoreWhitespace ? b.map(line => line.trim()) : b;
  
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  // Build LCS length matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aNorm[i - 1] === bNorm[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find LCS
  const lcs: Array<{ oldIdx: number; newIdx: number }> = [];
  let i = m, j = n;
  
  while (i > 0 && j > 0) {
    if (aNorm[i - 1] === bNorm[j - 1]) {
      lcs.unshift({ oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}
