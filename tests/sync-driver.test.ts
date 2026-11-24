import { describe, it, expect, vi } from 'vitest';
import { driveSync, type SyncProgressState } from '@/lib/sync-driver';

const state = (over: Partial<SyncProgressState> = {}): SyncProgressState => ({
    sessionId: 's1', phase: 'metadata', totalRepos: 2, completedRepos: 0, currentRepo: 'o/a',
    failedRepos: 0, cursor: 0, progressPercentage: 0, done: false, ...over,
});
const ok = (body: SyncProgressState) => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number, body: unknown = {}) => new Response(JSON.stringify(body), { status: code });

function scripted(...responses: Array<Response | Error>) {
    const calls: Array<{ skip: boolean; cursor?: number; phase?: string }> = [];
    const sent: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        const b = JSON.parse(String(init?.body));
        sent.push(b);
        calls.push({ skip: b.skip === true, cursor: b.cursor, phase: b.phase });
        const next = responses.shift();
        if (!next) throw new Error('unexpected extra call');
        if (next instanceof Error) throw next;
        return next;
    }) as unknown as typeof fetch;
    return { fetchImpl, calls, sent };
}

describe('driveSync', () => {
    it('calls batches until the run completes and reports each step', async () => {
        const { fetchImpl } = scripted(
            ok(state({ phase: 'metadata', cursor: 2 })),
            ok(state({ phase: 'health', completedRepos: 1 })),
            ok(state({ phase: 'complete', completedRepos: 2, done: true, progressPercentage: 100 })),
        );
        const seen: string[] = [];
        const result = await driveSync({ sessionId: 's1', fetchImpl, onProgress: (p) => seen.push(p.phase) });
        expect(result.status).toBe('complete');
        expect(seen).toEqual(['metadata', 'health', 'complete']);
    });

    it('retries a failed batch once before moving on', async () => {
        const { fetchImpl, calls } = scripted(
            status(500),
            ok(state({ phase: 'complete', done: true })),
        );
        const result = await driveSync({ sessionId: 's1', fetchImpl });
        expect(result.status).toBe('complete');
        expect(calls.map((c) => c.skip)).toEqual([false, false]);
    });

    it('skips a batch that fails twice, records it, and keeps going', async () => {
        const { fetchImpl, calls } = scripted(
            new Error('network'), status(502),
            ok(state({ phase: 'health', failedRepos: 1 })),
            ok(state({ phase: 'complete', failedRepos: 1, done: true })),
        );
        const result = await driveSync({ sessionId: 's1', fetchImpl });
        expect(calls.map((c) => c.skip)).toEqual([false, false, true, false]);
        expect(result.status).toBe('complete');
        expect(result.progress?.failedRepos).toBe(1);
    });

    it('names the batch it means, so a skip after a lost response cannot hit the wrong one', async () => {
        const { fetchImpl, sent } = scripted(
            ok(state({ phase: 'metadata', cursor: 3 })),
            status(500), status(500), // batch at cursor 3 is lost twice
            ok(state({ phase: 'complete', done: true })),
        );
        await driveSync({ sessionId: 's1', fetchImpl, start: { cursor: 0, phase: 'metadata' } });
        expect(sent.map((b) => [b.cursor, b.phase, b.skip === true])).toEqual([
            [0, 'metadata', false], [3, 'metadata', false], [3, 'metadata', false], [3, 'metadata', true],
        ]);
    });

    it('gives up with a clear message when even the skip cannot reach the server', async () => {
        const { fetchImpl } = scripted(status(500), status(500), status(500));
        const result = await driveSync({ sessionId: 's1', fetchImpl });
        expect(result.status).toBe('failed');
        expect(result.message).toMatch(/Run it again/);
    });

    it('stops on 401 without retrying', async () => {
        const { fetchImpl, calls } = scripted(status(401, { error: 'Unauthorized' }));
        expect((await driveSync({ sessionId: 's1', fetchImpl })).status).toBe('unauthorized');
        expect(calls).toHaveLength(1);
    });

    it('stops on a missing or unresumable run (404, legacy 409) without retrying', async () => {
        for (const code of [404, 409]) {
            const { fetchImpl, calls } = scripted(status(code, { error: 'gone' }));
            const result = await driveSync({ sessionId: 's1', fetchImpl });
            expect(result.status).toBe('lost');
            expect(result.message).toBe('gone');
            expect(calls).toHaveLength(1);
        }
    });

    it('ends with the server reason when the run stops on the rate limit', async () => {
        const reason = 'GitHub rate limit reached after 9 of 14 repos · resets in 23 min';
        const { fetchImpl } = scripted(ok(state({ phase: 'error', currentRepo: reason, done: true })));
        const result = await driveSync({ sessionId: 's1', fetchImpl });
        expect(result.status).toBe('error');
        expect(result.message).toBe(reason);
    });

    it('stops when cancelled, before and during a call', async () => {
        const controller = new AbortController();
        controller.abort();
        const { fetchImpl, calls } = scripted();
        expect((await driveSync({ sessionId: 's1', fetchImpl, signal: controller.signal })).status).toBe('cancelled');
        expect(calls).toHaveLength(0);

        const live = new AbortController();
        const slow = vi.fn(async () => { live.abort(); throw new DOMException('aborted', 'AbortError'); }) as unknown as typeof fetch;
        const result = await driveSync({ sessionId: 's1', fetchImpl: slow, signal: live.signal });
        expect(result.status).toBe('cancelled');
        expect(slow).toHaveBeenCalledTimes(1);
    });

    it('treats a malformed success body as a transient failure', async () => {
        const { fetchImpl } = scripted(ok({} as SyncProgressState), ok(state({ phase: 'complete', done: true })));
        expect((await driveSync({ sessionId: 's1', fetchImpl })).status).toBe('complete');
    });

    it('cannot loop forever', async () => {
        const fetchImpl = vi.fn(async () => ok(state())) as unknown as typeof fetch;
        const result = await driveSync({ sessionId: 's1', fetchImpl, maxCalls: 5 });
        expect(result.status).toBe('failed');
        expect(fetchImpl).toHaveBeenCalledTimes(5);
    });
});
