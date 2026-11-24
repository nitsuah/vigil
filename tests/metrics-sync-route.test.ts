import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const syncAllMetrics = vi.fn();
vi.mock('@/lib/db', () => ({ getNeonClient: vi.fn(() => ({})), ensureSchema: vi.fn() }));
vi.mock('@/lib/log', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@/lib/metrics-sync', () => ({
    syncAllMetrics: (...a: unknown[]) => syncAllMetrics(...a),
    createGithubFetchItems: vi.fn(() => vi.fn()),
}));

import { POST } from '@/app/api/metrics/sync/route';

const req = (auth?: string) =>
    new Request('http://localhost/api/metrics/sync', { method: 'POST', headers: auth ? { authorization: auth } : {} });

describe('POST /api/metrics/sync', () => {
    const env = { ...process.env };
    beforeEach(() => {
        process.env.METRICS_SYNC_SECRET = 'a-long-enough-secret';
        process.env.GITHUB_TOKEN = 'ghp_test';
        syncAllMetrics.mockReset().mockResolvedValue({ synced: [{ fullName: 'o/r' }], failed: [] });
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
        expect(syncAllMetrics).not.toHaveBeenCalled();
    });

    it('rejects a missing or wrong bearer token', async () => {
        expect((await POST(req())).status).toBe(401);
        expect((await POST(req('Bearer nope'))).status).toBe(401);
        expect(syncAllMetrics).not.toHaveBeenCalled();
    });

    it('runs the sync for the right secret and reports per-repo failures', async () => {
        syncAllMetrics.mockResolvedValue({ synced: [{ fullName: 'o/r' }], failed: [{ fullName: 'o/x', error: 'boom' }] });
        const res = await POST(req('Bearer a-long-enough-secret'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, repos: 1, failed: [{ fullName: 'o/x', error: 'boom' }] });
    });

    it('returns 502 when every repo failed', async () => {
        syncAllMetrics.mockResolvedValue({ synced: [], failed: [{ fullName: 'o/x', error: 'boom' }] });
        expect((await POST(req('Bearer a-long-enough-secret'))).status).toBe(502);
    });
});

describe('POST /api/metrics/sync overlap', () => {
    it('rejects a second run while one is in flight', async () => {
        process.env.METRICS_SYNC_SECRET = 'a-long-enough-secret';
        process.env.GITHUB_TOKEN = 'ghp_test';
        let release!: () => void;
        syncAllMetrics.mockReset().mockReturnValueOnce(new Promise((r) => { release = () => r({ synced: [], failed: [] }); }));
        const first = POST(req('Bearer a-long-enough-secret'));
        await new Promise((r) => setTimeout(r, 0));
        expect((await POST(req('Bearer a-long-enough-secret'))).status).toBe(409);
        release();
        expect((await first).status).toBe(200);
    });
});
