import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { renderInlineMarkdown } from './markdown-utils';

afterEach(cleanup);

const html = (text: string) => render(<p>{renderInlineMarkdown(text)}</p>).container.querySelector('p')!;

describe('renderInlineMarkdown', () => {
  it('formats code, bold and http links with short link text', () => {
    const p = html('**Ship** `npm test` ([#12](https://github.com/o/r/pull/12))');
    expect(p.textContent).toBe('Ship npm test (#12)');
    expect(p.querySelector('code')?.textContent).toBe('npm test');
    expect(p.querySelector('strong')?.textContent).toBe('Ship');
    expect(p.querySelector('a')?.getAttribute('href')).toBe('https://github.com/o/r/pull/12');
  });

  it('keeps balanced parentheses inside a link address', () => {
    const p = html('see [wiki](https://en.wikipedia.org/wiki/Foo_(bar)) now');
    expect(p.querySelector('a')?.getAttribute('href')).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
    expect(p.textContent).toBe('see wiki now');
  });

  it('handles long malformed parenthesis runs without a complex regex', () => {
    const hostile = `[x](https://example.com/${'('.repeat(10000)}\n)`;
    expect(html(hostile).querySelector('a')).toBeNull();
  });

  it('never renders raw HTML or non-http links', () => {
    const p = html('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
    expect(p.querySelector('img')).toBeNull();
    expect(p.querySelector('a')).toBeNull();
  });
});
