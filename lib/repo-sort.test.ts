import { describe, it, expect } from 'vitest';
import { compareRepos, type SortField, type SortDirection } from './repo-sort';
import type { Repo } from '@/types/repo';

const makeRepo = (overrides: Partial<Repo> = {}): Repo => ({
  id: 'repo-1',
  name: 'demo-repo',
  full_name: 'acme/demo-repo',
  description: 'A demo repo',
  language: 'TypeScript',
  stars: 10,
  forks: 1,
  open_issues: 0,
  open_prs: 0,
  branches_count: 2,
  url: 'https://github.com/acme/demo-repo',
  homepage: null,
  topics: [],
  is_fork: false,
  is_hidden: false,
  repo_type: 'web-app',
  health_score: 91,
  total_loc: 12345,
  loc_language_breakdown: { TypeScript: 12345 },
  contributor_count: 2,
  bus_factor: 1,
  commit_frequency: 12.5,
  avg_pr_merge_time_hours: 21.7,
  token_density: 8.25,
  comment_to_code_ratio: 0.18,
  coverage_score: 83.34,
  ci_status: 'passing',
  last_commit_date: '2026-09-01T00:00:00Z',
  last_synced: '2026-09-01T00:00:00Z',
  ...overrides,
});

describe('compareRepos', () => {
  const tieredRepos = [
    makeRepo({ id: 'repo-1', name: 'a-repo', tier: 'T2', health_score: 90 }),
    makeRepo({ id: 'repo-2', name: 'b-repo', tier: 'T1', health_score: 80 }),
    makeRepo({ id: 'repo-3', name: 'c-repo', tier: 'T3', health_score: 70 }),
    makeRepo({ id: 'repo-4', name: 'd-repo', tier: 'T4', health_score: 60 }),
    makeRepo({ id: 'repo-5', name: 'e-repo', tier: null, health_score: 50 }),
    makeRepo({ id: 'repo-6', name: 'f-repo', tier: 'T2', health_score: 40 }),
  ];

  describe('tier sorting', () => {
    it('sorts by tier ascending: T1 → T2 → T3 → T4 → untiered', () => {
      const sorted = [...tieredRepos].sort((a, b) => compareRepos(a, b, 'tier', 'asc'));
      expect(sorted.map((r) => r.tier ?? 'untiered')).toEqual(['T1', 'T2', 'T2', 'T3', 'T4', 'untiered'] as const);
    });

    it('sorts by tier descending: T4 → T3 → T2 → T1, untiered still last', () => {
      const sorted = [...tieredRepos].sort((a, b) => compareRepos(a, b, 'tier', 'desc'));
      expect(sorted.map((r) => r.tier ?? 'untiered')).toEqual(['T4', 'T3', 'T2', 'T2', 'T1', 'untiered']);
    });

    it('untiered (null) repos always sort last in ascending order', () => {
      const withUntiered = [
        makeRepo({ id: 'repo-1', name: 'a', tier: null }),
        makeRepo({ id: 'repo-2', name: 'b', tier: 'T4' }),
        makeRepo({ id: 'repo-3', name: 'c', tier: 'T1' }),
      ];
      const sorted = withUntiered.sort((a, b) => compareRepos(a, b, 'tier', 'asc'));
      expect(sorted.map((r) => r.tier ?? 'untiered')).toEqual(['T1', 'T4', 'untiered'] as const);
    });

    it('untiered (null) repos always sort last in descending order', () => {
      const withUntiered = [
        makeRepo({ id: 'repo-1', name: 'a', tier: null }),
        makeRepo({ id: 'repo-2', name: 'b', tier: 'T4' }),
        makeRepo({ id: 'repo-3', name: 'c', tier: 'T1' }),
      ];
      const sorted = withUntiered.sort((a, b) => compareRepos(a, b, 'tier', 'desc'));
      expect(sorted.map((r) => r.tier ?? 'untiered')).toEqual(['T4', 'T1', 'untiered'] as const);
    });

    it('breaks ties by name (A→Z) for stable ordering', () => {
      const sameTier = [
        makeRepo({ id: 'repo-1', name: 'zebra', tier: 'T2' }),
        makeRepo({ id: 'repo-2', name: 'alpha', tier: 'T2' }),
        makeRepo({ id: 'repo-3', name: 'beta', tier: 'T2' }),
      ];
      const sorted = sameTier.sort((a, b) => compareRepos(a, b, 'tier', 'asc'));
      expect(sorted.map((r) => r.name)).toEqual(['alpha', 'beta', 'zebra'] as const);
    });
  });

  describe('existing fields still sort as before', () => {
    const testRepos = [
      makeRepo({ id: 'repo-1', name: 'zebra', health_score: 90, stars: 100, language: 'TypeScript', last_commit_date: '2026-01-01T00:00:00Z' }),
      makeRepo({ id: 'repo-2', name: 'alpha', health_score: 80, stars: 50, language: 'Python', last_commit_date: '2026-02-01T00:00:00Z' }),
      makeRepo({ id: 'repo-3', name: 'beta', health_score: 70, stars: 200, language: 'Go', last_commit_date: '2026-03-01T00:00:00Z' }),
    ];

    it('sorts by name ascending A→Z', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'name', 'asc'));
      expect(sorted.map((r) => r.name)).toEqual(['alpha', 'beta', 'zebra']);
    });

    it('sorts by name descending Z→A', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'name', 'desc'));
      expect(sorted.map((r) => r.name)).toEqual(['zebra', 'beta', 'alpha']);
    });

    it('sorts by health ascending (low to high)', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'health', 'asc'));
      expect(sorted.map((r) => r.health_score)).toEqual([70, 80, 90]);
    });

    it('sorts by health descending (high to low)', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'health', 'desc'));
      expect(sorted.map((r) => r.health_score)).toEqual([90, 80, 70]);
    });

    it('sorts by stars ascending', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'stars', 'asc'));
      expect(sorted.map((r) => r.stars)).toEqual([50, 100, 200]);
    });

    it('sorts by stars descending', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'stars', 'desc'));
      expect(sorted.map((r) => r.stars)).toEqual([200, 100, 50]);
    });

    it('sorts by language ascending A→Z', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'language', 'asc'));
      expect(sorted.map((r) => r.language)).toEqual(['Go', 'Python', 'TypeScript']);
    });

    it('sorts by language descending Z→A', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'language', 'desc'));
      expect(sorted.map((r) => r.language)).toEqual(['TypeScript', 'Python', 'Go']);
    });

    it('sorts by updated ascending (oldest first)', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'updated', 'asc'));
      expect(sorted.map((r) => r.last_commit_date)).toEqual([
        '2026-01-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
        '2026-03-01T00:00:00Z',
      ]);
    });

    it('sorts by updated descending (newest first)', () => {
      const sorted = [...testRepos].sort((a, b) => compareRepos(a, b, 'updated', 'desc'));
      expect(sorted.map((r) => r.last_commit_date)).toEqual([
        '2026-03-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
        '2026-01-01T00:00:00Z',
      ]);
    });
  });
});