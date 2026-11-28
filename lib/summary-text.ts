/**
 * A generation can stop mid-sentence (token limit). Keep only whole sentences;
 * null means there is no finished sentence to save.
 */
export function finishedSummary(text: string): string | null {
  const trimmed = text.trim();
  // A sentence end is punctuation (plus closing quotes or brackets) before a
  // space or the end, so "v1.2" or "package.json" don't count.
  let end = 0;
  for (const match of trimmed.matchAll(/[.!?]["')\]*_`]{0,4}(?=\s|$)/g)) {
    const prefix = trimmed.slice(0, match.index + match[0].length);
    // Judge the word itself, without any closing quote or bracket after it.
    const bare = prefix.replace(/["')\]*_`]+$/, '');
    const abbreviation = /(?:\b[A-Za-z]\.){2,}$|\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|No|Fig)\.$/i.test(bare);
    // "etc." or "U.S." can also close a sentence; a title, "vs.", "e.g." or "i.e." cannot.
    // It does so at the end of the text, or when a usual sentence opener follows.
    const canClose = /(?:\b[A-Za-z]\.){2,}$|\betc\.$/i.test(bare)
      && !/\b(?:e\.g|i\.e)\.$/i.test(bare);
    const rest = trimmed.slice(prefix.length);
    const closes = canClose && (rest === '' || /^\s+(?:It|Its|This|These|The|They)\b/.test(rest));
    if (!abbreviation || closes) end = match.index + match[0].length;
  }
  return end > 0 ? trimmed.slice(0, end) : null;
}
