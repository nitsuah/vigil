import type { Octokit } from '@octokit/rest';
import { githubCache } from '@/lib/github-cache';
import logger from '@/lib/log';
import type { RepoMetadata, BranchInfo } from './types';

interface RepoDataInput {
  name: string;
  full_name: string;
  description: string | null | undefined;
  language: string | null | undefined;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  html_url: string;
  homepage: string | null | undefined;
  topics?: string[];
  created_at: string | null | undefined;
  updated_at: string | null | undefined;
  pushed_at: string | null | undefined;
  fork: boolean;
  archived: boolean;
  private: boolean;
}

function mapRepo(data: RepoDataInput): RepoMetadata {
  return {
    name: data.name,
    fullName: data.full_name,
    description: data.description ?? null,
    language: data.language ?? null,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    defaultBranch: data.default_branch,
    url: data.html_url,
    homepage: data.homepage ?? null,
    topics: data.topics || [],
    createdAt: data.created_at || new Date().toISOString(),
    updatedAt: data.updated_at || new Date().toISOString(),
    pushedAt: data.pushed_at || new Date().toISOString(),
    isFork: data.fork || false,
    archived: data.archived || false,
    isPrivate: data.private || false,
  };
}

export async function listRepos(octokit: Octokit, since?: string): Promise<RepoMetadata[]> {
  const cacheKey = since ? `repos:list:since:${since}` : 'repos:list';
  const cached = githubCache.get(cacheKey);
  const headers: Record<string, string> = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  try {
    const { data, headers: responseHeaders } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
      headers,
      ...(since && { since }),
    });

    const repos = data.map(mapRepo);

    const etag = responseHeaders.etag;
    if (etag) githubCache.set(cacheKey, repos, etag);
    return repos;
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 304 && cached) {
      logger.debug('[GitHub] Using cached repo list');
      return cached.data as RepoMetadata[];
    }
    throw error;
  }
}

export async function getRepo(octokit: Octokit, owner: string, repo: string): Promise<RepoMetadata> {
  const { data } = await octokit.repos.get({ owner, repo });
  return mapRepo(data);
}

export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  const cacheKey = `file:${owner}/${repo}/${path}`;
  try {
    const cached = githubCache.get(cacheKey);
    const headers: Record<string, string> = {};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;

    const { data, headers: responseHeaders } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      headers,
    });

    if ('content' in data && data.type === 'file') {
      if ('encoding' in data && data.encoding === 'none') {
        return null; // File too large to fetch via contents API
      }
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const etag = responseHeaders.etag;
      if (etag) githubCache.set(cacheKey, content, etag);
      return content;
    }
    return null;
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 304) {
      const cached = githubCache.get(cacheKey);
      if (cached) {
        logger.debug(`[GitHub] Using cached file: ${owner}/${repo}/${path}`);
        return cached.data as string;
      }
    }
    if (err.status === 404) return null;
    throw error;
  }
}

export async function getBranches(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<BranchInfo[]> {
  const cacheKey = `branches:${owner}/${repo}`;
  const cached = githubCache.get(cacheKey);
  const headers: Record<string, string> = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  try {
    const { data, headers: responseHeaders } = await octokit.repos.listBranches({
      owner,
      repo,
      per_page: 100,
      headers,
    });
    const etag = responseHeaders.etag ? String(responseHeaders.etag) : undefined;
    const branches = data.map((branch) => ({ name: branch.name, protected: branch.protected }));
    if (etag) githubCache.set(cacheKey, branches, etag);
    return branches;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'status' in error &&
      (error as { status?: number }).status === 304 &&
      cached
    )
      return cached.data as BranchInfo[];
    throw error;
  }
}

export interface ZombieBranch {
  name: string;
  lastCommitDate: string | null;
  /** Days since the branch's last commit. */
  daysInactive: number | null;
}

