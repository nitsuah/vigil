// Pure planning helpers for client-driven chunked sync (#305).
//
// On Cloudflare Workers nothing may run after the response is sent, and one
// invocation is limited to 50 subrequests (GitHub + Neon calls). Sync is
// therefore split into small awaited batches that the dashboard drives.

export interface QueueItem {
    owner: string;
    name: string;
    fullName: string;
    /** A default repo the user does not own: fetched with the system token when set. */
    isDefault: boolean;
}

export type BatchPhase = 'metadata' | 'health';

// One repo's health pass needs more subrequests than a single invocation gets,
// so it runs as these steps, one per request. In the health phase the run's
// cursor counts steps, not repos.
export const HEALTH_STEPS = ['metrics', 'docs', 'practices'] as const;
export type HealthStep = (typeof HEALTH_STEPS)[number];

export function healthStepAt(cursor: number): HealthStep {
    return HEALTH_STEPS[Math.max(0, cursor) % HEALTH_STEPS.length];
}

/** Steps left for the repo at this cursor, including the current one. */
export function stepsLeftInRepo(cursor: number): number {
    return HEALTH_STEPS.length - (Math.max(0, cursor) % HEALTH_STEPS.length);
}

// Stay well under the 50-subrequest cap: headroom for the auth check, the
// rate-limit probe and the progress write that every batch also makes.
export const SUBREQUEST_BUDGET = 40;
// Rough per-repo subrequest cost: getRepo + metadata upsert + access grant,
// vs. one step of the detailed health pass (the metrics step is the largest).
export const COST_PER_REPO: Record<BatchPhase, number> = { metadata: 6, health: 35 };
// Calls every batch request makes besides the repo work: schema check, run state
// read and advance, quota probe, and the final timestamp write.
export const ROUTE_OVERHEAD = 8;
export const MAX_BATCH = 3;

export function batchSizeFor(phase: BatchPhase): number {
    const fit = Math.floor(SUBREQUEST_BUDGET / COST_PER_REPO[phase]);
    return Math.max(1, Math.min(MAX_BATCH, fit));
}

export function sliceBatch(queue: readonly QueueItem[], cursor: number, phase: BatchPhase): QueueItem[] {
    const start = phase === 'health'
        ? Math.floor(Math.max(0, cursor) / HEALTH_STEPS.length)
        : Math.max(0, cursor);
    return queue.slice(start, start + batchSizeFor(phase));
}

export interface AdvanceInput {
    phase: BatchPhase;
    cursor: number;
    queueLength: number;
    /** Units the batch consumed (worked on or skipped): repos for metadata, steps for health. */
    consumed: number;
}

export interface AdvanceResult {
    phase: BatchPhase | 'complete';
    cursor: number;
    /** Repos whose health pass has finished; 0 until the health phase starts. */
    completedRepos: number;
}

export function planAdvance({ phase, cursor, queueLength, consumed }: AdvanceInput): AdvanceResult {
    const total = phase === 'health' ? queueLength * HEALTH_STEPS.length : queueLength;
    const next = Math.min(total, Math.max(0, cursor) + Math.max(0, consumed));
    if (phase === 'metadata') {
        return next >= queueLength
            ? { phase: 'health', cursor: 0, completedRepos: 0 }
            : { phase: 'metadata', cursor: next, completedRepos: 0 };
    }
    const completedRepos = Math.floor(next / HEALTH_STEPS.length);
    return next >= total
        ? { phase: 'complete', cursor: next, completedRepos }
        : { phase: 'health', cursor: next, completedRepos };
}

/** A stored queue is only trusted if every entry has the expected shape. */
export function parseQueue(raw: unknown): QueueItem[] | null {
    if (!Array.isArray(raw)) return null;
    const items: QueueItem[] = [];
    for (const entry of raw) {
        if (
            !entry || typeof entry !== 'object' ||
            typeof (entry as QueueItem).owner !== 'string' ||
            typeof (entry as QueueItem).name !== 'string' ||
            typeof (entry as QueueItem).fullName !== 'string'
        ) return null;
        const e = entry as QueueItem;
        items.push({ owner: e.owner, name: e.name, fullName: e.fullName, isDefault: e.isDefault === true });
    }
    return items;
}
