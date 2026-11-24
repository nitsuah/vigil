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

// Stay well under the 50-subrequest cap: headroom for the auth check, the
// rate-limit probe and the progress write that every batch also makes.
export const SUBREQUEST_BUDGET = 40;
// Rough per-repo subrequest cost: getRepo + metadata upsert + access grant,
// vs. the detailed health pass (about a dozen GitHub calls plus DB writes).
export const COST_PER_REPO: Record<BatchPhase, number> = { metadata: 6, health: 35 };
export const MAX_BATCH = 3;

export function batchSizeFor(phase: BatchPhase): number {
    const fit = Math.floor(SUBREQUEST_BUDGET / COST_PER_REPO[phase]);
    return Math.max(1, Math.min(MAX_BATCH, fit));
}

export function sliceBatch(queue: readonly QueueItem[], cursor: number, phase: BatchPhase): QueueItem[] {
    const start = Math.max(0, cursor);
    return queue.slice(start, start + batchSizeFor(phase));
}

export interface AdvanceInput {
    phase: BatchPhase;
    cursor: number;
    queueLength: number;
    /** Repos the batch consumed (worked on or skipped). */
    consumed: number;
}

export interface AdvanceResult {
    phase: BatchPhase | 'complete';
    cursor: number;
    /** Repos whose health pass has finished; 0 until the health phase starts. */
    completedRepos: number;
}

export function planAdvance({ phase, cursor, queueLength, consumed }: AdvanceInput): AdvanceResult {
    const next = Math.min(queueLength, Math.max(0, cursor) + Math.max(0, consumed));
    if (phase === 'metadata') {
        return next >= queueLength
            ? { phase: 'health', cursor: 0, completedRepos: 0 }
            : { phase: 'metadata', cursor: next, completedRepos: 0 };
    }
    return next >= queueLength
        ? { phase: 'complete', cursor: next, completedRepos: next }
        : { phase: 'health', cursor: next, completedRepos: next };
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
