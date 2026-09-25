import { describe, it, expect } from 'vitest';
import { rollupOpenTasks, parseOpenTaskFilters, type OpenTask } from './task-rollup';

const task = (over: Partial<OpenTask>): OpenTask => ({
    repo: 'vigil',
    full_name: 'nitsuah/vigil',
    repo_url: null,
    title: 't',
    status: 'todo',
    priority: null,
    owner: null,
    section: 'Todo',
    subsection: null,
    ...over,
});

const ALL: OpenTask[] = [
    task({ title: 'a', repo: 'skyview', full_name: 'nitsuah/skyview', priority: 'P2' }),
    task({ title: 'b', repo: 'vigil', priority: null }),
    task({ title: 'c', repo: 'darkmoon', full_name: 'nitsuah/darkmoon', priority: 'P1' }),
    task({ title: 'd', repo: 'skyview', full_name: 'nitsuah/skyview', priority: 'P1', status: 'in-progress', owner: 'Business owner' }),
    task({ title: 'e', repo: 'nitsuah-io', full_name: 'Nitsuah-Labs/nitsuah-io', priority: 'P0' }),
];

describe('rollupOpenTasks', () => {
    it('sorts by priority, then in-progress first, then repo; unprioritised last', () => {
        expect(rollupOpenTasks(ALL).tasks.map(t => t.title)).toEqual(['e', 'd', 'c', 'a', 'b']);
    });

    it('counts by priority and by repo over all matches', () => {
        const r = rollupOpenTasks(ALL);
        expect(r.by_priority).toEqual({ P0: 1, P1: 2, P2: 1, P3: 0, none: 1 });
        expect(r.by_repo).toEqual({ 'nitsuah-io': 1, skyview: 2, darkmoon: 1, vigil: 1 });
        expect(r.total).toBe(5);
    });

    it('filters by repo name or full name, case-insensitively', () => {
        const r = rollupOpenTasks(ALL, { repos: ['SKYVIEW', 'Nitsuah-Labs/nitsuah-io'] });
        expect(r.tasks.map(t => t.title)).toEqual(['e', 'd', 'a']);
    });

    it('filters by priority, including "none"', () => {
        expect(rollupOpenTasks(ALL, { priorities: ['P0', 'P1'] }).total).toBe(3);
        expect(rollupOpenTasks(ALL, { priorities: ['none'] }).tasks.map(t => t.title)).toEqual(['b']);
    });

    it('filters by status and owner substring', () => {
        expect(rollupOpenTasks(ALL, { status: 'in-progress' }).tasks.map(t => t.title)).toEqual(['d']);
        expect(rollupOpenTasks(ALL, { owner: 'business' }).tasks.map(t => t.title)).toEqual(['d']);
    });

    it('caps at limit and reports truncation against the full match count', () => {
        const r = rollupOpenTasks(ALL, { limit: 2 });
        expect(r.tasks).toHaveLength(2);
        expect(r.total).toBe(5);
        expect(r.truncated).toBe(true);
        expect(r.by_priority.P1).toBe(2);
    });

    it('clamps silly limits to 1..500', () => {
        expect(rollupOpenTasks(ALL, { limit: 0 }).tasks).toHaveLength(1);
        expect(rollupOpenTasks(ALL, { limit: 10_000 }).truncated).toBe(false);
    });
});

describe('parseOpenTaskFilters', () => {
    it('accepts arrays or comma strings, and normalises priority case', () => {
        expect(parseOpenTaskFilters({ repos: 'vigil, skyview', priority: ['p0', 'None'] })).toMatchObject({
            repos: ['vigil', 'skyview'],
            priorities: ['P0', 'none'],
        });
    });

    it('accepts a single "repo" alias', () => {
        expect(parseOpenTaskFilters({ repo: 'vigil' }).repos).toEqual(['vigil']);
    });

    it('rejects unknown priorities, statuses, and non-numeric limits', () => {
        expect(() => parseOpenTaskFilters({ priority: 'P5' })).toThrow(/Unknown priority/);
        expect(() => parseOpenTaskFilters({ status: 'done' })).toThrow(/not open/);
        expect(() => parseOpenTaskFilters({ limit: 'lots' })).toThrow(/limit/);
    });
});
