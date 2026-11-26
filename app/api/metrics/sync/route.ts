import { NextResponse } from 'next/server';
import { ensureSchema, getNeonClient } from '@/lib/db';
import logger from '@/lib/log';
import { safeEqual } from '@/lib/mcp-auth';
import { createGithubFetchItems, syncMetricsBatch, type MetricsDb } from '@/lib/metrics-sync';

// Daily delivery-metrics sync (vigil#456). Called by .github/workflows/metrics-sync.yml
// with `Authorization: Bearer $METRICS_SYNC_SECRET`; there is no user session, so it
// reads GitHub with the system GITHUB_TOKEN. Fails closed when either is unset.
// Each call syncs one batch that fits the Worker's subrequest limit; the workflow
// repeats it with `?after=<next>` until `done`. That workflow's log is public.
export const maxDuration = 300;

const REPO_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

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
    const after = new URL(request.url).searchParams.get('after') || null;
    if (after !== null && !REPO_ID.test(after)) {
        return NextResponse.json({ error: 'after must be a repo id' }, { status: 400 });
    }
    if (running) return NextResponse.json({ error: 'A sync is already running' }, { status: 409 });
    running = true;
    try {
        const db = getNeonClient();
        await ensureSchema(db);
        const { synced, failed, next, done, remaining } = await syncMetricsBatch(
            db as unknown as MetricsDb,
            createGithubFetchItems(token),
            after,
        );
        // 200 even with failures, so the caller goes on to the other repos and then judges the run.
        const repos = synced.filter((r) => !r.more).length;
        return NextResponse.json({ ok: failed.length === 0, repos, failed, next, done, remaining });
    } catch (err) {
        logger.error('[metrics-sync] run failed', err);
        return NextResponse.json({ error: 'Metrics sync failed' }, { status: 500 });
    } finally {
        running = false;
    }
}
