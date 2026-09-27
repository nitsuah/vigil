import { RepoType, detectRepoType } from '@/lib/repo-type';
import type { RepoMetadata } from '@/lib/github';
import { DEFAULT_REPOS } from '@/lib/default-repos';

/** Shared fork-filter contract used by the dashboard hook and the sync route. */
export type ForkFilter = 'all' | 'no-forks' | 'forks-only';

export interface SyncFilters {
  filterType?: RepoType | 'all';
  filterLanguage?: string;
  filterFork?: ForkFilter;
}

export interface DbRepoState {
  full_name: string;
  is_hidden?: boolean;
  is_archived?: boolean;
  repo_type?: string | null;
}

/**
 * Reduce the full GitHub repo list to the set currently displayed on the
 * dashboard: applies the same type/language/fork filters as useRepoFilters,
 * and always drops hidden and archived repos.
 */
export function filterReposForSync(
  repos: RepoMetadata[],
  filters: SyncFilters,
  dbRepoMap: Map<string, DbRepoState>
): RepoMetadata[] {
  return repos.filter((repo) => {
    const dbRepo = dbRepoMap.get(repo.fullName);
    if (dbRepo?.is_hidden) return false;
    if (repo.archived || dbRepo?.is_archived) return false;

    const type =
      (dbRepo?.repo_type as RepoType | null) ||
      detectRepoType(repo.name, repo.description, repo.language, repo.topics).type;
    if (filters.filterType && filters.filterType !== 'all' && type !== filters.filterType) return false;
    if (filters.filterLanguage && filters.filterLanguage !== 'all' && repo.language !== filters.filterLanguage) return false;
    if (filters.filterFork === 'no-forks' && repo.isFork) return false;
    if (filters.filterFork === 'forks-only' && !repo.isFork) return false;
    return true;
  });
}
/**
 * Default repos that still need their own sync pass: the ones not already in
 * the user's list (compared case-insensitively on owner/repo). A default repo
 * the user owns is synced once, with the user's list, not twice.
 */
type DefaultRepo = (typeof DEFAULT_REPOS)[number];

export function defaultReposNotIn(
    reposToSync: Array<{ fullName: string }>,
    defaults: readonly DefaultRepo[] = DEFAULT_REPOS,
): DefaultRepo[] {
    const have = new Set(reposToSync.map((r) => r.fullName.toLowerCase()));
    return defaults.filter((d) => !have.has(d.fullName.toLowerCase()));
}
