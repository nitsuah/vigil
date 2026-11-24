/** Reads weekly rollups for a set of repos (shared by /api/metrics/overview and /api/context). */
import type { getNeonClient } from '@/lib/db';
import type { WeeklyRollup } from '@/lib/metrics-rollup';
import { buildScorecard, recentWeeks, sumWeekly, type WeeklyScorecard } from '@/lib/metrics-scorecard';

type Db = ReturnType<typeof getNeonClient>;

/** A weekly_rollups row, as WeeklyRollup (NUMERIC columns arrive as strings). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toRollup = (r: any): WeeklyRollup => ({
    isoWeek: r.iso_week,
    issuesOpened: Number(r.issues_opened), issuesClosed: Number(r.issues_closed), leafClosed: Number(r.leaf_closed),
    scopeEnd: Number(r.scope_end), prsOpened: Number(r.prs_opened), prsMerged: Number(r.prs_merged),
    bugsOpened: Number(r.bugs_opened), bugsClosed: Number(r.bugs_closed),
    impPrsOpened: Number(r.imp_prs_opened), impPrsMerged: Number(r.imp_prs_merged),
    leadTimeP50Hours: r.lead_time_p50_hours === null ? null : Number(r.lead_time_p50_hours),
    leadTimeP90Hours: r.lead_time_p90_hours === null ? null : Number(r.lead_time_p90_hours),
});

/** Stored rollups per repo within `weeks`, plus each repo's last scope before the window (for carry-forward). */
export async function loadWeeklyRollups(
    db: Db,
    ids: string[],
    weeks: string[],
): Promise<{ byRepo: Map<string, WeeklyRollup[]>; seed: Map<string, number> }> {
    const byRepo = new Map<string, WeeklyRollup[]>(ids.map((id) => [id, []]));
    const seed = new Map<string, number>();
    if (ids.length === 0) return { byRepo, seed };
    const [rows, before] = await db.transaction([
        db`SELECT * FROM weekly_rollups WHERE repo_id = ANY(${ids}) AND iso_week = ANY(${weeks})`,
        db`SELECT DISTINCT ON (repo_id) repo_id, scope_end FROM weekly_rollups
           WHERE repo_id = ANY(${ids}) AND iso_week < ${weeks[0]} ORDER BY repo_id, iso_week DESC`,
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of rows as any[]) byRepo.get(r.repo_id)?.push(toRollup(r));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of before as any[]) seed.set(r.repo_id, Number(r.scope_end));
    return { byRepo, seed };
}

/** The portfolio scorecard for `ids` (this week against the previous 4). */
export async function portfolioScorecard(db: Db, ids: string[], now: Date = new Date()): Promise<WeeklyScorecard> {
    const weeks = recentWeeks(now, 5);
    const { byRepo, seed } = await loadWeeklyRollups(db, ids, weeks);
    const series = sumWeekly(ids.map((id) => byRepo.get(id) ?? []), weeks, ids.map((id) => seed.get(id) ?? 0));
    return buildScorecard(series, now);
}
