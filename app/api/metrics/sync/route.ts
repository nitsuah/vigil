import { NextResponse } from 'next/server';
import { ensureSchema, getNeonClient } from '@/lib/db';
import logger from '@/lib/log';
import { safeEqual } from '@/lib/mcp-auth';
import { createGithubFetchItems, syncAllMetrics, type MetricsDb } from '@/lib/metrics-sync';

// Daily delivery-metrics sync (vigil#456). Called by .github/workflows/metrics-sync.yml
// with `Authorization: Bearer $METRICS_SYNC_SECRET`; there is no user session, so it
// reads GitHub with the system GITHUB_TOKEN. Fails closed when either is unset.
export const maxDuration = 300;

// One run at a time per instance; the workflow's concurrency group covers overlap across instances.
let running = false;

export async function POST(request: Request): Promise<NextResponse> {
    const secret = process.env.METRICS_SYNC_SECRET;
    const token = process.env.GITHUB_TOKEN;
    if (!secret || secret.length < 16 || !token) {
        return NextResponse.json({ error: 'Metrics sync is not configured' }, { status: 503 });
    }
    const m = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
    if (!m || !safeEqual(m[1], secret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    }
    if (running) return NextResponse.json({ error: 'A sync is already running' }, { status: 409 });
    running = true;
    try {
        const db = getNeonClient();
        await ensureSchema(db);
        const summary = await syncAllMetrics(db as unknown as MetricsDb, createGithubFetchItems(token));
        const status = summary.failed.length > 0 && summary.synced.length === 0 ? 502 : 200;
        return NextResponse.json({ ok: status === 200, repos: summary.synced.length, failed: summary.failed }, { status });
    } catch (err) {
        logger.error('[metrics-sync] run failed', err);
        return NextResponse.json({ error: 'Metrics sync failed' }, { status: 500 });
    } finally {
        running = false;
    }
}
