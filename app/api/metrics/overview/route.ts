import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { ensureSchema, getNeonClient } from '@/lib/db';
import logger from '@/lib/log';
import { computeWeeklyRollup, type MetricsIssue, type MetricsPr, type WeeklyRollup } from '@/lib/metrics-rollup';
import { buildScorecard, recentWeeks, sumWeekly, type WeeklyScorecard } from '@/lib/metrics-scorecard';
import { getAccessibleRepoIds } from '@/lib/repo-access';

export interface RepoWeekly {
    id: string;
    name: string;
    full_name: string;
    /** This week's row. */
    current: WeeklyRollup;
    series: WeeklyRollup[];
}

export interface MetricsOverview {
    scorecard: WeeklyScorecard;
    /** Portfolio rows (summed over the selected repos), one per week, oldest first. */
    series: WeeklyRollup[];
    repos: RepoWeekly[];
    /** Every repo the viewer may filter on, whatever the current filter selects. */
    available: Array<{ full_name: string; name: string }>;
    weeks: string[];
    filters: { repos: string[]; label: string | null; authorType: string | null; weeks: number };
}

const DEFAULT_WEEKS = 12;
const MAX_WEEKS = 52;
const MIN_WEEKS = 5; // the scorecard compares against the 4 weeks before this one
const AUTHOR_TYPES = ['human', 'imp', 'bot'];

/** Rows from a weekly_rollups query, as WeeklyRollup. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toRollup = (r: any): WeeklyRollup => ({
    isoWeek: r.iso_week,
    issuesOpened: Number(r.issues_opened), issuesClosed: Number(r.issues_closed), leafClosed: Number(r.leaf_closed),
    scopeEnd: Number(r.scope_end), prsOpened: Number(r.prs_opened), prsMerged: Number(r.prs_merged),
    bugsOpened: Number(r.bugs_opened), bugsClosed: Number(r.bugs_closed),
    impPrsOpened: Number(r.imp_prs_opened), impPrsMerged: Number(r.imp_prs_merged),
    leadTimeP50Hours: r.lead_time_p50_hours === null ? null : Number(r.lead_time_p50_hours),
    leadTimeP90Hours: r.lead_time_p90_hours === null ? null : Number(r.lead_time_p90_hours),
});

export async function GET(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const weeksParam = Number(params.get('weeks') ?? DEFAULT_WEEKS);
    if (!Number.isInteger(weeksParam) || weeksParam < 1 || weeksParam > MAX_WEEKS) {
        return NextResponse.json({ error: `weeks must be an integer from 1 to ${MAX_WEEKS}` }, { status: 400 });
    }
    const authorType = params.get('authorType');
    if (authorType !== null && !AUTHOR_TYPES.includes(authorType)) {
        return NextResponse.json({ error: 'authorType must be human, imp or bot' }, { status: 400 });
    }
    const label = params.get('label') || null;
    const wanted = (params.get('repos') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

    try {
        const db = getNeonClient();
        await ensureSchema(db);

        // Same access rule as /api/pmo/overview (CWE-639): the portfolio view never
        // includes a repo the viewer could not open, whatever the filter asks for.
        const accessibleIds = await getAccessibleRepoIds(db, session.userId);
        const allRepos = ((await db`
            SELECT id, name, full_name FROM repos
            WHERE (is_hidden = false OR is_hidden IS NULL) AND is_archived IS NOT TRUE
            ORDER BY full_name
        `) as Array<{ id: string; name: string; full_name: string }>).filter((r) => accessibleIds.has(r.id));
        const repos = wanted.length > 0 ? allRepos.filter((r) => wanted.includes(String(r.full_name).toLowerCase())) : allRepos;
        const ids = repos.map((r) => r.id);

        const shown = recentWeeks(new Date(), Math.max(weeksParam, MIN_WEEKS)).slice(-weeksParam);
        const queryWeeks = recentWeeks(new Date(), Math.max(weeksParam, MIN_WEEKS));
        const byRepo = new Map<string, WeeklyRollup[]>(ids.map((id) => [id, []]));
        const seed = new Map<string, number>();

        if (ids.length > 0 && !label && !authorType) {
            const [rows, before] = await db.transaction([
                db`SELECT * FROM weekly_rollups WHERE repo_id = ANY(${ids}) AND iso_week = ANY(${queryWeeks})`,
                db`SELECT DISTINCT ON (repo_id) repo_id, scope_end FROM weekly_rollups
                   WHERE repo_id = ANY(${ids}) AND iso_week < ${queryWeeks[0]} ORDER BY repo_id, iso_week DESC`,
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const r of rows as any[]) byRepo.get(r.repo_id)?.push(toRollup(r));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const r of before as any[]) seed.set(r.repo_id, Number(r.scope_end));
        } else if (ids.length > 0) {
            // A label or author-type slice is not pre-aggregated, so roll up the stored rows for it.
            const [issueRows, prRows] = await db.transaction([
                db`SELECT repo_id, number, state, state_reason, labels, author_type, parent_number, opened_at, closed_at FROM gh_issues WHERE repo_id = ANY(${ids})`,
                db`SELECT repo_id, number, state, labels, author_type, opened_at, merged_at, closed_at FROM gh_prs WHERE repo_id = ANY(${ids})`,
            ]);
            const keep = (labels: string[], type: string) => (!label || labels.includes(label)) && (!authorType || type === authorType);
            const iso = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
            for (const id of ids) {
                const issues: MetricsIssue[] = [];
                const prs: MetricsPr[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const r of issueRows as any[]) {
                    if (r.repo_id !== id || !keep(r.labels ?? [], r.author_type)) continue;
                    issues.push({
                        number: r.number, state: r.state, stateReason: r.state_reason, labels: r.labels ?? [], authorType: r.author_type,
                        parentNumber: r.parent_number, openedAt: iso(r.opened_at) as string, closedAt: iso(r.closed_at),
                    });
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const r of prRows as any[]) {
                    if (r.repo_id !== id || !keep(r.labels ?? [], r.author_type)) continue;
                    prs.push({
                        number: r.number, state: r.state, labels: r.labels ?? [], authorType: r.author_type,
                        openedAt: iso(r.opened_at) as string, mergedAt: iso(r.merged_at), closedAt: iso(r.closed_at),
                    });
                }
                byRepo.set(id, queryWeeks.map((w) => computeWeeklyRollup(issues, prs, w)));
            }
        }

        const perRepoRows = ids.map((id) => byRepo.get(id) ?? []);
        const fullSeries = sumWeekly(perRepoRows, queryWeeks, ids.map((id) => seed.get(id) ?? 0));
        const scorecard = buildScorecard(fullSeries, new Date());
        const repoSummaries: RepoWeekly[] = repos.map((r, i) => {
            const series = sumWeekly([perRepoRows[i]], queryWeeks, [seed.get(r.id) ?? 0]).slice(-weeksParam);
            return { id: r.id, name: r.name, full_name: r.full_name, current: series[series.length - 1], series };
        });

        const body: MetricsOverview = {
            scorecard,
            series: fullSeries.slice(-weeksParam),
            repos: repoSummaries,
            available: allRepos.map((r) => ({ full_name: r.full_name, name: r.name })),
            weeks: shown,
            filters: { repos: wanted, label, authorType, weeks: weeksParam },
        };
        return NextResponse.json(body);
    } catch (error: unknown) {
        logger.warn('Error fetching metrics overview:', error);
        return NextResponse.json({ error: 'Failed to fetch metrics overview' }, { status: 500 });
    }
}
