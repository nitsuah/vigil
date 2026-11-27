/**
 * Delivery-metrics sync (vigil#456, slice 3). Maps GitHub's REST `issues`
 * payloads (which list issues and PRs together) onto the rows in
 * database/schema.sql, upserts them idempotently, and rebuilds the weekly
 * rollups for every week a change could have touched. The mapper is pure and
 * unit-tested; the I/O sits behind small injected seams (`MetricsDb`,
 * `fetchItems`) so tests run without a database or the network.
 */
import { isAdvisoryFork } from '@/lib/advisory-fork';
import { githubCache } from '@/lib/github-cache';
import { createOctokitClient } from '@/lib/githubClient';
import logger from '@/lib/log';
import {
    classifyAuthor,
    computeWeeklyRollup,
    isoWeekOf,
    parseParentNumber,
    type MetricsIssue,
    type MetricsPr,
    type WeeklyRollup,
} from '@/lib/metrics-rollup';

/** The subset of GitHub's `GET /repos/{o}/{r}/issues` item that the mapper reads. */
export interface GhItemPayload {
    number: number;
    title: string;
    state: string;
    state_reason?: string | null;
    body?: string | null;
    labels?: Array<string | { name?: string | null }>;
    user?: { login?: string | null; type?: string | null } | null;
    created_at: string;
    updated_at: string;
    closed_at?: string | null;
    pull_request?: { merged_at?: string | null } | null;
}

export interface IssueRow extends MetricsIssue {
    title: string;
    authorLogin: string;
    updatedAt: string;
}

export interface PrRow extends MetricsPr {
    authorLogin: string;
    closesIssues: number[];
    updatedAt: string;
}

export type MappedItem = { kind: 'issue'; row: IssueRow } | { kind: 'pr'; row: PrRow };

/** Largest value a Postgres INTEGER column holds; issue references from body text must fit. */
const MAX_PG_INT = 2_147_483_647;
const inRange = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n > 0 && n <= MAX_PG_INT;

/** Issue numbers a PR body closes ("closes #1", "Fixes owner/repo#2", "resolved: #3"). */
export function parseClosedIssues(body: string | null | undefined): number[] {
    if (!body) return [];
    const found = new Set<number>();
    const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/gi;
    for (let m = re.exec(body); m; m = re.exec(body)) {
        const n = Number(m[1]);
        if (inRange(n)) found.add(n);
    }
    return [...found].sort((a, b) => a - b);
}

function labelNames(labels: GhItemPayload['labels']): string[] {
    return (labels ?? [])
        .map((l) => (typeof l === 'string' ? l : l?.name ?? ''))
        .filter((l): l is string => l.length > 0);
}

/** Map one REST item to an issue or PR row; null for a payload without the fields a row needs. */
export function mapGithubItem(item: GhItemPayload): MappedItem | null {
    if (!item || !Number.isSafeInteger(item.number) || !item.created_at || !item.updated_at) return null;
    const labels = labelNames(item.labels);
    const authorLogin = item.user?.login || 'ghost';
    const authorType = classifyAuthor(authorLogin, item.user?.type, labels);
    const closedAt = item.closed_at ?? null;

    if (item.pull_request) {
        const mergedAt = item.pull_request.merged_at ?? null;
        return {
            kind: 'pr',
            row: {
                number: item.number,
                state: mergedAt ? 'merged' : item.state === 'closed' ? 'closed' : 'open',
                labels,
                authorType,
                authorLogin,
                closesIssues: parseClosedIssues(item.body),
                openedAt: item.created_at,
                mergedAt,
                closedAt,
                updatedAt: item.updated_at,
            },
        };
    }

    return {
        kind: 'issue',
        row: {
            number: item.number,
            title: item.title ?? '',
            state: item.state === 'closed' ? 'closed' : 'open',
            stateReason: item.state_reason ?? null,
            labels,
            authorType,
            authorLogin,
            parentNumber: ((n) => (inRange(n) ? n : null))(parseParentNumber(item.body)),
            openedAt: item.created_at,
            closedAt,
            updatedAt: item.updated_at,
        },
    };
}

