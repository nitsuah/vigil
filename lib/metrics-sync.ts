/**
 * Delivery-metrics sync (vigil#456, slice 3). Maps GitHub's REST `issues`
 * payloads (which list issues and PRs together) onto the rows in
 * database/schema.sql, upserts them idempotently, and rebuilds the weekly
 * rollups for every week a change could have touched. The mapper is pure and
 * unit-tested; the I/O sits behind small injected seams (`MetricsDb`,
 * `fetchItems`) so tests run without a database or the network.
 */
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

/** Issue numbers a PR body closes ("closes #1", "Fixes owner/repo#2", "resolved: #3"). */
export function parseClosedIssues(body: string | null | undefined): number[] {
    if (!body) return [];
    const found = new Set<number>();
    const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/gi;
    for (let m = re.exec(body); m; m = re.exec(body)) {
        const n = Number(m[1]);
        if (Number.isSafeInteger(n) && n > 0) found.add(n);
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
            parentNumber: parseParentNumber(item.body),
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
export function weeksToRecompute(items: readonly MappedItem[], now: Date): string[] {
    let earliest: number | null = null;
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
}

export type FetchItems = (fullName: string, since: string | null) => Promise<GhItemPayload[]>;

export interface RepoSyncResult {
    fullName: string;
    issues: number;
    prs: number;
    weeks: number;
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
        WHERE gh_issues.updated_at IS DISTINCT FROM EXCLUDED.updated_at
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
        WHERE gh_prs.updated_at IS DISTINCT FROM EXCLUDED.updated_at
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
 * rebuild the touched weeks, then advance the cursor. The cursor is the time
 * the fetch *started*, and only moves after every write succeeded, so a
 * failed run is retried from the same point and an item updated mid-run is
 * seen again next time.
 */
export async function syncRepoMetrics(
    db: MetricsDb,
    repo: MetricsRepo,
    fetchItems: FetchItems,
    now: Date = new Date(),
): Promise<RepoSyncResult> {
    const state = (await db`SELECT last_synced_at FROM metrics_sync_state WHERE repo_id = ${repo.id}`) as Array<{ last_synced_at: unknown }>;
    const since = state[0] ? toIso(state[0].last_synced_at) : null;
    const startedAt = now.toISOString();

    const mapped = (await fetchItems(repo.full_name, since))
        .map(mapGithubItem)
        .filter((m): m is MappedItem => m !== null);
    const issues = mapped.flatMap((m) => (m.kind === 'issue' ? [m.row] : []));
    const prs = mapped.flatMap((m) => (m.kind === 'pr' ? [m.row] : []));

    await upsertIssues(db, repo.id, issues);
    await upsertPrs(db, repo.id, prs);

    const weeks = weeksToRecompute(mapped, now);
    if (weeks.length > 0) {
        const stored = await loadStored(db, repo.id);
        await upsertRollups(db, repo.id, weeks.map((w) => computeWeeklyRollup(stored.issues, stored.prs, w)));
    }

    await db`
        INSERT INTO metrics_sync_state (repo_id, last_synced_at) VALUES (${repo.id}, ${startedAt}::timestamptz)
        ON CONFLICT (repo_id) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at
    `;
    return { fullName: repo.full_name, issues: issues.length, prs: prs.length, weeks: weeks.length };
}

export interface MetricsSyncSummary {
    synced: RepoSyncResult[];
    failed: Array<{ fullName: string; error: string }>;
}

/** Sync every non-archived repo (owner decision 1 on #456); one repo's failure never stops the rest. */
export async function syncAllMetrics(
    db: MetricsDb,
    fetchItems: FetchItems,
    now: Date = new Date(),
): Promise<MetricsSyncSummary> {
    const repos = (await db`
        SELECT id, full_name FROM repos WHERE is_archived IS NOT TRUE ORDER BY full_name
    `) as unknown as MetricsRepo[];
    const summary: MetricsSyncSummary = { synced: [], failed: [] };
    for (const repo of repos) {
        try {
            summary.synced.push(await syncRepoMetrics(db, repo, fetchItems, now));
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            logger.warn(`[metrics-sync] ${repo.full_name} failed: ${error}`);
            summary.failed.push({ fullName: repo.full_name, error });
        }
    }
    return summary;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

/**
 * Real `fetchItems`: pages `GET /repos/{o}/{r}/issues?state=all&since=` with
 * `lib/github-cache.ts` ETags, so an unchanged page costs a 304 instead of
 * quota. A daily run is usually one request per repo.
 */
export function createGithubFetchItems(token: string): FetchItems {
    const octokit = createOctokitClient(token);
    return async (fullName, since) => {
        const [owner, repo] = fullName.split('/');
        if (!owner || !repo) throw new Error(`Invalid repo full name: ${fullName}`);
        const items: GhItemPayload[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const key = `metrics:${fullName}:${since ?? 'all'}:${page}`;
            const cached = githubCache.get(key);
            let data: GhItemPayload[];
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
                    throw err;
                }
            }
            items.push(...data);
            if (data.length < PAGE_SIZE) break;
        }
        return items;
    };
}
