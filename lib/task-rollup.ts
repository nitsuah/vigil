/**
 * Cross-repo open-task rollup — every unfinished TASKS.md item across the
 * tracked (non-hidden) portfolio, with priority and owner, in one list.
 *
 * Backs the `get_open_tasks` MCP tool, the `open_work` block in
 * GET /api/context, and the PMO "Open work" panel. Priority/owner are parsed
 * at sync time by lib/parsers/tasks.ts, so they populate on the next sync.
 */

import type { getNeonClient } from '@/lib/db';
import type { TaskPriority } from '@/types/repo';

type Db = ReturnType<typeof getNeonClient>;

export const TASK_PRIORITIES: readonly TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];
export const DEFAULT_ROLLUP_LIMIT = 100;
export const MAX_ROLLUP_LIMIT = 500;

export interface OpenTask {
    repo: string;
    full_name: string;
    repo_url: string | null;
    title: string;
    status: 'todo' | 'in-progress';
    priority: TaskPriority | null;
    owner: string | null;
    section: string | null;
    subsection: string | null;
}

export interface OpenTaskFilters {
    /** Repo names or owner/repo full names; omit for every tracked repo. */
    repos?: string[];
    /** Priority buckets to keep; `'none'` keeps tasks with no priority. */
    priorities?: Array<TaskPriority | 'none'>;
    status?: 'todo' | 'in-progress';
    /** Case-insensitive substring match on the task's owner. */
    owner?: string;
    limit?: number;
}

export interface OpenTaskRollup {
    tasks: OpenTask[];
    /** Matches before `limit` was applied. */
    total: number;
    truncated: boolean;
    by_priority: Record<TaskPriority | 'none', number>;
    /** Keyed by owner/repo full name (short names can collide across owners). */
    by_repo: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const priorityRank = (p: TaskPriority | null) => (p ? TASK_PRIORITIES.indexOf(p) : TASK_PRIORITIES.length);

/** Filter, sort (priority, then in-progress first, then repo), count, and cap. Pure. */
export function rollupOpenTasks(all: OpenTask[], filters: OpenTaskFilters = {}): OpenTaskRollup {
    const repoKeys = filters.repos?.length
        ? new Set(filters.repos.map((r) => r.trim().toLowerCase()).filter(Boolean))
        : null;
    const priorities = filters.priorities?.length ? new Set(filters.priorities) : null;
    const owner = filters.owner?.trim().toLowerCase() || null;
    const limit = Math.min(Math.max(1, Math.floor(filters.limit ?? DEFAULT_ROLLUP_LIMIT)), MAX_ROLLUP_LIMIT);

    const matched = all
        .filter((t) => !repoKeys || repoKeys.has(t.repo.toLowerCase()) || repoKeys.has(t.full_name.toLowerCase()))
        .filter((t) => !priorities || priorities.has(t.priority ?? 'none'))
        .filter((t) => !filters.status || t.status === filters.status)
        .filter((t) => !owner || (t.owner ?? '').toLowerCase().includes(owner))
        .sort((a, b) =>
            priorityRank(a.priority) - priorityRank(b.priority) ||
            (a.status === b.status ? 0 : a.status === 'in-progress' ? -1 : 1) ||
            a.repo.localeCompare(b.repo));

    const by_priority: OpenTaskRollup['by_priority'] = { P0: 0, P1: 0, P2: 0, P3: 0, none: 0 };
    const by_repo: Record<string, number> = {};
    for (const t of matched) {
        by_priority[t.priority ?? 'none']++;
        by_repo[t.full_name] = (by_repo[t.full_name] ?? 0) + 1;
    }

    return {
        tasks: matched.slice(0, limit),
        total: matched.length,
        truncated: matched.length > limit,
        by_priority,
        by_repo,
    };
}

/**
 * Load every open task on non-hidden repos. `repoIds`, when given, restricts the
 * result to those repo ids (session access scoping, CWE-639); omit it only for
 * the portfolio-admin bearer key.
 */
export async function loadOpenTasks(db: Db, repoIds?: Set<string>): Promise<OpenTask[]> {
    if (repoIds && repoIds.size === 0) return [];
    const rows = (repoIds
        ? await db`
            SELECT r.name AS repo, r.full_name, r.url AS repo_url,
                   t.title, t.status, t.priority, t.owner, t.section, t.subsection
            FROM tasks t
            JOIN repos r ON r.id = t.repo_id
            WHERE t.status <> 'done'
              AND (r.is_hidden = false OR r.is_hidden IS NULL)
              AND r.id = ANY(${[...repoIds]})
            ORDER BY r.name, t.created_at ASC
        `
        : await db`
            SELECT r.name AS repo, r.full_name, r.url AS repo_url,
                   t.title, t.status, t.priority, t.owner, t.section, t.subsection
            FROM tasks t
            JOIN repos r ON r.id = t.repo_id
            WHERE t.status <> 'done'
              AND (r.is_hidden = false OR r.is_hidden IS NULL)
            ORDER BY r.name, t.created_at ASC
        `) as Row[];

    return rows.map((r) => ({
            repo: r.repo,
            full_name: r.full_name,
            repo_url: r.repo_url ?? null,
            title: r.title,
            status: r.status,
            priority: TASK_PRIORITIES.includes(r.priority) ? r.priority : null,
            owner: r.owner ?? null,
            section: r.section ?? null,
            subsection: r.subsection ?? null,
        }));
}

/** Parse loosely-typed tool/query input into filters, rejecting unknown values. */
export function parseOpenTaskFilters(input: Record<string, unknown>): OpenTaskFilters {
    // A malformed filter must error, never silently widen to "every repo".
    const list = (v: unknown, name: string): string[] => {
        if (v === undefined || v === null || v === '') return [];
        if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
        if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.map((s) => s.trim()).filter(Boolean);
        throw new Error(`"${name}" must be a string or an array of strings`);
    };

    const priorities = list(input.priority, 'priority').map((p) => (p.toLowerCase() === 'none' ? 'none' : p.toUpperCase()));
    const badPriority = priorities.find((p) => p !== 'none' && !TASK_PRIORITIES.includes(p as TaskPriority));
    if (badPriority) throw new Error(`Unknown priority "${badPriority}" — use P0, P1, P2, P3, or none`);

    // Omitted = undefined / null / ''. Anything else of the wrong type is an error,
    // never silently dropped (which would widen the result).
    const omitted = (v: unknown) => v === undefined || v === null || v === '';
    for (const key of ['status', 'owner'] as const) {
        if (!omitted(input[key]) && typeof input[key] !== 'string') throw new Error(`"${key}" must be a string`);
    }
    if (!omitted(input.limit) && typeof input.limit !== 'number' && typeof input.limit !== 'string') {
        throw new Error('"limit" must be a number');
    }

    const status = omitted(input.status) ? undefined : (input.status as string);
    if (status && status !== 'todo' && status !== 'in-progress') {
        throw new Error(`Unknown status "${status}" — use todo or in-progress (done tasks are not open)`);
    }

    const limitNum = omitted(input.limit) ? undefined : Number(input.limit);
    if (limitNum !== undefined && !Number.isFinite(limitNum)) throw new Error('"limit" must be a number');

    return {
        repos: list(input.repos ?? input.repo, 'repos'),
        priorities: priorities as OpenTaskFilters['priorities'],
        status: status as OpenTaskFilters['status'],
        owner: omitted(input.owner) ? undefined : (input.owner as string),
        limit: limitNum,
    };
}
