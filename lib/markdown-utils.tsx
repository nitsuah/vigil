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
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const candidates = [
      { kind: 'code' as const, index: text.indexOf('`', cursor) },
      { kind: 'bold' as const, index: text.indexOf('**', cursor) },
      { kind: 'link' as const, index: text.indexOf('[', cursor) },
    ].filter((candidate) => candidate.index >= 0);
    if (candidates.length === 0) {
      parts.push(text.slice(cursor));
      break;
    }
    candidates.sort((a, b) => a.index - b.index);
    const candidate = candidates[0];
    if (candidate.index > cursor) parts.push(text.slice(cursor, candidate.index));

    if (candidate.kind === 'code') {
      const end = text.indexOf('`', candidate.index + 1);
      const code = end > candidate.index ? text.slice(candidate.index + 1, end) : '';
      if (code && code.length <= 500 && !code.includes('\n')) {
        parts.push(<code key={candidate.index} className="rounded bg-slate-700/60 px-1 font-mono text-[0.9em]">{code}</code>);
        cursor = end + 1;
      } else {
        parts.push('`');
        cursor = candidate.index + 1;
      }
      continue;
    }

    if (candidate.kind === 'bold') {
      const end = text.indexOf('**', candidate.index + 2);
      const bold = end > candidate.index ? text.slice(candidate.index + 2, end) : '';
      if (bold && bold.length <= 500 && !bold.includes('*') && !bold.includes('\n')) {
        parts.push(<strong key={candidate.index}>{renderInlineMarkdown(bold)}</strong>);
        cursor = end + 2;
      } else {
        parts.push('*');
        cursor = candidate.index + 1;
      }
      continue;
    }

    const labelEnd = text.indexOf(']', candidate.index + 1);
    const label = labelEnd > candidate.index ? text.slice(candidate.index + 1, labelEnd) : '';
    const validLabel = label && label.length <= 500 && labelEnd - candidate.index <= 501;
    const openParen = validLabel && text[labelEnd + 1] === '(';
    const urlStart = labelEnd + 2;
    const isHttp = openParen && (text.startsWith('https://', urlStart) || text.startsWith('http://', urlStart));
    if (!validLabel || !isHttp) {
      parts.push('[');
      cursor = candidate.index + 1;
      continue;
    }

    // Scan the URL once and track balanced parentheses. A ')' at depth zero
    // closes the Markdown link; malformed URLs remain plain text.
    let depth = 0;
    let end = urlStart;
    let closed = false;
    while (end < text.length && end - urlStart < 1000) {
      const char = text[end];
      if (/\s/.test(char)) break;
      if (char === '(') depth += 1;
      else if (char === ')') {
        if (depth === 0) { closed = true; break; }
        depth -= 1;
      }
      end += 1;
    }
    if (closed && depth === 0 && end > urlStart) {
      parts.push(<a key={candidate.index} href={text.slice(urlStart, end)} target="_blank" rel="noopener noreferrer" className="underline" onClick={(e) => e.stopPropagation()}>{label}</a>);
      cursor = end + 1;
    } else {
      parts.push('[');
      cursor = candidate.index + 1;
    }
  }
  return parts;
}
