import { describe, it, expect } from 'vitest';
import { extractBadgeCandidates, MAX_BADGE_SCAN_CHARS } from '@/lib/badge-scan';
import { checkBestPractices } from '@/lib/best-practices';
import type { Octokit } from '@octokit/rest';

describe('extractBadgeCandidates', () => {
    it('extracts markdown, linked and html images', () => {
        const r = extractBadgeCandidates(
            '![a](https://x/a.svg) [![b](https://x/b.svg)](https://x/page) <img alt="c" src="https://x/c.svg" width=3>',
        );
        expect(r.markdown).toEqual(['https://x/a.svg', 'https://x/b.svg']);
        expect(r.linked).toEqual(['https://x/b.svg']);
        expect(r.html).toEqual([{ src: 'https://x/c.svg', alt: 'c' }]);
    });

    it('ignores empty and unterminated constructs', () => {
        const r = extractBadgeCandidates('![a]() ![b](x ![c] <img src="y"');
        expect(r.markdown).toEqual([]);
        expect(r.html).toEqual([]);
    });

    it('ignores oversized img tags', () => {
        const r = extractBadgeCandidates(`<img src="a" alt="${'x'.repeat(5000)}">`);
        expect(r.html).toEqual([]);
    });

    it.each([
        ['markdown opener', '!['],
        ['markdown link opener', '![a]('],
        ['html img opener', '<img '],
        ['linked opener', '[!['],
    ])('stays fast on a large run of unterminated %s', (_name, unit) => {
        const input = unit.repeat(Math.ceil((MAX_BADGE_SCAN_CHARS * 2) / unit.length));
        const t = Date.now();
        extractBadgeCandidates(input);
        expect(Date.now() - t).toBeLessThan(500);
    });
});

describe('deploy badge detection on hostile input', () => {
    const octokit = { rest: { repos: { getBranch: async () => { throw new Error('mock'); } } } } as unknown as Octokit;

    it('finishes quickly on an unterminated-tag README', async () => {
        const t = Date.now();
        const res = await checkBestPractices('o', 'r', octokit, [], '<img '.repeat(100_000) + '![a](' .repeat(50_000));
        expect(Date.now() - t).toBeLessThan(2000);
        expect(res.practices.find((p) => p.type === 'deploy_badge')).toBeDefined();
    });

    it('finishes quickly on a very long badge url', async () => {
        const t = Date.now();
        await checkBestPractices('o', 'r', octokit, [], `![a](github.com/${'/'.repeat(190_000)})`);
        expect(Date.now() - t).toBeLessThan(2000);
    });
});