interface RefsPage {
  repository: {
    refs: {
      nodes: Array<{
        name: string;
        target: { committedDate: string | null } | null;
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    } | null;
  } | null;
}

// Refs are ordered by COMMIT_DATE DESC (most-recently-committed first), so the
// stale/zombie branches we actually care about sit at the *tail* of the
// connection — we can't stop early and must walk every page to avoid
// under-reporting. Cap at 20 pages (2,000 branches) purely as a runaway-repo
// safety net; any repo with that many live branches has bigger problems than
// this dashboard.
const MAX_REFS_PAGES = 20;

/**
 * Fetch branches with their latest commit dates via GraphQL so stale
 * long-lived branches can be surfaced. Returns branches sorted by most
 * recently committed first.
 */
export async function getZombieBranches(
  octokit: Octokit,
  owner: string,
  repo: string,
  staleAfterDays = 30
): Promise<ZombieBranch[]> {
  try {
    const nodes: Array<{ name: string; target: { committedDate: string | null } | null }> = [];
    let cursor: string | null = null;
    let hasNextPage = true;
    let pages = 0;

    while (hasNextPage && pages < MAX_REFS_PAGES) {
      pages++;
      const result: RefsPage = await octokit.graphql<RefsPage>(
        `query($owner: String!, $repo: String!, $cursor: String) {
          repository(owner: $owner, name: $repo) {
            refs(refPrefix: "refs/heads/", first: 100, after: $cursor, orderBy: { field: COMMIT_DATE, direction: DESC }) {
              nodes {
                name
                target {
                  ... on Commit {
                    committedDate
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { owner, repo, cursor }
      );

      const refs = result.repository?.refs;
      if (!refs) break;
      nodes.push(...refs.nodes);
      hasNextPage = refs.pageInfo.hasNextPage;
      cursor = refs.pageInfo.endCursor;
    }

    const now = Date.now();
    const branches: ZombieBranch[] = nodes.map((node) => {
      const lastCommitDate = node.target?.committedDate ?? null;
      const daysInactive = lastCommitDate
        ? Math.floor((now - new Date(lastCommitDate).getTime()) / 86400000)
        : null;
      return { name: node.name, lastCommitDate, daysInactive };
    });

    // Only branches that have gone stale (excluding the default branch —
    // callers filter that out since it's the active trunk).
    return branches.filter((b) => b.daysInactive !== null && b.daysInactive >= staleAfterDays);
  } catch (error) {
    logger.warn(`[GitHub] Failed to fetch zombie branches for ${owner}/${repo}:`, error);
    return [];
  }
}

export async function getFileLastModified(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string
): Promise<string | null> {
  try {
    const { data } = await octokit.repos.listCommits({ owner, repo, path, per_page: 1 });
    if (data.length > 0 && data[0].commit.committer?.date) {
      return data[0].commit.committer.date;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getRepoFileList(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<string[]> {
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha: 'HEAD', recursive: '1' });
  if (data.truncated) {
    logger.warn(`[getRepoFileList] Tree for ${owner}/${repo} is truncated — file list is incomplete`);
  }
  return data.tree
    .filter((item) => item.type === 'blob' && item.path)
    .map((item) => item.path as string);
}

export async function getLanguageStats(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<Record<string, number>> {
  try {
    const { data } = await octokit.repos.listLanguages({ owner, repo });
    return data;
  } catch (error) {
    logger.warn(`[GitHub] Failed to fetch language stats for ${owner}/${repo}:`, error);
    return {};
  }
}

export async function getWorkflowRuns(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ status: string; lastRun: string | null; workflowName: string | null }> {
  try {
    const { data } = await octokit.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: 1,
      status: 'completed',
    });
    if (data.workflow_runs.length === 0) {
      return { status: 'unknown', lastRun: null, workflowName: null };
    }
    const latestRun = data.workflow_runs[0];
    const conclusion = latestRun.conclusion;
    const neutralConclusions = ['cancelled', 'skipped', 'neutral', 'timed_out', 'action_required'];
    const status = conclusion === 'success'
      ? 'passing'
      : neutralConclusions.includes(conclusion || '')
        ? 'unknown'
        : 'failing';
    return {
      status,
      lastRun: latestRun.updated_at || latestRun.created_at,
      workflowName: latestRun.name || null,
    };
  } catch (error) {
    logger.warn(`[GitHub] Failed to fetch workflow runs for ${owner}/${repo}:`, error);
    return { status: 'unknown', lastRun: null, workflowName: null };
  }
}

export interface IssueInfo {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  createdAt: string;
  updatedAt: string;
  user: string;
  isPullRequest: boolean;
}

export async function getIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open',
  perPage: number = 100
): Promise<IssueInfo[]> {
  try {
    const { data } = await octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page: perPage,
    });
    return data
      .filter((issue) => !issue.pull_request) // Filter out PRs
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state as 'open' | 'closed',
        labels: issue.labels
          .map((l) => (typeof l === 'string' ? l : l.name))
          .filter((l): l is string => l !== undefined),
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        user: issue.user?.login || 'unknown',
        isPullRequest: false,
      }));
  } catch (error) {
    logger.warn(`[GitHub] Failed to fetch issues for ${owner}/${repo}:`, error);
    return [];
  }
}
