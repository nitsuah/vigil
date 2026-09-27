import { test, expect, vi } from 'vitest';
import { GitHubClient } from '../lib/github';
import type { Octokit } from '@octokit/rest';

// Mock the Octokit client factory
vi.mock('@/lib/githubClient', () => ({
  createOctokitClient: vi.fn((token: string) => ({
    repos: {
      listForAuthenticatedUser: vi.fn(),
      get: vi.fn(),
      getContent: vi.fn(),
      listBranches: vi.fn(),
      createOrUpdateFileContents: vi.fn(),
    },
    pulls: {
      list: vi.fn(),
      create: vi.fn(),
    },
    git: {
      getRef: vi.fn(),
      createRef: vi.fn(),
      getTree: vi.fn().mockRejectedValue({ status: 500 }),
    },
  })),
}));

test('GitHubClient.listRepos returns mapped repo metadata', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mockOctokit = client.getOctokit() as unknown as {
    repos: { listForAuthenticatedUser: ReturnType<typeof vi.fn> };
  };

  mockOctokit.repos.listForAuthenticatedUser.mockResolvedValue({
    data: [
      {
        name: 'test-repo',
        full_name: 'test-owner/test-repo',
        description: 'Test description',
        language: 'TypeScript',
        stargazers_count: 10,
        forks_count: 2,
        open_issues_count: 3,
        default_branch: 'main',
        html_url: 'https://github.com/test-owner/test-repo',
        homepage: 'https://example.com',
        topics: ['test', 'repo'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-06-01T00:00:00Z',
        pushed_at: '2023-06-15T00:00:00Z',
        fork: false,
      },
    ],
    headers: {},
  });

  const repos = await client.listRepos();
  expect(repos).toHaveLength(1);
  expect(repos[0].name).toBe('test-repo');
  expect(repos[0].stars).toBe(10);
  expect(repos[0].language).toBe('TypeScript');
  expect(repos[0].isFork).toBe(false);
});

test('GitHubClient.getRepo returns single repo metadata', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mockOctokit = client.getOctokit() as unknown as {
    repos: { get: ReturnType<typeof vi.fn> };
  };

  mockOctokit.repos.get.mockResolvedValue({
    data: {
      name: 'single-repo',
      full_name: 'owner/single-repo',
      description: 'Single repo',
      language: 'JavaScript',
      stargazers_count: 5,
      forks_count: 1,
      open_issues_count: 0,
      default_branch: 'main',
      html_url: 'https://github.com/owner/single-repo',
      homepage: null,
      topics: [],
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-01T00:00:00Z',
      pushed_at: '2024-06-01T00:00:00Z',
      fork: false,
    },
  });

  const repo = await client.getRepo('owner', 'single-repo');
  expect(repo.name).toBe('single-repo');
  expect(repo.stars).toBe(5);
  expect(repo.topics).toEqual([]);
});

test('GitHubClient.getFileContent returns decoded content', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mockOctokit = client.getOctokit() as unknown as {
    repos: { getContent: ReturnType<typeof vi.fn> };
  };

  const content = 'Hello World';
  const encoded = Buffer.from(content).toString('base64');

  mockOctokit.repos.getContent.mockResolvedValue({
    data: {
      type: 'file',
      content: encoded,
      encoding: 'base64',
    },
    headers: {},
  });

  const result = await client.getFileContent('test-repo', 'README.md');
  expect(result).toBe(content);
});

test('GitHubClient.getFileContent returns null for 404', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mockOctokit = client.getOctokit() as unknown as {
    repos: { getContent: ReturnType<typeof vi.fn> };
  };

  mockOctokit.repos.getContent.mockRejectedValue({ status: 404 });

  const result = await client.getFileContent('test-repo', 'MISSING.md');
  expect(result).toBeNull();
});

test('GitHubClient.getBranches returns branch list', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mockOctokit = client.getOctokit() as unknown as {
    repos: { listBranches: ReturnType<typeof vi.fn> };
  };

  mockOctokit.repos.listBranches.mockResolvedValue({
    data: [
      { name: 'main', protected: true },
      { name: 'develop', protected: false },
    ],
    headers: { etag: '"abc123"' },
    status: 200,
    url: '',
  });

  const branches = await client.getBranches('test-repo');
  expect(branches).toHaveLength(2);
  expect(branches[0].name).toBe('main');
  expect(branches[0].protected).toBe(true);
});