/**
 * ISO weeks to rebuild after changed items: from the earliest week any changed
 * item touched through the current week. `scopeEnd` carries forward, so a late
 * edit to an old issue shifts every later week's open count.
 */
export function weeksToRecompute(items: readonly MappedItem[], now: Date, extraStamps: readonly (string | null)[] = []): string[] {
    let earliest: number | null = null;
    for (const s of extraStamps) {
        if (!s) continue;
        const t = new Date(s).getTime();
        if (Number.isFinite(t) && (earliest === null || t < earliest)) earliest = t;
    }
    for (const { row } of items) {
        const stamps = [row.openedAt, row.closedAt, 'mergedAt' in row ? row.mergedAt : null];
        for (const s of stamps) {
            if (!s) continue;
            const t = new Date(s).getTime();
            if (Number.isFinite(t) && (earliest === null || t < earliest)) earliest = t;
        }
    }
    if (earliest === null) return [];
    const weeks: string[] = [];
    const last = isoWeekOf(now);
    for (let t = earliest; ; t += 7 * 86_400_000) {
        const w = isoWeekOf(new Date(t));
        if (w > last) break;
        if (weeks[weeks.length - 1] !== w) weeks.push(w);
        if (w === last) break;
    }
    return weeks;
}

/** Minimal shape of the tagged-template SQL function (Neon) this module needs. */
export type MetricsDb = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

export interface MetricsRepo {
    id: string;
    full_name: string;
    private_repo?: boolean | null;
    visibility_verified?: boolean | null;
}

export interface FetchedItems {
    items: GhItemPayload[];
    /** GitHub requests made. */
    requests: number;
    /** True when `maxPages` ran out before the listing did. */
    more: boolean;
}

/** Items updated since `since`, oldest update first, reading at most `maxPages` pages. */
export type FetchItems = (fullName: string, since: string | null, maxPages: number) => Promise<FetchedItems>;

export interface RepoSyncResult {
    fullName: string;
    issues: number;
    prs: number;
    weeks: number;
    /** True when changed items remain; the next call continues from the stored cursor. */
    more: boolean;
}

const toIso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const toIsoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : toIso(v));

async function upsertIssues(db: MetricsDb, repoId: string, rows: IssueRow[]): Promise<void> {
    if (rows.length === 0) return;
    const json = JSON.stringify(rows.map((r) => ({
        number: r.number, title: r.title, state: r.state, state_reason: r.stateReason, labels: r.labels,
        author_login: r.authorLogin, author_type: r.authorType, parent_number: r.parentNumber,
        opened_at: r.openedAt, closed_at: r.closedAt, updated_at: r.updatedAt,
    })));
    await db`
        INSERT INTO gh_issues (repo_id, number, title, state, state_reason, labels, author_login, author_type, parent_number, opened_at, closed_at, updated_at)
        SELECT ${repoId}::uuid, x.number, x.title, x.state, x.state_reason, x.labels, x.author_login, x.author_type, x.parent_number, x.opened_at, x.closed_at, x.updated_at
        FROM jsonb_to_recordset(${json}::jsonb) AS x(
            number int, title text, state text, state_reason text, labels jsonb, author_login text, author_type text,
            parent_number int, opened_at timestamptz, closed_at timestamptz, updated_at timestamptz)
        ON CONFLICT (repo_id, number) DO UPDATE SET
            title = EXCLUDED.title, state = EXCLUDED.state, state_reason = EXCLUDED.state_reason, labels = EXCLUDED.labels,
            author_login = EXCLUDED.author_login, author_type = EXCLUDED.author_type, parent_number = EXCLUDED.parent_number,
            opened_at = EXCLUDED.opened_at, closed_at = EXCLUDED.closed_at, updated_at = EXCLUDED.updated_at
        WHERE gh_issues.updated_at < EXCLUDED.updated_at
    `;
}

