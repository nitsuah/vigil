import { describe, it, expect } from 'vitest';
import {
    batchSizeFor, healthStepAt, HEALTH_STEPS, sliceBatch, planAdvance, parseQueue,
    SUBREQUEST_BUDGET, COST_PER_REPO, MAX_BATCH, ROUTE_OVERHEAD, type QueueItem,
} from '@/lib/sync-batch';

const q = (n: number): QueueItem[] =>
    Array.from({ length: n }, (_, i) => ({ owner: 'o', name: `r${i}`, fullName: `o/r${i}`, isDefault: false }));

describe('batch sizing', () => {
    it('keeps every batch inside the Workers subrequest budget', () => {
        for (const phase of ['metadata', 'health'] as const) {
            const size = batchSizeFor(phase);
            expect(size).toBeGreaterThanOrEqual(1);
            expect(size).toBeLessThanOrEqual(MAX_BATCH);
            // Only a single heavy repo may exceed the budget; a multi-repo batch never does.
            if (size > 1) expect(size * COST_PER_REPO[phase]).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
            // Every batch, even a single heavy repo, must fit the cap once route overhead is added.
            expect(size * COST_PER_REPO[phase] + ROUTE_OVERHEAD).toBeLessThanOrEqual(50);
        }
        expect(SUBREQUEST_BUDGET).toBeLessThan(50);
    });

    it('batches the cheap metadata pass and runs health checks one repo at a time', () => {
        expect(batchSizeFor('metadata')).toBe(3);
        expect(batchSizeFor('health')).toBe(1);
    });

    it('slices the queue at the cursor', () => {
        expect(sliceBatch(q(7), 0, 'metadata').map((r) => r.name)).toEqual(['r0', 'r1', 'r2']);
        expect(sliceBatch(q(7), 6, 'metadata').map((r) => r.name)).toEqual(['r6']);
        // In the health phase the cursor counts steps: three per repo.
        expect(sliceBatch(q(7), 9, 'health').map((r) => r.name)).toEqual(['r3']);
        expect(sliceBatch(q(7), 11, 'health').map((r) => r.name)).toEqual(['r3']);
        expect(sliceBatch(q(7), 21, 'health')).toEqual([]);
        expect(sliceBatch(q(7), -4, 'metadata')).toHaveLength(3);
        expect(sliceBatch([], 0, 'metadata')).toEqual([]);
    });
});

describe('progress advance', () => {
    it('moves through the metadata pass and then flips to health', () => {
        expect(planAdvance({ phase: 'metadata', cursor: 0, queueLength: 7, consumed: 3 }))
            .toEqual({ phase: 'metadata', cursor: 3, completedRepos: 0 });
        expect(planAdvance({ phase: 'metadata', cursor: 6, queueLength: 7, consumed: 1 }))
            .toEqual({ phase: 'health', cursor: 0, completedRepos: 0 });
    });

    it('counts finished health checks and completes on the last one', () => {
        expect(planAdvance({ phase: 'health', cursor: 7, queueLength: 4, consumed: 1 }))
            .toEqual({ phase: 'health', cursor: 8, completedRepos: 2 });
        expect(planAdvance({ phase: 'health', cursor: 8, queueLength: 4, consumed: 1 }))
            .toEqual({ phase: 'health', cursor: 9, completedRepos: 3 });
        expect(planAdvance({ phase: 'health', cursor: 11, queueLength: 4, consumed: 1 }))
            .toEqual({ phase: 'complete', cursor: 12, completedRepos: 4 });
    });

    it('never moves past the end or backwards', () => {
        expect(planAdvance({ phase: 'health', cursor: 3, queueLength: 4, consumed: 99 }).cursor).toBe(12);
        expect(planAdvance({ phase: 'health', cursor: 1, queueLength: 4, consumed: -5 }).cursor).toBe(1);
    });

    it('treats an empty queue as finished the moment the passes run', () => {
        expect(planAdvance({ phase: 'metadata', cursor: 0, queueLength: 0, consumed: 0 }).phase).toBe('health');
        expect(planAdvance({ phase: 'health', cursor: 0, queueLength: 0, consumed: 0 }).phase).toBe('complete');
    });

    it('a full run visits every repo exactly once per pass', () => {
        const queue = q(8);
        const seen: Record<string, string[]> = { metadata: [], health: [] };
        let phase: 'metadata' | 'health' | 'complete' = 'metadata';
        let cursor = 0;
        let guard = 0;
        while (phase !== 'complete' && guard++ < 50) {
            const step = phase === 'health' ? healthStepAt(cursor) : '';
            const batch = sliceBatch(queue, cursor, phase);
            seen[phase].push(...batch.map((b) => (step ? `${b.name}:${step}` : b.name)));
            const next = planAdvance({ phase, cursor, queueLength: queue.length, consumed: batch.length });
            phase = next.phase;
            cursor = next.cursor;
        }
        expect(phase).toBe('complete');
        expect(seen.metadata).toEqual(queue.map((r) => r.name));
        expect(seen.health).toEqual(queue.flatMap((r) => HEALTH_STEPS.map((s) => `${r.name}:${s}`)));
    });
});

describe('parseQueue', () => {
    it('accepts a well-formed queue and defaults isDefault to false', () => {
        expect(parseQueue([{ owner: 'o', name: 'n', fullName: 'o/n' }])).toEqual([
            { owner: 'o', name: 'n', fullName: 'o/n', isDefault: false },
        ]);
    });
    it('rejects anything else, including a missing queue from a legacy row', () => {
        expect(parseQueue(null)).toBeNull();
        expect(parseQueue(undefined)).toBeNull();
        expect(parseQueue('x')).toBeNull();
        expect(parseQueue([{ owner: 'o' }])).toBeNull();
        expect(parseQueue([null])).toBeNull();
        expect(parseQueue([])).toEqual([]);
    });
});
