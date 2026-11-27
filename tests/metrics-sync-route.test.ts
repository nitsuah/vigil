import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const syncMetricsBatch = vi.fn();
vi.mock('@/lib/db', () => ({ getNeonClient: vi.fn(() => ({})), ensureSchema: vi.fn() }));
vi.mock('@/lib/log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/metrics-sync', () => ({
    syncMetricsBatch: (...a: unknown[]) => syncMetricsBatch(...a),
    createGithubFetchItems: vi.fn(() => vi.fn()),
}));

import { POST } from '@/app/api/metrics/sync/route';

const req = (auth?: string, query = '') =>
    new Request(`http://localhost/api/metrics/sync${query}`, { method: 'POST', headers: auth ? { authorization: auth } : {} });

const batch = (over: Record<string, unknown> = {}) =>
    ({ synced: [{ fullName: 'o/r', more: false }], failed: [], next: null, done: true, remaining: 0, ...over });

describe('POST /api/metrics/sync', () => {
    const env = { ...process.env };
    beforeEach(() => {
        process.env.METRICS_SYNC_SECRET = 'a-long-enough-secret';
        process.env.GITHUB_TOKEN = 'ghp_test';
        syncMetricsBatch.mockReset().mockResolvedValue(batch());
    });
    afterEach(() => {
        process.env = { ...env };
    });

    it('fails closed when the secret or token is missing or too short', async () => {
        delete process.env.METRICS_SYNC_SECRET;
        expect((await POST(req('Bearer x'))).status).toBe(503);
        process.env.METRICS_SYNC_SECRET = 'short';
        expect((await POST(req('Bearer short'))).status).toBe(503);
        process.env.METRICS_SYNC_SECRET = 'a-long-enough-secret';
        delete process.env.GITHUB_TOKEN;
        expect((await POST(req('Bearer a-long-enough-secret'))).status).toBe(503);
        expect(syncMetricsBatch).not.toHaveBeenCalled();
    });

    it('rejects a missing or wrong bearer token', async () => {
        expect((await POST(req())).status).toBe(401);
        expect((await POST(req('Bearer nope'))).status).toBe(401);
        expect(syncMetricsBatch).not.toHaveBeenCalled();
    });

    it('runs one batch for the right secret and returns the cursor and failures', async () => {
        const next = '00000000-0000-4000-8000-000000000001';
        syncMetricsBatch.mockResolvedValue(batch({
            synced: [{ fullName: 'o/r', more: false }, { fullName: 'o/big', more: true }],
            failed: [{ repo: 'o/x', error: 'GitHub HTTP 403' }],
            next, done: false, remaining: 7,
        }));
        const res = await POST(req('Bearer a-long-enough-secret'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: false, repos: 1, failed: [{ repo: 'o/x', error: 'GitHub HTTP 403' }], next, done: false, remaining: 7 });
        expect(syncMetricsBatch.mock.calls[0][2]).toBeNull();
    });

    it('stays 200 when a whole batch failed, so the caller reaches the other repos', async () => {
        syncMetricsBatch.mockResolvedValue(batch({ synced: [], failed: [{ repo: 'o/x', error: 'GitHub HTTP 403' }] }));
        expect((await POST(req('Bearer a-long-enough-secret'))).status).toBe(200);
    });

    it('passes the cursor through and rejects one that is not a repo id', async () => {
        const after = '00000000-0000-4000-8000-000000000001';
        await POST(req('Bearer a-long-enough-secret', `?after=${after}`));
        expect(syncMetricsBatch.mock.calls[0][2]).toBe(after);
        await POST(req('Bearer a-long-enough-secret', '?after='));
        expect(syncMetricsBatch.mock.calls[1][2]).toBeNull();
        expect((await POST(req('Bearer a-long-enough-secret', "?after=1';--"))).status).toBe(400);
        expect(syncMetricsBatch).toHaveBeenCalledTimes(2);
    });
});

describe('POST /api/metrics/sync overlap', () => {
    it('rejects a second run while one is in flight', async () => {
        process.env.METRICS_SYNC_SECRET = 'a-long-enough-secret';
        process.env.GITHUB_TOKEN = 'ghp_test';
        let release!: () => void;
        syncMetricsBatch.mockReset().mockReturnValueOnce(new Promise((r) => { release = () => r(batch()); }));
        const first = POST(req('Bearer a-long-enough-secret'));
        await new Promise((r) => setTimeout(r, 0));
        expect((await POST(req('Bearer a-long-enough-secret'))).status).toBe(409);
        release();
        expect((await first).status).toBe(200);
    });
});