async function upsertPrs(db: MetricsDb, repoId: string, rows: PrRow[]): Promise<void> {
    if (rows.length === 0) return;
    const json = JSON.stringify(rows.map((r) => ({
        number: r.number, state: r.state, labels: r.labels, author_login: r.authorLogin, author_type: r.authorType,
        closes_issues: r.closesIssues, opened_at: r.openedAt, merged_at: r.mergedAt, closed_at: r.closedAt, updated_at: r.updatedAt,
    })));
    await db`
        INSERT INTO gh_prs (repo_id, number, state, labels, author_login, author_type, closes_issues, opened_at, merged_at, closed_at, updated_at)
        SELECT ${repoId}::uuid, x.number, x.state, x.labels, x.author_login, x.author_type,
            ARRAY(SELECT jsonb_array_elements_text(x.closes_issues)::int), x.opened_at, x.merged_at, x.closed_at, x.updated_at
        FROM jsonb_to_recordset(${json}::jsonb) AS x(
            number int, state text, labels jsonb, author_login text, author_type text, closes_issues jsonb,
            opened_at timestamptz, merged_at timestamptz, closed_at timestamptz, updated_at timestamptz)
        ON CONFLICT (repo_id, number) DO UPDATE SET
            state = EXCLUDED.state, labels = EXCLUDED.labels, author_login = EXCLUDED.author_login, author_type = EXCLUDED.author_type,
            closes_issues = EXCLUDED.closes_issues, opened_at = EXCLUDED.opened_at, merged_at = EXCLUDED.merged_at,
            closed_at = EXCLUDED.closed_at, updated_at = EXCLUDED.updated_at
        WHERE gh_prs.updated_at < EXCLUDED.updated_at
    `;
}

async function upsertRollups(db: MetricsDb, repoId: string, rollups: WeeklyRollup[]): Promise<void> {
    if (rollups.length === 0) return;
    const json = JSON.stringify(rollups.map((r) => ({
        iso_week: r.isoWeek, issues_opened: r.issuesOpened, issues_closed: r.issuesClosed, leaf_closed: r.leafClosed,
        scope_end: r.scopeEnd, prs_opened: r.prsOpened, prs_merged: r.prsMerged, bugs_opened: r.bugsOpened,
        bugs_closed: r.bugsClosed, imp_prs_opened: r.impPrsOpened, imp_prs_merged: r.impPrsMerged,
        lead_time_p50_hours: r.leadTimeP50Hours, lead_time_p90_hours: r.leadTimeP90Hours,
    })));
    // Rebuilt from the issue/PR tables, never incremented, so a re-run writes the same numbers.
    await db`
        INSERT INTO weekly_rollups (repo_id, iso_week, issues_opened, issues_closed, leaf_closed, scope_end, prs_opened, prs_merged,
            bugs_opened, bugs_closed, imp_prs_opened, imp_prs_merged, lead_time_p50_hours, lead_time_p90_hours)
        SELECT ${repoId}::uuid, x.iso_week, x.issues_opened, x.issues_closed, x.leaf_closed, x.scope_end, x.prs_opened, x.prs_merged,
            x.bugs_opened, x.bugs_closed, x.imp_prs_opened, x.imp_prs_merged, x.lead_time_p50_hours, x.lead_time_p90_hours
        FROM jsonb_to_recordset(${json}::jsonb) AS x(
            iso_week text, issues_opened int, issues_closed int, leaf_closed int, scope_end int, prs_opened int, prs_merged int,
            bugs_opened int, bugs_closed int, imp_prs_opened int, imp_prs_merged int, lead_time_p50_hours numeric, lead_time_p90_hours numeric)
        ON CONFLICT (repo_id, iso_week) DO UPDATE SET
            issues_opened = EXCLUDED.issues_opened, issues_closed = EXCLUDED.issues_closed, leaf_closed = EXCLUDED.leaf_closed,
            scope_end = EXCLUDED.scope_end, prs_opened = EXCLUDED.prs_opened, prs_merged = EXCLUDED.prs_merged,
            bugs_opened = EXCLUDED.bugs_opened, bugs_closed = EXCLUDED.bugs_closed, imp_prs_opened = EXCLUDED.imp_prs_opened,
            imp_prs_merged = EXCLUDED.imp_prs_merged, lead_time_p50_hours = EXCLUDED.lead_time_p50_hours,
            lead_time_p90_hours = EXCLUDED.lead_time_p90_hours
    `;
}

