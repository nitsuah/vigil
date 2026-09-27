/**
 * PMO repo/work grid: groups the open-task rollup under each repo card so the
 * page shows one combined "repos + their open work" section instead of two.
 * Pure, so ordering rules are unit-tested (tests/pmo-grid.test.ts).
 */

import type { OpenTask } from '@/lib/task-rollup';
import type { TaskPriority } from '@/types/repo';

export type PriorityKey = TaskPriority | 'none';
export const PRIORITY_KEYS: readonly PriorityKey[] = ['P0', 'P1', 'P2', 'P3', 'none'];

export interface GridRepo {
    full_name: string;
    name: string;
}

export interface RepoWorkGroup<R extends GridRepo> {
    repo: R;
    /** Tasks matching the priority filter, highest priority first (in-progress first within a priority). */
    tasks: OpenTask[];
    /** Every open task for the repo, ignoring the priority filter. */
    open_total: number;
}

const rank = (p: PriorityKey) => PRIORITY_KEYS.indexOf(p);
const keyOf = (t: OpenTask): PriorityKey => t.priority ?? 'none';

function compareTasks(a: OpenTask, b: OpenTask): number {
    return rank(keyOf(a)) - rank(keyOf(b)) ||
        (a.status === b.status ? 0 : a.status === 'in-progress' ? -1 : 1);
}

/**
 * Per-priority counts, highest first, compared lexicographically: a repo with
 * one P0 outranks a repo with ten P1s; ties fall to the next priority.
 */
function compareGroups<R extends GridRepo>(a: RepoWorkGroup<R>, b: RepoWorkGroup<R>): number {
    for (const p of PRIORITY_KEYS) {
        const diff = b.tasks.filter((t) => keyOf(t) === p).length - a.tasks.filter((t) => keyOf(t) === p).length;
        if (diff !== 0) return diff;
    }
    return a.repo.name.localeCompare(b.repo.name);
}

/**
 * Split repos into those with open work matching `priorities` (ordered by the
 * urgency of that work) and the rest (by name), so idle repos can collapse to
 * a single compact row.
 */
export function groupWorkByRepo<R extends GridRepo>(
    repos: R[],
    tasks: OpenTask[],
    priorities: ReadonlySet<PriorityKey>,
): { active: RepoWorkGroup<R>[]; idle: RepoWorkGroup<R>[] } {
    const byRepo = new Map<string, OpenTask[]>();
    for (const t of tasks) {
        const key = t.full_name.toLowerCase();
        byRepo.set(key, [...(byRepo.get(key) ?? []), t]);
    }

    const groups = repos.map((repo) => {
        const all = byRepo.get(repo.full_name.toLowerCase()) ?? [];
        return {
            repo,
            tasks: all.filter((t) => priorities.has(keyOf(t))).sort(compareTasks),
            open_total: all.length,
        };
    });

    return {
        active: groups.filter((g) => g.tasks.length > 0).sort(compareGroups),
        idle: groups.filter((g) => g.tasks.length === 0).sort((a, b) => a.repo.name.localeCompare(b.repo.name)),
    };
}
