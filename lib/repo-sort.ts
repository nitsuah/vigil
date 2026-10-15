// Pure comparator for repository sorting.
// Extracted from useRepoFilters so it can be unit-tested in isolation.

import type { Repo } from '@/types/repo';
import { REPO_TIER_IDS } from './repo-tier';

export type SortField = 'name' | 'health' | 'stars' | 'updated' | 'language' | 'tier';
export type SortDirection = 'asc' | 'desc';

/** Map tier to its sort rank: T1=0, T2=1, T3=2, T4=3, null/untiered=4 (always last). */
function tierRank(tier: string | null | undefined): number {
  if (!tier) return 4;
  const idx = REPO_TIER_IDS.indexOf(tier as typeof REPO_TIER_IDS[number]);
  return idx >= 0 ? idx : 4;
}

/** Compare two values, returning -1, 0, or 1. */
function cmp(a: string | number | Date, b: string | number | Date): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function compareRepos(
  a: Repo,
  b: Repo,
  field: SortField,
  direction: SortDirection
): number {
  let aVal: string | number | Date;
  let bVal: string | number | Date;

  switch (field) {
    case 'name':
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
      break;
    case 'health':
      aVal = a.health_score ?? 0;
      bVal = b.health_score ?? 0;
      break;
    case 'stars':
      aVal = a.stars ?? 0;
      bVal = b.stars ?? 0;
      break;
    case 'updated':
      aVal = a.last_commit_date ? new Date(a.last_commit_date).getTime() : 0;
      bVal = b.last_commit_date ? new Date(b.last_commit_date).getTime() : 0;
      break;
    case 'language':
      aVal = a.language ?? '';
      bVal = b.language ?? '';
      break;
    case 'tier': {
      const aRank = tierRank(a.tier);
      const bRank = tierRank(b.tier);
      const rankCmp = cmp(aRank, bRank);
      if (rankCmp !== 0) return direction === 'asc' ? rankCmp : -rankCmp;
      // Tie-break by name (A→Z) for stable ordering
      return cmp(a.name.toLowerCase(), b.name.toLowerCase());
    }
    default:
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
  }

  const base = cmp(aVal, bVal);
  return direction === 'asc' ? base : -base;
}