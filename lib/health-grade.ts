// The one health-grade scale — used by the dashboard (via lib/dashboard-utils),
// /api/mcp and /api/context. Keep every letter grade going through healthGrade()
// so the UI and agents can never disagree about what a score means.

export interface HealthRow {
  health_score?: number | null;
  ci_status?: string | null;
}

export const HEALTH_GRADES = ['A+', 'A', 'B', 'C', 'D', 'F'] as const;
export type HealthGradeLetter = (typeof HEALTH_GRADES)[number];

export function healthGrade(score: number): HealthGradeLetter {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function buildGradeDist(rows: HealthRow[]): Record<string, number> {
  const d = Object.fromEntries(HEALTH_GRADES.map((g) => [g, 0])) as Record<HealthGradeLetter, number>;
  rows.forEach(r => { d[healthGrade(r.health_score ?? 0)]++; });
  return d;
}

export function buildCiDist(rows: HealthRow[]): { passing: number; failing: number; unknown: number } {
  const d = { passing: 0, failing: 0, unknown: 0 };
  rows.forEach(r => {
    if (r.ci_status === 'passing')                       d.passing++;
    else if (r.ci_status && r.ci_status !== 'unknown')   d.failing++;
    else                                                  d.unknown++;
  });
  return d;
}
