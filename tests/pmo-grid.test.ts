import { describe, it, expect } from 'vitest';
import { groupWorkByRepo, type PriorityKey } from '@/lib/pmo-grid';
import type { OpenTask } from '@/lib/task-rollup';

const task = (full_name: string, title: string, priority: OpenTask['priority'], status: OpenTask['status'] = 'todo'): OpenTask => ({
    repo: full_name.split('/')[1], full_name, repo_url: null, title, status, priority,
    owner: null, section: null, subsection: null,
});

const repos = ['o/alpha', 'o/beta', 'o/gamma', 'o/delta'].map((full_name) => ({ full_name, name: full_name.split('/')[1] }));
const all = new Set<PriorityKey>(['P0', 'P1', 'P2', 'P3', 'none']);

describe('groupWorkByRepo', () => {
    it('orders repos by their most urgent work, then by count at that priority', () => {
        const tasks = [
            task('o/alpha', 'a1', 'P1'), task('o/alpha', 'a2', 'P1'),
            task('o/beta', 'b1', 'P0'),
            task('o/gamma', 'g1', 'P1'), task('o/gamma', 'g2', 'P2'),
        ];
        const { active, idle } = groupWorkByRepo(repos, tasks, all);
        expect(active.map((g) => g.repo.name)).toEqual(['beta', 'alpha', 'gamma']);
        expect(idle.map((g) => g.repo.name)).toEqual(['delta']);
    });

    it('sorts tasks within a repo by priority, in-progress first, unprioritized last', () => {
        const tasks = [
            task('o/alpha', 'none', null), task('o/alpha', 'p2', 'P2'),
            task('o/alpha', 'p1-todo', 'P1'), task('o/alpha', 'p1-wip', 'P1', 'in-progress'),
        ];
        const [g] = groupWorkByRepo(repos, tasks, all).active;
        expect(g.tasks.map((t) => t.title)).toEqual(['p1-wip', 'p1-todo', 'p2', 'none']);
    });

    it('applies the priority filter but keeps the unfiltered open total', () => {
        const tasks = [task('o/alpha', 'a1', 'P1'), task('o/alpha', 'a2', 'P3'), task('o/beta', 'b1', 'P3')];
        const { active, idle } = groupWorkByRepo(repos, tasks, new Set<PriorityKey>(['P0', 'P1']));
        expect(active).toHaveLength(1);
        expect(active[0].tasks.map((t) => t.title)).toEqual(['a1']);
        expect(active[0].open_total).toBe(2);
        expect(idle.find((g) => g.repo.name === 'beta')?.open_total).toBe(1);
    });

    it('matches repos by full name case-insensitively', () => {
        const { active } = groupWorkByRepo(repos, [task('O/Alpha', 'x', 'P1')], all);
        expect(active.map((g) => g.repo.name)).toEqual(['alpha']);
    });
});
