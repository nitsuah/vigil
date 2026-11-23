import type { Octokit } from '@octokit/rest';

/** Branch the nightly journeys reporter commits BUGS.md and metrics to. */
export const JOURNEYS_BRANCH = 'bot/journeys';
/** A last run older than this many days no longer says anything about tonight. */
export const STALE_AFTER_DAYS = 3;

export type JourneysStatus = 'green' | 'red' | 'stale' | 'none';

export interface JourneysHealth {
    status: JourneysStatus;
    /** Date (YYYY-MM-DD) of the last nightly run, when known. */
    lastRunDate: string | null;
    lastRunUrl: string | null;
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    coverage: { covered: number; total: number } | null;
    openJourneyIssues: number;
    openReviewIssues: number;
}

interface RunRecord {
    date: string | null;
    run: string | null;
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    coverage: { covered: number; total: number } | null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/** Only link to GitHub run pages; the file is bot-written but still data. */
function safeRunUrl(v: unknown): string | null {
    return typeof v === 'string' && /^https:\/\/github\.com\//.test(v) ? v : null;
}

/** Parse a metrics/<month>.jsonl body, skipping blank and corrupt lines. */
export function parseMetricsJsonl(text: string): RunRecord[] {
    const runs: RunRecord[] = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let raw: Record<string, unknown>;
        try {
            const parsed: unknown = JSON.parse(line);
            if (!parsed || typeof parsed !== 'object') continue;
            raw = parsed as Record<string, unknown>;
        } catch {
            continue;
        }
        const cov = raw.coverage as { covered?: unknown; total?: unknown } | null | undefined;
        runs.push({
            date: typeof raw.date === 'string' ? raw.date : null,
            run: safeRunUrl(raw.run),
            total: num(raw.total),
            passed: num(raw.passed),
            failed: num(raw.failed),
            flaky: num(raw.flaky),
            coverage: cov && typeof cov === 'object' && num(cov.total) > 0
                ? { covered: num(cov.covered), total: num(cov.total) }
                : null,
        });
    }
    return runs;
}

/** Fold the last run and the open bot-issue counts into one health record. */
export function summarizeJourneys(
    runs: RunRecord[],
    counts: { journey: number; review: number },
    now: Date = new Date()
): JourneysHealth {
    const last = runs.length ? runs[runs.length - 1] : null;
    let status: JourneysStatus = 'none';
    if (last) {
        const ageDays = last.date ? (now.getTime() - new Date(last.date).getTime()) / 864e5 : Infinity;
        // A red run is red however old; staleness only downgrades a green one.
        status = last.failed > 0 ? 'red' : ageDays > STALE_AFTER_DAYS ? 'stale' : 'green';
    }
    return {
        status,
        lastRunDate: last?.date ?? null,
        lastRunUrl: last?.run ?? null,
        total: last?.total ?? 0,
        passed: last?.passed ?? 0,
        failed: last?.failed ?? 0,
        flaky: last?.flaky ?? 0,
        coverage: last?.coverage ?? null,
        openJourneyIssues: counts.journey,
        openReviewIssues: counts.review,
    };
}

function monthKey(d: Date, back = 0): string {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
    return x.toISOString().slice(0, 7);
}

async function readMonth(octokit: Octokit, owner: string, repo: string, month: string): Promise<RunRecord[]> {
    try {
        const { data } = await octokit.repos.getContent({
            owner, repo, path: `metrics/${month}.jsonl`, ref: JOURNEYS_BRANCH,
        });
        if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) return [];
        return parseMetricsJsonl(Buffer.from(data.content, 'base64').toString('utf8'));
    } catch (err) {
        if ((err as { status?: number }).status === 404) return [];
        throw err;
    }
}

async function openCount(octokit: Octokit, owner: string, repo: string, label: string): Promise<number> {
    // Open issues only; PRs share the issues endpoint, so drop them. One page
    // is enough for a badge: 100 open bot issues is already a red flag.
    const { data } = await octokit.issues.listForRepo({
        owner, repo, labels: label, state: 'open', per_page: 100,
    });
    return data.filter((i) => !i.pull_request).length;
}

/**
 * Journeys health for one repo, read through the caller's server-side token.
 * Throws on GitHub failures other than "no metrics file yet" so callers can
 * tell "no journeys" from "could not read".
 */
export async function fetchJourneysHealth(
    octokit: Octokit,
    owner: string,
    repo: string,
    now: Date = new Date()
): Promise<JourneysHealth> {
    const [thisMonth, prevMonth, journey, review] = await Promise.all([
        readMonth(octokit, owner, repo, monthKey(now)),
        readMonth(octokit, owner, repo, monthKey(now, 1)),
        openCount(octokit, owner, repo, 'bot:journey'),
        openCount(octokit, owner, repo, 'bot:review'),
    ]);
    return summarizeJourneys([...prevMonth, ...thisMonth], { journey, review }, now);
}
