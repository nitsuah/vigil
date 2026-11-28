import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/db', () => ({ ensureSchema: vi.fn(async () => undefined), getNeonClient: vi.fn() }));
vi.mock('../lib/log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { syncRepo } from '../lib/sync';
import { getFileContents } from '../lib/github/repos';
import { SUBREQUEST_BUDGET } from '../lib/sync-batch';
import type { GitHubClient, RepoMetadata } from '../lib/github';

const repo = { name: 'big', fullName: 'octo/big', pushedAt: new Date().toISOString() } as unknown as RepoMetadata;

describe('getFileContents', () => {
  it('reads 120 files in 3 requests and maps missing files to null', async () => {
    const graphql = vi.fn(async (_query: string, vars: Record<string, string>) => ({
      repository: Object.fromEntries(
        Object.keys(vars).filter((k) => /^e\d+$/.test(k)).map((k) => [`f${k.slice(1)}`, vars[k] === 'HEAD:f7.ts' ? null : { text: vars[k] }])
      ),
    }));
    const paths = Array.from({ length: 120 }, (_, i) => `f${i}.ts`);
    const contents = await getFileContents({ graphql } as never, 'octo', 'big', paths);
    expect(graphql).toHaveBeenCalledTimes(3);
    expect(contents.get('f0.ts')).toBe('HEAD:f0.ts');
    expect(contents.get('f7.ts')).toBeNull();
    expect(graphql.mock.calls[0][0]).not.toContain('f0.ts');
  });

  it('throws rather than reporting files missing when the repository is unavailable', async () => {
    const octokit = { graphql: async () => ({ repository: null }) } as never;
    await expect(getFileContents(octokit, 'octo', 'big', ['README.md'])).rejects.toThrow();
  });
});

describe('docs step on a large repo', () => {
  it('stays within the subrequest budget however many files and tasks there are', async () => {
    let subrequests = 0;
    const tree = Array.from({ length: 800 }, (_, i) => `tests/case${i}.test.ts`);
    const tasks = ['# Tasks', '## P1', ...Array.from({ length: 300 }, (_, i) => `- [ ] task ${i}`)].join('\n');
    const github = {
      getRepoFileList: async () => { subrequests++; return tree; },
      getFileContents: async (_repo: string, paths: string[]) => {
        subrequests += Math.ceil(paths.length / 50);
        return new Map(paths.map((p) => [p, p === 'TASKS.md' ? tasks : null]));
      },
    } as unknown as GitHubClient;
    // Awaiting a query is a subrequest; a transaction is one however many it holds.
    const query = () => ({ then: (resolve: (rows: unknown[]) => void) => { subrequests++; resolve([{ id: 1 }]); } });
    const transaction = vi.fn(async (queries: unknown[]) => { subrequests++; return queries.map(() => []); });
    const db = Object.assign(vi.fn(query), { transaction });

    await syncRepo(repo, github, db, 'docs');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0].length).toBeGreaterThan(300);
    expect(subrequests).toBeLessThanOrEqual(SUBREQUEST_BUDGET);
  });
});
