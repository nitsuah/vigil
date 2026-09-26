import { describe, it, expect } from 'vitest';
import { defaultReposNotIn, filterReposForSync, SyncFilters } from '@/lib/sync-filters';
import type { RepoMetadata } from '@/lib/github';

function repo(overrides: Partial<RepoMetadata> & { name: string }): RepoMetadata {
  return {
    fullName: `owner/${overrides.name}`,
    description: null,
    language: null,
    stars: 0,
    forks: 0,
    openIssues: 0,
    defaultBranch: 'main',
    url: `https://github.com/owner/${overrides.name}`,
    homepage: null,
    topics: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    pushedAt: '2024-01-01T00:00:00Z',
    isFork: false,
    archived: false,
    isPrivate: false,
    ...overrides,
  };
}

const repos: RepoMetadata[] = [
  repo({ name: 'web-app', language: 'TypeScript', topics: ['nextjs'] }),
  repo({ name: 'game', language: 'JavaScript', topics: ['game'] }),
  repo({ name: 'tool', language: 'Python', topics: ['cli'] }),
  repo({ name: 'forked', language: 'TypeScript', isFork: true }),
  repo({ name: 'archived-repo', language: 'Go', archived: true }),
];

describe('filterReposForSync', () => {
  it('returns all non-hidden, non-archived repos when no filters', () => {
    const result = filterReposForSync(repos, {}, new Map());
    expect(result.map((r) => r.name)).toEqual(['web-app', 'game', 'tool', 'forked']);
  });

  it('filters by type', () => {
    const result = filterReposForSync(repos, { filterType: 'game' }, new Map());
    expect(result.map((r) => r.name)).toEqual(['game']);
  });

  it('filters by language', () => {
    const result = filterReposForSync(repos, { filterLanguage: 'TypeScript' }, new Map());
    expect(result.map((r) => r.name)).toEqual(['web-app', 'forked']);
  });

  it('filters out forks with no-forks', () => {
    const result = filterReposForSync(repos, { filterFork: 'no-forks' }, new Map());
    expect(result.map((r) => r.name)).toEqual(['web-app', 'game', 'tool']);
  });

  it('keeps only forks with forks-only', () => {
    const result = filterReposForSync(repos, { filterFork: 'forks-only' }, new Map());
    expect(result.map((r) => r.name)).toEqual(['forked']);
  });

  it('drops repos hidden in the DB', () => {
    const dbMap = new Map([['owner/web-app', { full_name: 'owner/web-app', is_hidden: true }]]);
    const result = filterReposForSync(repos, {}, dbMap);
    expect(result.map((r) => r.name)).not.toContain('web-app');
  });

  it('drops repos archived in the DB even if GitHub says not archived', () => {
    const dbMap = new Map([['owner/tool', { full_name: 'owner/tool', is_archived: true }]]);
    const result = filterReposForSync(repos, {}, dbMap);
    expect(result.map((r) => r.name)).not.toContain('tool');
  });

  it('uses DB repo_type when present', () => {
    const dbMap = new Map([['owner/web-app', { full_name: 'owner/web-app', repo_type: 'library' }]]);
    const result = filterReposForSync(repos, { filterType: 'library' }, dbMap);
    expect(result.map((r) => r.name)).toEqual(['web-app']);
  });

  it('does not share state between repos with the same short name', () => {
    const reposWithCollision = [
      repo({ name: 'shared', language: 'TypeScript' }),
      { ...repo({ name: 'shared', language: 'Python' }), fullName: 'other-owner/shared' },
    ];
    const dbMap = new Map([['other-owner/shared', { full_name: 'other-owner/shared', is_hidden: true }]]);
    const result = filterReposForSync(reposWithCollision, {}, dbMap);
    // Only the hidden one (other-owner/shared) is dropped; owner/shared stays.
    expect(result.map((r) => r.fullName)).toEqual(['owner/shared']);
  });

  it('combines filters', () => {
    const result = filterReposForSync(
      repos,
      { filterType: 'web-app', filterLanguage: 'TypeScript', filterFork: 'no-forks' },
      new Map()
    );
    expect(result.map((r) => r.name)).toEqual(['web-app']);
  });
});
describe('defaultReposNotIn', () => {
    const DEFAULTS = [
        { owner: 'nitsuah', name: 'vigil', fullName: 'nitsuah/vigil' },
        { owner: 'Nitsuah-Labs', name: 'nitsuah-io', fullName: 'Nitsuah-Labs/nitsuah-io' },
    ];

    it('drops defaults the user already syncs, case-insensitively (regression: 13 counted, 11 synced)', () => {
        const mine = [{ fullName: 'nitsuah/vigil' }, { fullName: 'nitsuah-labs/NITSUAH-IO' }, { fullName: 'nitsuah/fire' }];
        expect(defaultReposNotIn(mine, DEFAULTS)).toEqual([]);
    });

    it('keeps defaults for a user who does not own them', () => {
        expect(defaultReposNotIn([{ fullName: 'someone/else' }], DEFAULTS)).toEqual(DEFAULTS);
    });
});