test('GitHubClient.getPullRequests returns PR list', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mockOctokit = client.getOctokit() as unknown as {
    pulls: { list: ReturnType<typeof vi.fn> };
  };

  mockOctokit.pulls.list.mockResolvedValue({
    data: [
      {
        number: 1,
        title: 'Test PR',
        state: 'open',
        draft: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        user: { login: 'test-user' },
        labels: [{ name: 'bug' }, { name: 'priority' }],
      },
    ],
    headers: { etag: '"ghi789"' },
    status: 200,
    url: '',
  });

  const prs = await client.getPullRequests('test-repo');
  expect(prs).toHaveLength(1);
  expect(prs[0].number).toBe(1);
  expect(prs[0].title).toBe('Test PR');
  expect(prs[0].labels).toEqual(['bug', 'priority']);
});

test('GitHubClient.createPrForFile creates branch and PR', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mockOctokit = client.getOctokit() as unknown as {
    repos: { get: ReturnType<typeof vi.fn>; createOrUpdateFileContents: ReturnType<typeof vi.fn> };
    git: { getRef: ReturnType<typeof vi.fn>; createRef: ReturnType<typeof vi.fn> };
    pulls: { create: ReturnType<typeof vi.fn> };
  };

  mockOctokit.repos.get.mockResolvedValue({
    data: { default_branch: 'main' },
  });

  mockOctokit.git.getRef.mockResolvedValue({
    data: { object: { sha: 'abc123' } },
  });

  mockOctokit.git.createRef.mockResolvedValue({
    data: { ref: 'refs/heads/test-branch' },
  });

  mockOctokit.repos.createOrUpdateFileContents.mockResolvedValue({
    data: { commit: { sha: 'def456' } },
  });

  mockOctokit.pulls.create.mockResolvedValue({
    data: { html_url: 'https://github.com/test-owner/test-repo/pull/1' },
  });

  const prUrl = await client.createPrForFile(
    'test-repo',
    'test-branch',
    'README.md',
    '# Test',
    'Add README'
  );

  expect(prUrl).toBe('https://github.com/test-owner/test-repo/pull/1');
  expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
    owner: 'test-owner',
    repo: 'test-repo',
    ref: 'refs/heads/test-branch',
    sha: 'abc123',
  });
});

type TreeMock = { repos: { getContent: ReturnType<typeof vi.fn> }; git: { getTree: ReturnType<typeof vi.fn> } };
const blob = (path: string) => ({ type: 'blob', path });

test('GitHubClient.getFileContent skips the request for a file the repo tree does not have', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mock = client.getOctokit() as unknown as TreeMock;
  mock.git.getTree.mockResolvedValue({ data: { tree: [blob('README.md'), blob('docs/TASKS.md')], truncated: false }, headers: {} });
  mock.repos.getContent.mockResolvedValue({ data: { type: 'file', content: Buffer.from('# hi').toString('base64'), encoding: 'base64' }, headers: {} });

  expect(await client.getFileContent('tree-repo', 'TASKS.md')).toBeNull();
  expect(await client.getFileContent('tree-repo', '.github/SECURITY.md')).toBeNull();
  expect(mock.repos.getContent).not.toHaveBeenCalled();

  expect(await client.getFileContent('tree-repo', 'docs/TASKS.md')).toBe('# hi');
  expect(mock.repos.getContent).toHaveBeenCalledTimes(1);
  // The tree is fetched once per repo for the client's lifetime.
  expect(mock.git.getTree).toHaveBeenCalledTimes(1);
});

test('GitHubClient.getFileContent still probes when the tree is truncated', async () => {
  const client = new GitHubClient('fake-token', 'test-owner');
  const mock = client.getOctokit() as unknown as TreeMock;
  mock.git.getTree.mockResolvedValue({ data: { tree: [blob('README.md')], truncated: true }, headers: {} });
  mock.repos.getContent.mockRejectedValue({ status: 404 });

  expect(await client.getFileContent('big-repo', 'TASKS.md')).toBeNull();
  expect(mock.repos.getContent).toHaveBeenCalledTimes(1);
});

test('GitHubClient reuses a 304 tree from the ETag cache', async () => {
  const mock1 = new GitHubClient('fake-token', 'test-owner');
  const o1 = mock1.getOctokit() as unknown as TreeMock;
  o1.git.getTree.mockResolvedValue({ data: { tree: [blob('ROADMAP.md')], truncated: false }, headers: { etag: 'W/"t1"' } });
  expect(await mock1.getRepoFileList('etag-repo')).toEqual(['ROADMAP.md']);

  // A new client (next sync) sends If-None-Match and gets a free 304.
  const mock2 = new GitHubClient('fake-token', 'test-owner');
  const o2 = mock2.getOctokit() as unknown as TreeMock;
  o2.git.getTree.mockRejectedValue({ status: 304 });
  expect(await mock2.getRepoFileList('etag-repo')).toEqual(['ROADMAP.md']);
  expect(o2.git.getTree.mock.calls[0][0].headers).toEqual({ 'If-None-Match': 'W/"t1"' });
});
