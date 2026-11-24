/**
 * Delivery-metrics rollup (vigil#456): pure helpers that turn one repo's
 * issues and PRs into a weekly flow row. No I/O, so they are unit-tested in
 * lib/metrics-rollup.test.ts. Weeks are ISO weeks in UTC (Monday 00:00 to the
 * next Monday, end exclusive).
 */

export type AuthorType = 'human' | 'imp' | 'bot';

export interface MetricsIssue {
    number: number;
    state: 'open' | 'closed';
    /** GitHub state_reason; 'not_planned' closures are not progress. */
    stateReason: string | null;
    labels: string[];
    authorType: AuthorType;
    /** Parent issue number in the same repo (a split issue), or null. */
    parentNumber: number | null;
    openedAt: string;
    closedAt: string | null;
}

export interface MetricsPr {
    number: number;
    state: 'open' | 'closed' | 'merged';
    labels: string[];
    authorType: AuthorType;
    openedAt: string;
    mergedAt: string | null;
    closedAt: string | null;
}

export interface WeeklyRollup {
    isoWeek: string;
    issuesOpened: number;
    issuesClosed: number;
    leafClosed: number;
    scopeEnd: number;
    prsOpened: number;
    prsMerged: number;
    bugsOpened: number;
    bugsClosed: number;
    impPrsOpened: number;
    impPrsMerged: number;
    leadTimeP50Hours: number | null;
    leadTimeP90Hours: number | null;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** imp label wins over bot; anything else is human. */
export function classifyAuthor(
    login: string,
    githubType: string | null | undefined,
    labels: readonly string[],
): AuthorType {
    if (labels.some((l) => l === 'imp' || l.startsWith('imp:'))) return 'imp';
    if (githubType === 'Bot' || login.endsWith('[bot]') || labels.includes('bot:journey')) return 'bot';
    return 'human';
}

/** Parent issue number from "split from #12", "child of #12", "child of owner/repo#12" or "parent: #12". */
export function parseParentNumber(body: string | null | undefined): number | null {
    if (!body) return null;
    const m = /(?:split from|child of|parent:?)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/i.exec(body);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** ISO week label such as '2026-W47' for a date, in UTC. */
export function isoWeekOf(date: Date | string): string {
    const d = new Date(date);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
    const year = thursday.getUTCFullYear();
    const dayOfYear = Math.round((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS);
    const week = Math.floor(dayOfYear / 7) + 1;
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Start (Monday 00:00 UTC) and exclusive end of an ISO week label. */
export function isoWeekRange(isoWeek: string): { start: Date; end: Date } {
    const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
    if (!m) throw new Error(`Invalid ISO week: ${isoWeek}`);
    const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
    const week1Monday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * DAY_MS;
    const start = new Date(week1Monday + (Number(m[2]) - 1) * 7 * DAY_MS);
    // Reject labels that do not exist (W00, W53 in a 52-week year): the label must round-trip.
    if (isoWeekOf(start) !== isoWeek) throw new Error(`Invalid ISO week: ${isoWeek}`);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** Nearest-rank percentile of an unsorted list; null when empty. */
function percentile(values: number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

/** One repo's flow numbers for one ISO week. */
export function computeWeeklyRollup(
    issues: readonly MetricsIssue[],
    prs: readonly MetricsPr[],
    isoWeek: string,
): WeeklyRollup {
    const { start, end } = isoWeekRange(isoWeek);
    const inWeek = (iso: string | null) => {
        if (!iso) return false;
        const t = new Date(iso).getTime();
        return t >= start.getTime() && t < end.getTime();
    };
    const parents = new Set(issues.map((i) => i.parentNumber).filter((n): n is number => n !== null));
    const progress = (i: MetricsIssue) => i.state === 'closed' && i.stateReason !== 'not_planned' && inWeek(i.closedAt);
    const isBug = (labels: readonly string[]) => labels.includes('bug');

    const closed = issues.filter(progress);
    const scopeEnd = issues.filter((i) => {
        if (parents.has(i.number)) return false;
        if (new Date(i.openedAt).getTime() >= end.getTime()) return false;
        return !i.closedAt || new Date(i.closedAt).getTime() >= end.getTime();
    });
    const mergedPrs = prs.filter((p) => inWeek(p.mergedAt));
    const leadTimes = mergedPrs.map((p) => (new Date(p.mergedAt as string).getTime() - new Date(p.openedAt).getTime()) / HOUR_MS);

    return {
        isoWeek,
        issuesOpened: issues.filter((i) => inWeek(i.openedAt)).length,
        issuesClosed: closed.length,
        leafClosed: closed.filter((i) => !parents.has(i.number)).length,
        scopeEnd: scopeEnd.length,
        prsOpened: prs.filter((p) => inWeek(p.openedAt)).length,
        prsMerged: mergedPrs.length,
        bugsOpened: issues.filter((i) => inWeek(i.openedAt) && isBug(i.labels)).length,
        bugsClosed: closed.filter((i) => isBug(i.labels)).length,
        impPrsOpened: prs.filter((p) => p.authorType === 'imp' && inWeek(p.openedAt)).length,
        impPrsMerged: mergedPrs.filter((p) => p.authorType === 'imp').length,
        leadTimeP50Hours: round2(percentile(leadTimes, 0.5)),
        leadTimeP90Hours: round2(percentile(leadTimes, 0.9)),
    };
}