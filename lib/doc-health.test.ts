import { describe, it, expect } from 'vitest';
import {
    calculateDocHealthState,
    hashContent,
    calculateDocHealth,
    getDocHealthColor,
    type HealthState,
} from './doc-health';

describe('calculateDocHealthState', () => {
    it('returns missing when exists is false', () => {
        expect(calculateDocHealthState(false, 'x'.repeat(100), null)).toBe('missing');
    });

    it('returns missing when content is empty string', () => {
        expect(calculateDocHealthState(true, '', null)).toBe('missing');
    });

    it('returns missing when content is null', () => {
        expect(calculateDocHealthState(true, null, null)).toBe('missing');
    });

    it('returns dormant when content matches template (ignoring surrounding whitespace)', () => {
        const template = '  Hello World  ';
        const content = 'Hello World';
        expect(calculateDocHealthState(true, content, template)).toBe('dormant');
    });

    it('returns malformed when content under 50 trimmed characters', () => {
        expect(calculateDocHealthState(true, 'short', null)).toBe('malformed');
    });

    it('returns dormant when 100 chars of prose containing [TODO:', () => {
        const content = 'This is a document with [TODO: add more content] and more text to reach length';
        expect(calculateDocHealthState(true, content, null)).toBe('dormant');
    });

    it('returns dormant when 100 chars of prose containing Replace this', () => {
        const content = 'This document needs to Replace this placeholder with actual content here';
        expect(calculateDocHealthState(true, content, null)).toBe('dormant');
    });

    it('returns healthy for 100 characters of ordinary prose', () => {
        const content = 'This is a well-written document with substantial content that provides value to readers without any template markers or placeholder text';
        expect(calculateDocHealthState(true, content, null)).toBe('healthy');
    });
});

describe('hashContent', () => {
    it('trims content before hashing', () => {
        expect(hashContent(' a ')).toBe(hashContent('a'));
    });

    it('returns a 32-char hex string', () => {
        const hash = hashContent('test content');
        expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('differs for different content', () => {
        expect(hashContent('content A')).not.toBe(hashContent('content B'));
    });
});

describe('calculateDocHealth', () => {
    it('returns score 100 when all five expected docs are present', () => {
        const docStatuses = [
            { doc_type: 'README.md', exists: true },
            { doc_type: 'ROADMAP.md', exists: true },
            { doc_type: 'TASKS.md', exists: true },
            { doc_type: 'FEATURES.md', exists: true },
            { doc_type: 'METRICS.md', exists: true },
        ];
        const result = calculateDocHealth(docStatuses, 'any');
        expect(result).toEqual({
            score: 100,
            present: 5,
            expected: 5,
            missing: [],
        });
    });

    it('matches doc_type case-insensitively with .md stripped', () => {
        const docStatuses = [
            { doc_type: 'readme', exists: true },
            { doc_type: 'ROADMAP.md', exists: true },
            { doc_type: 'Tasks', exists: true },
            { doc_type: 'features.md', exists: true },
            { doc_type: 'METRICS', exists: true },
        ];
        const result = calculateDocHealth(docStatuses, 'any');
        expect(result.score).toBe(100);
        expect(result.present).toBe(5);
        expect(result.missing).toEqual([]);
    });

    it('returns score 60 and missing features, metrics when three of five present', () => {
        const docStatuses = [
            { doc_type: 'README.md', exists: true },
            { doc_type: 'ROADMAP.md', exists: true },
            { doc_type: 'TASKS.md', exists: true },
        ];
        const result = calculateDocHealth(docStatuses, 'any');
        expect(result.score).toBe(60);
        expect(result.present).toBe(3);
        expect(result.expected).toBe(5);
        expect(result.missing).toEqual(['features', 'metrics']);
    });

    it('counts exists: false as absent', () => {
        const docStatuses = [
            { doc_type: 'README.md', exists: true },
            { doc_type: 'ROADMAP.md', exists: false },
            { doc_type: 'TASKS.md', exists: true },
            { doc_type: 'FEATURES.md', exists: true },
            { doc_type: 'METRICS.md', exists: true },
        ];
        const result = calculateDocHealth(docStatuses, 'any');
        expect(result.score).toBe(80);
        expect(result.present).toBe(4);
        expect(result.missing).toEqual(['roadmap']);
    });

    it('returns score 0, present 0 for empty array', () => {
        const result = calculateDocHealth([], 'any');
        expect(result).toEqual({
            score: 0,
            present: 0,
            expected: 5,
            missing: ['readme', 'roadmap', 'tasks', 'features', 'metrics'],
        });
    });
});

describe('getDocHealthColor', () => {
    it('returns text-green-400 for score 100', () => {
        expect(getDocHealthColor(100)).toBe('text-green-400');
    });

    it('returns text-green-400 for score 80', () => {
        expect(getDocHealthColor(80)).toBe('text-green-400');
    });

    it('returns text-yellow-400 for score 79', () => {
        expect(getDocHealthColor(79)).toBe('text-yellow-400');
    });

    it('returns text-yellow-400 for score 60', () => {
        expect(getDocHealthColor(60)).toBe('text-yellow-400');
    });

    it('returns text-red-400 for score 59', () => {
        expect(getDocHealthColor(59)).toBe('text-red-400');
    });

    it('returns text-red-400 for score 0', () => {
        expect(getDocHealthColor(0)).toBe('text-red-400');
    });
});