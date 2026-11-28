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
    const abbreviation = /(?:\b[A-Za-z]\.){2,}$|\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|No|Fig)\.$/i.test(prefix);
    // "etc." or "U.S." can also close the last sentence; a title or "vs." cannot.
    const closesText = prefix.length === trimmed.length && /(?:\b[A-Za-z]\.){2,}$|\betc\.$/i.test(prefix);
    if (!abbreviation || closesText) end = match.index + match[0].length;
  }
  return end > 0 ? trimmed.slice(0, end) : null;
}