/** Load a repo's stored rows in the shapes `computeWeeklyRollup` takes. */
async function loadStored(db: MetricsDb, repoId: string): Promise<{ issues: MetricsIssue[]; prs: MetricsPr[] }> {
    const issueRows = (await db`
        SELECT number, state, state_reason, labels, author_type, parent_number, opened_at, closed_at FROM gh_issues WHERE repo_id = ${repoId}
    `) as Array<Record<string, unknown>>;
    const prRows = (await db`
        SELECT number, state, labels, author_type, opened_at, merged_at, closed_at FROM gh_prs WHERE repo_id = ${repoId}
    `) as Array<Record<string, unknown>>;
    return {
        issues: issueRows.map((r) => ({
            number: Number(r.number),
            state: r.state as MetricsIssue['state'],
            stateReason: (r.state_reason as string | null) ?? null,
            labels: (r.labels as string[]) ?? [],
            authorType: r.author_type as MetricsIssue['authorType'],
            parentNumber: r.parent_number === null || r.parent_number === undefined ? null : Number(r.parent_number),
            openedAt: toIso(r.opened_at),
            closedAt: toIsoOrNull(r.closed_at),
        })),
        prs: prRows.map((r) => ({
            number: Number(r.number),
            state: r.state as MetricsPr['state'],
            labels: (r.labels as string[]) ?? [],
            authorType: r.author_type as MetricsPr['authorType'],
            openedAt: toIso(r.opened_at),
            mergedAt: toIsoOrNull(r.merged_at),
            closedAt: toIsoOrNull(r.closed_at),
        })),
    };
}

/**
 * Sync one repo: fetch items changed since the stored cursor, upsert them,
 * rebuild the touched weeks, then advance the cursor. After a complete listing
 * the cursor is the time the fetch *started*; when `maxPages` cut it short, it
 * is the newest update that was read, so the next call resumes there. It only
 * moves after every write succeeded, so a failed run is retried from the same
 * point and an item updated mid-run is seen again next time.
 */
