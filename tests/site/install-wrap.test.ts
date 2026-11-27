import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(join(process.cwd(), 'site/index.html'), 'utf8');
const css = readFileSync(join(process.cwd(), 'site/styles.css'), 'utf8');

describe('mobile MCP install command', () => {
  it('wraps the install panel on narrow screens without horizontal clipping', () => {
    const start = css.indexOf('@media (max-width: 560px)');
    const end = css.indexOf('@media (prefers-reduced-motion', start);
    const mobileStyles = css.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(mobileStyles).toContain('#install .install {');
    expect(mobileStyles).toContain('white-space: pre-wrap;');
    expect(mobileStyles).toContain('overflow-wrap: anywhere;');
  });

  it('preserves the exact MCP command in the copy payload', () => {
    const start = html.indexOf('<section class="install-sec" id="install"');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = html.indexOf('</section>', start);
    const section = html.slice(start, end);
    const payloads = [...section.matchAll(/data-copy="([^"]+)"/g)].map(
      (match) => match[1],
    );
    const expected =
      'claude mcp add --transport http --scope user vigil ' +
      'https://YOUR-VIGIL-HOST/api/mcp --header ' +
      '&quot;Authorization: Bearer $VIGIL_MCP_KEY&quot;';

    expect(payloads.at(-1)).toBe(expected);
  });
});
