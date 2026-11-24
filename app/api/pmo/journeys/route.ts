import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNeonClient, ensureSchema } from '@/lib/db';
import { getAccessibleRepoIds } from '@/lib/repo-access';
import { createOctokitClient } from '@/lib/githubClient';
import { fetchJourneysHealth, type JourneysHealth } from '@/lib/journeys-metrics';
import { JOURNEYS_PRACTICE } from '@/lib/visual-docs';
import logger from '@/lib/log';

export interface PmoJourneysRow {
    name: string;
    full_name: string;
    /** null when GitHub could not be read for this repo. */
    health: JourneysHealth | null;
}

/** Repos read at once. */
const CONCURRENCY = 4;
/**
 * Most repos read per request. Each costs three GitHub requests (four when it
 * has no metrics this month); Workers Free allows 50 subrequests per
 * invocation, shared with the database and auth calls. Repos beyond the cap are
 * reported as `skipped`, never as unreadable.
 */
const MAX_REPOS = 10;

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}

export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!session.accessToken) {
        return NextResponse.json({ error: 'No GitHub access token' }, { status: 401 });
    }
    try {
        const db = getNeonClient();
        await ensureSchema(db);
        // Only repos with a nightly: journeys practice "healthy" = journeys dir + workflow.
        const candidates = (await db`
            SELECT r.id, r.name, r.full_name
            FROM repos r
            JOIN best_practices bp ON bp.repo_id = r.id
            WHERE bp.practice_type = ${JOURNEYS_PRACTICE}
              AND bp.status = 'healthy'
              AND (r.is_hidden = false OR r.is_hidden IS NULL)
            ORDER BY r.full_name
        `) as Array<{ id: string; name: string; full_name: string }>;
        const accessible = await getAccessibleRepoIds(db, session.userId);
        const allowed = candidates.filter((r) => accessible.has(r.id));
        const repos = allowed.slice(0, MAX_REPOS);
        const skipped = allowed.length - repos.length;

        const octokit = createOctokitClient(session.accessToken);
        const rows = await mapLimited(repos, CONCURRENCY, async (r): Promise<PmoJourneysRow> => {
            const [owner, repo] = r.full_name.split('/');
            try {
                return { name: r.name, full_name: r.full_name, health: await fetchJourneysHealth(octokit, owner, repo) };
            } catch (err) {
                logger.warn(`[pmo/journeys] Could not read ${r.full_name}:`, err);
                return { name: r.name, full_name: r.full_name, health: null };
            }
        });
        return NextResponse.json({ repos: rows, skipped });
    } catch (error) {
        logger.warn('[pmo/journeys] Failed to build journeys rollup:', error);
        return NextResponse.json({ error: 'Failed to load journeys rollup' }, { status: 500 });
    }
}