export async function syncRepoMetrics(
    db: MetricsDb,
    repo: MetricsRepo,
    fetchItems: FetchItems,
    now: Date = new Date(),
    maxPages: number = MAX_PAGES_PER_CALL,
): Promise<RepoSyncResult> {
    const state = (await db`SELECT last_synced_at FROM metrics_sync_state WHERE repo_id = ${repo.id}`) as Array<{ last_synced_at: unknown }>;
    const since = state[0] ? toIso(state[0].last_synced_at) : null;
    const startedAt = now.toISOString();

    const fetched = await fetchItems(repo.full_name, since, maxPages);
    const mapped = fetched.items
        .map(mapGithubItem)
        .filter((m): m is MappedItem => m !== null);
    const issues = mapped.flatMap((m) => (m.kind === 'issue' ? [m.row] : []));
    const prs = mapped.flatMap((m) => (m.kind === 'pr' ? [m.row] : []));

    // Parent links before they are overwritten: dropping or moving a link changes
    // the old parent's leaf status just as adding one changes the new parent's.
    const oldParents = issues.length === 0 ? [] : ((await db`
        SELECT parent_number FROM gh_issues WHERE repo_id = ${repo.id} AND number = ANY(${issues.map((i) => i.number)}) AND parent_number IS NOT NULL
    `) as Array<{ parent_number: number }>).map((r) => Number(r.parent_number));

    let cursor = startedAt;
    if (fetched.more) {
        // Advance past every raw item read, including payloads that cannot be mapped.
        // Using startedAt here would skip valid older items on the remaining pages.
        const newest = Math.max(...fetched.items.map((item) => Date.parse(item.updated_at)).filter(Number.isFinite));
        // `since` is inclusive: a cursor that stays put would re-read the same pages for ever.
        if (!Number.isFinite(newest) || (since !== null && newest <= Date.parse(since))) {
            throw new Error(`Backfill cannot advance past ${since ?? 'the start'} within ${maxPages} page(s)`);
        }
        cursor = new Date(Math.min(newest, now.getTime())).toISOString();
    }

    await upsertIssues(db, repo.id, issues);
    await upsertPrs(db, repo.id, prs);

    let weeks = weeksToRecompute(mapped, now);
    if (weeks.length > 0) {
        const stored = await loadStored(db, repo.id);
        const parents = new Set([...oldParents, ...issues.map((i) => i.parentNumber).filter((n): n is number => n !== null)]);
        const parentStamps = stored.issues.filter((i) => parents.has(i.number)).flatMap((i) => [i.openedAt, i.closedAt]);
        weeks = weeksToRecompute(mapped, now, parentStamps);
        await upsertRollups(db, repo.id, weeks.map((w) => computeWeeklyRollup(stored.issues, stored.prs, w)));
    }

    await db`
        INSERT INTO metrics_sync_state (repo_id, last_synced_at) VALUES (${repo.id}, ${cursor}::timestamptz)
        ON CONFLICT (repo_id) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at
        WHERE metrics_sync_state.last_synced_at < EXCLUDED.last_synced_at
    `;
    return { fullName: repo.full_name, issues: issues.length, prs: prs.length, weeks: weeks.length, more: fetched.more };
}

/*
 * Workers Free allows 50 external subrequests per invocation, and each GitHub
 * request and each Neon HTTP query is one. One call therefore syncs as many
 * repos as fit and returns a cursor; metrics-sync.yml repeats it until `done`.
 */
/** Left under 50 for redirects and Octokit retries. */
export const SUBREQUEST_BUDGET = 40;
/** The route's schema check and this module's repo listing. */
export const BATCH_OVERHEAD = 2;
/** Most Neon queries one repo can make: cursor read, old parents, two upserts, two loads, rollups, cursor write. */
export const MAX_DB_QUERIES_PER_REPO = 8;
export const MAX_PAGES_PER_CALL = 5;
/** Charged for a fetch that threw: one request plus Octokit's three retries. */
const FAILED_FETCH_COST = 4;

export interface MetricsSyncFailure {
    /** Safe for the public workflow log: a private or unverified repo is shown by id only. */
    repo: string;
    /** A category, never the raw message, which can quote repo names and account URLs. */
    error: string;
}

export interface MetricsSyncBatch {
    synced: RepoSyncResult[];
    failed: MetricsSyncFailure[];
    /** Pass back as `after` to continue; a repo id, so it names nothing. */
    next: string | null;
    done: boolean;
    /** Repos not finished yet, including one whose backfill is part way through. */
    remaining: number;
}

const publicLabel = (r: MetricsRepo): string =>
    r.visibility_verified === true && r.private_repo === false ? r.full_name : `private repo ${r.id}`;

function errorCategory(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    if (/too many subrequests/i.test(message)) return 'Too many subrequests';
    if (message.startsWith('Backfill cannot advance')) return 'Backfill cannot advance';
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === 'number') return `GitHub HTTP ${status}`;
    return 'Sync failed (see Worker logs)';
}

/**
 * Sync the next batch of non-archived repos (owner decision 1 on #456) after
 * the `after` repo id, skipping temporary advisory forks. One repo's failure
 * never stops the rest.
 */
