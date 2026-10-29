export type IssueCategory = 'vulnerability' | 'bug' | 'feedback' | 'other';

/** Lower-cased label names that put an issue in a category. */
export type LabelMap = Record<Exclude<IssueCategory, 'other'>, string[]>;

export const DEFAULT_LABEL_MAP: LabelMap = {
  vulnerability: ['security', 'vulnerability', 'vulnerabilities', 'security vulnerability'],
  bug: ['bug', 'defect', 'type: bug', 'kind/bug'],
  feedback: ['enhancement', 'feature', 'feature request', 'feature-request', 'feedback', 'request', 'type: feature', 'kind/feature'],
};

/** An issue is counted once, in the first category it matches: vulnerability, then bug, then feedback. */
const PRECEDENCE: Array<Exclude<IssueCategory, 'other'>> = ['vulnerability', 'bug', 'feedback'];

export function categorizeIssue(labels: string[], map: LabelMap = DEFAULT_LABEL_MAP): IssueCategory {
  const names = new Set(labels.map((l) => l.trim().toLowerCase()));
  for (const category of PRECEDENCE) {
    if (map[category].some((l) => names.has(l))) return category;
  }
  return 'other';
}

export interface IssueCategoryCounts {
  total: number;
  vulnerability: number;
  bug: number;
  feedback: number;
  other: number;
}

/** Counts open issues by category. Pull requests are never issues here; the total is the sum of the categories. */
export function countIssuesByCategory(
  issues: Array<{ labels: string[]; isPullRequest?: boolean }>,
  map: LabelMap = DEFAULT_LABEL_MAP,
): IssueCategoryCounts {
  const counts: IssueCategoryCounts = { total: 0, vulnerability: 0, bug: 0, feedback: 0, other: 0 };
  for (const issue of issues) {
    if (issue.isPullRequest) continue;
    counts[categorizeIssue(issue.labels, map)] += 1;
    counts.total += 1;
  }
  return counts;
}