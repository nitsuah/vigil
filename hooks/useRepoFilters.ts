// Custom hooks for repository filtering

import { useState, useMemo } from 'react';
import { Repo } from '@/types/repo';
import { RepoType, detectRepoType } from '@/lib/repo-type';
import { ForkFilter } from '@/lib/sync-filters';
import { TierFilter, matchesTierFilter } from '@/lib/repo-tier';
import { compareRepos, type SortField, type SortDirection } from '@/lib/repo-sort';

export function useRepoFilters(repos: Repo[]) {
  const [filterType, setFilterType] = useState<RepoType | 'all'>('all');
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [filterFork, setFilterFork] = useState<ForkFilter>('all');
  const [filterTier, setFilterTier] = useState<TierFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const languages = useMemo(() => {
    return Array.from(new Set(repos.map((r) => r.language).filter(Boolean))) as string[];
  }, [repos]);

  const filteredRepos = useMemo(() => {
    const filtered = repos.filter((repo) => {
      const type =
        (repo.repo_type as RepoType) ||
        detectRepoType(repo.name, repo.description, repo.language, repo.topics).type;
      if (filterType !== 'all' && type !== filterType) return false;
      if (filterLanguage !== 'all' && repo.language !== filterLanguage) return false;
      if (filterFork === 'no-forks' && repo.is_fork) return false;
      if (filterFork === 'forks-only' && !repo.is_fork) return false;
      if (!matchesTierFilter(repo.tier, filterTier)) return false;
      return true;
    });

    // Sort the filtered results using the pure comparator
    return filtered.sort((a, b) => compareRepos(a, b, sortField, sortDirection));
  }, [repos, filterType, filterLanguage, filterFork, filterTier, sortField, sortDirection]);

  const clearFilters = () => {
    setFilterType('all');
    setFilterLanguage('all');
    setFilterFork('all');
    setFilterTier('all');
    setSortField('name');
    setSortDirection('asc');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const setSort = (field: SortField, direction: SortDirection) => {
    setSortField(field);
    setSortDirection(direction);
  };

  return {
    filterType,
    setFilterType,
    filterLanguage,
    setFilterLanguage,
    filterFork,
    setFilterFork,
    filterTier,
    setFilterTier,
    sortField,
    sortDirection,
    handleSort,
    setSort,
    languages,
    filteredRepos,
    clearFilters,
  };
}
