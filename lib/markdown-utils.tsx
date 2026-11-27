import React from 'react';

/**
 * Converts markdown bold syntax (**text**) to React elements
 */
export function parseBoldText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the bold part
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Add the bold part
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Renders the inline Markdown that roadmap and task items use: **bold**, `code`
 * and [text](http link). Everything else stays plain text; React escapes it, so
 * raw HTML is never interpreted.
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
  // Bounded, non-nesting classes keep this linear on hostile input.
  const token = /`([^`\n]{1,500})`|\[([^\[\]\n]{1,500})\]\((https?:\/\/[^\s]{1,1000})\)|\*\*([^*\n]{1,500})\*\*/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(token)) {
    const [whole, code, label, href, bold] = match;
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (code !== undefined) {
      parts.push(
        <code key={match.index} className="rounded bg-slate-700/60 px-1 font-mono text-[0.9em]">{code}</code>
      );
    } else if (href !== undefined) {
      // Greedy URL capture includes the Markdown closing paren; remove only
      // unmatched trailing parens. The bounded scan is linear in URL length.
      let safeHref = href;
      const opens = (safeHref.match(/\(/g) ?? []).length;
      let closes = (safeHref.match(/\)/g) ?? []).length;
      while (closes > opens && safeHref.endsWith(')')) {
        safeHref = safeHref.slice(0, -1);
        closes -= 1;
      }
      if (opens !== closes) {
        parts.push(whole);
      } else {
        parts.push(
          <a key={match.index} href={safeHref} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>
            {label}
          </a>
        );
      }
    } else {
      parts.push(<strong key={match.index}>{renderInlineMarkdown(bold)}</strong>);
    }
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : [text];
}
