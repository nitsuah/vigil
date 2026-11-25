import { describe, it, expect } from 'vitest';
import { getLanguageIcon, getLanguageColor } from './language-colors';

describe('getLanguageIcon', () => {
    it('returns default icon for null', () => {
        expect(getLanguageIcon(null)).toBe('📄');
    });

    it('returns mapped icon for TypeScript', () => {
        expect(getLanguageIcon('TypeScript')).toBe('TS');
    });

    it('returns mapped icon for Python', () => {
        expect(getLanguageIcon('Python')).toBe('PY');
    });

    it('returns mapped icon for Rust', () => {
        expect(getLanguageIcon('Rust')).toBe('🦀');
    });

    it('falls back to first two letters upper-cased for unmapped language', () => {
        expect(getLanguageIcon('Zig')).toBe('ZI');
    });
});

describe('getLanguageColor', () => {
    it('returns default slate color for null', () => {
        expect(getLanguageColor(null)).toBe('bg-slate-900/30 text-slate-300 border-slate-800');
    });

    it('returns blue color for TypeScript', () => {
        expect(getLanguageColor('TypeScript')).toBe('bg-blue-900/30 text-blue-300 border-blue-800');
    });

    it('returns red color for Ruby', () => {
        expect(getLanguageColor('Ruby')).toBe('bg-red-900/30 text-red-300 border-red-800');
    });

    it('returns default slate color for unmapped language', () => {
        expect(getLanguageColor('Zig')).toBe('bg-slate-900/30 text-slate-300 border-slate-800');
    });

    it('matches expected pattern for all tested languages', () => {
        const colorPattern = /^bg-\w+-900\/30 text-\w+-300 border-\w+-800$/;
        const languages = ['TypeScript', 'JavaScript', 'Go', 'Shell', 'Vue', null, 'Zig'] as (string | null)[];

        for (const lang of languages) {
            const color = getLanguageColor(lang);
            expect(color).toMatch(colorPattern);
        }
    });
});