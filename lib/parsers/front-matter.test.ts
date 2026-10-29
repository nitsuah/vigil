import { describe, it, expect, afterEach } from 'vitest';
import { parseFrontMatter } from './front-matter';
import { parseRoadmap } from './roadmap';
import { parseTasks } from './tasks';
import { parseFeatures } from './features';
import { parseMetrics } from './metrics';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
    delete g.__frontMatterPwned;
});

const evil = (lang: string) =>
    `---${lang}\n(function(){ globalThis.__frontMatterPwned = true; return { title: 'x' }; })()\n---\n# Roadmap\n\n## Q1 2025\n- [ ] item\n`;

describe('front matter never executes code', () => {
    for (const lang of ['js', 'javascript', 'coffee']) {
        it(`parseFrontMatter refuses a ---${lang} fence`, () => {
            const out = parseFrontMatter(evil(lang));
            expect(g.__frontMatterPwned).toBeUndefined();
            expect(out.data).toEqual({});
        });
    }

    it('none of the four document parsers evaluate a ---js fence', () => {
        for (const parse of [parseRoadmap, parseTasks, parseFeatures, parseMetrics]) {
            expect(() => parse(evil('js'))).not.toThrow();
            expect(g.__frontMatterPwned).toBeUndefined();
        }
    });

    it('still parses ordinary YAML and JSON front matter', () => {
        expect(parseFrontMatter('---\ntitle: Hello\ncount: 2\n---\nbody').data).toEqual({ title: 'Hello', count: 2 });
        expect(parseFrontMatter('---json\n{"a":1}\n---\nbody').data).toEqual({ a: 1 });
        expect(parseFrontMatter('no front matter\n').content).toBe('no front matter\n');
    });
});