export async function syncMetricsBatch(
    db: MetricsDb,
    fetchItems: FetchItems,
    after: string | null = null,
    now: Date = new Date(),
): Promise<MetricsSyncBatch> {
    const rows = (await db`
        SELECT id, full_name, private_repo, visibility_verified FROM repos
        WHERE is_archived IS NOT TRUE AND (${after}::uuid IS NULL OR id > ${after}::uuid)
        ORDER BY id
    `) as unknown as MetricsRepo[];
    const repos = rows.filter((r) => !isAdvisoryFork(r.full_name));

    let used = BATCH_OVERHEAD;
    const countedDb: MetricsDb = (strings, ...values) => {
        used++;
        return db(strings, ...values);
    };
    const countedFetch: FetchItems = async (fullName, since, maxPages) => {
        try {
            const fetched = await fetchItems(fullName, since, maxPages);
            used += fetched.requests;
            return fetched;
        } catch (err) {
            // Pages read before the failure, plus the failed request and its retries.
            const before = (err as { requestsBefore?: unknown } | null)?.requestsBefore;
            used += (typeof before === 'number' ? before : 0) + FAILED_FETCH_COST;
            throw err;
        }
    };

    const synced: RepoSyncResult[] = [];
    const failed: MetricsSyncFailure[] = [];
    let next = after;
    let finished = 0;
    for (const repo of repos) {
        // Start a repo only if its worst case still fits, so none is cut off mid-write.
        const pages = Math.min(MAX_PAGES_PER_CALL, SUBREQUEST_BUDGET - used - MAX_DB_QUERIES_PER_REPO);
        if (pages < 1) break;
        try {
            const result = await syncRepoMetrics(countedDb, repo, countedFetch, now, pages);
            synced.push(result);
            // Leave `next` before an unfinished backfill so the next call continues it.
            if (result.more) break;
        } catch (err) {
            const category = errorCategory(err);
            logger.warn(`[metrics-sync] ${repo.full_name} failed: ${err instanceof Error ? err.message : String(err)}`);
            // Both can come from running late in a batch (the count fell short, or too few
            // pages were left): give the repo a fresh invocation, unless it already led one.
            if (finished > 0 && (category === 'Too many subrequests' || category === 'Backfill cannot advance')) break;
            failed.push({ repo: publicLabel(repo), error: category });
        }
        next = repo.id;
        finished++;
    }
    const remaining = repos.length - finished;
    return { synced, failed, next, done: remaining === 0, remaining };
}

const PAGE_SIZE = 100;

/**
 * Real `fetchItems`: pages `GET /repos/{o}/{r}/issues?state=all&since=` with
 * `lib/github-cache.ts` ETags, so an unchanged page costs a 304 instead of
 * quota. A daily run is usually one request per repo.
 */
export function createGithubFetchItems(token: string): FetchItems {
    const octokit = createOctokitClient(token);
    return async (fullName, since, maxPages) => {
        const [owner, repo] = fullName.split('/');
        if (!owner || !repo) throw new Error(`Invalid repo full name: ${fullName}`);
        const items: GhItemPayload[] = [];
        let requests = 0;
        let more = false;
        for (let page = 1; page <= maxPages; page++) {
            const key = `metrics:${fullName}:${since ?? 'all'}:${page}`;
            const cached = githubCache.get(key);
            let data: GhItemPayload[];
            requests++;
            try {
                const res = await octokit.request('GET /repos/{owner}/{repo}/issues', {
                    owner, repo, state: 'all', per_page: PAGE_SIZE, page,
                    sort: 'updated', direction: 'asc',
                    ...(since ? { since } : {}),
                    headers: cached ? { 'if-none-match': cached.etag } : {},
                });
                data = res.data as unknown as GhItemPayload[];
                const etag = res.headers.etag;
                if (etag) githubCache.set(key, data, etag);
            } catch (err) {
                if ((err as { status?: number }).status === 304 && cached) {
                    data = cached.data as GhItemPayload[];
                } else {
                    // Let the batch charge the pages already read before this one failed.
                    if (err && typeof err === 'object') (err as { requestsBefore?: number }).requestsBefore = requests - 1;
                    throw err;
                }
            }
            items.push(...data);
            more = data.length === PAGE_SIZE;
            if (!more) break;
        }
        return { items, requests, more };
    };
}
