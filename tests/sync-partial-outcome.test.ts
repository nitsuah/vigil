import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkBestPractices: vi.fn(),
  checkCommunityStandards: vi.fn(),
  calculateHealthScore: vi.fn(),
}));

vi.mock('../lib/db', () => ({ ensureSchema: vi.fn(async () => undefined), getNeonClient: vi.fn() }));
vi.mock('../lib/best-practices', () => ({ checkBestPractices: mocks.checkBestPractices }));
vi.mock('../lib/community-standards', () => ({ checkCommunityStandards: mocks.checkCommunityStandards }));
vi.mock('../lib/health-score', () => ({ calculateHealthScore: mocks.calculateHealthScore }));
vi.mock('../lib/health-score-inputs', () => ({ buildHealthScoreInputs: vi.fn(() => ({})) }));
vi.mock('../lib/log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { syncRepo } from '../lib/sync';
import type { GitHubClient, RepoMetadata } from '../lib/github';

// Every GitHub call resolves to an empty result; every DB tagged-template
// query resolves to no rows. Nothing here touches the network or a database.
function fakeGithub(): GitHubClient {
  const handler: ProxyHandler<object> = {
    get: (_t, prop) => {
      if (prop === 'getOctokit') return () => ({});
      if (prop === 'getFileContent') return async () => null;
      if (prop === 'getRepoFileList') return async () => [];
      return async () => [];
    },
  };
  return new Proxy({}, handler) as unknown as GitHubClient;
}

function fakeDb() {
  const db = vi.fn(async () => [{ id: 1 }]);
  return db as unknown as Parameters<typeof syncRepo>[2];
}

const repo = {
  id: 1,
  name: 'demo',
  fullName: 'octo/demo',
  pushedAt: new Date().toISOString(),
} as unknown as RepoMetadata;

describe('syncRepo partial outcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkBestPractices.mockResolvedValue({ practices: [] });
    mocks.checkCommunityStandards.mockReturnValue({ standards: [] });
    mocks.calculateHealthScore.mockReturnValue({ total: 80 });
  });

  it('reports no partial steps when every step succeeds', async () => {
    await expect(syncRepo(repo, fakeGithub(), fakeDb())).resolves.toEqual({ partialSteps: 0 });
  });

  it('marks a best-practices failure as partial without throwing', async () => {
    mocks.checkBestPractices.mockRejectedValue(new Error('boom secret-token'));
    const result = await syncRepo(repo, fakeGithub(), fakeDb());
    expect(result).toEqual({ partialSteps: 1 });
    expect(JSON.stringify(result)).not.toMatch(/boom|secret|octo/);
  });

  it('marks a community-standards failure as partial', async () => {
    mocks.checkCommunityStandards.mockImplementation(() => {
      throw new Error('nope');
    });
    await expect(syncRepo(repo, fakeGithub(), fakeDb())).resolves.toEqual({ partialSteps: 1 });
  });

  it('marks a health-score failure as partial', async () => {
    mocks.calculateHealthScore.mockImplementation(() => {
      throw new Error('nope');
    });
    await expect(syncRepo(repo, fakeGithub(), fakeDb())).resolves.toEqual({ partialSteps: 1 });
  });

  it('counts each failing step', async () => {
    mocks.checkBestPractices.mockRejectedValue(new Error('a'));
    mocks.checkCommunityStandards.mockImplementation(() => {
      throw new Error('b');
    });
    mocks.calculateHealthScore.mockImplementation(() => {
      throw new Error('c');
    });
    await expect(syncRepo(repo, fakeGithub(), fakeDb())).resolves.toEqual({ partialSteps: 3 });
  });

  it('persists is_archived in the health upsert, so a skipped metadata batch cannot leave it stale', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const db = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join('?'), values });
      return [{ id: 1 }];
    }) as unknown as Parameters<typeof syncRepo>[2];
    await syncRepo({ ...repo, archived: true } as unknown as RepoMetadata, fakeGithub(), db);
    const upsert = calls.find((c) => c.sql.includes('INSERT INTO repos'))!;
    expect(upsert.sql).toContain('is_archived');
    expect(upsert.sql).toContain('is_archived = EXCLUDED.is_archived');
    expect(upsert.values).toContain(true);
  });
});
