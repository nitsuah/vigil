import type { Octokit } from '@octokit/rest';
import { githubCache } from '@/lib/github-cache';
import logger from '@/lib/log';
import type { PullRequestInfo } from './types';

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MiB — matches GitHub Contents API limit

function assertFileSize(content: string, label: string): void {
  if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_SIZE_BYTES) {
    throw new Error(`${label} exceeds ${MAX_FILE_SIZE_BYTES} byte limit`);
  }
}

export async function getPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PullRequestInfo[]> {
  const cacheKey = `prs:${owner}/${repo}`;
  const cached = githubCache.get(cacheKey);
  const headers: Record<string, string> = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  try {
    const { data, headers: responseHeaders } = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
      headers,
    });
    const etag = responseHeaders.etag ? String(responseHeaders.etag) : undefined;
    const prs = data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state as 'open' | 'closed',
      draft: pr.draft || false,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      user: pr.user?.login || 'unknown',
      labels: pr.labels.map((label) => (typeof label === 'string' ? label : label.name || '')),
    }));
    if (etag) githubCache.set(cacheKey, prs, etag);
    return prs;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      'status' in error &&
      (error as { status?: number }).status === 304 &&
      cached
    )
      return cached.data as PullRequestInfo[];
    throw error;
  }
}

export interface PullRequestReadinessRecord {
  number: number;
  reviewDecision: string | null;
  mergeable: string;
  ciState: string | null;
  threadsResolved: boolean;
  /** CHANGES_REQUESTED but every review thread resolved and CI green. */
  staleReview: boolean;
}

interface ReviewThreadsConnection {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: Array<{ isResolved: boolean }>;
}

// Safety net for pathological PRs with an enormous number of review threads —
// bounds the follow-up pagination below at 2,000 threads/PR (20 pages * 100).
// We only ever hit this cap when *every* thread seen so far is resolved (an
// unresolved thread short-circuits immediately, see fetchAllThreadsResolved).
// Hitting it means the connection wasn't fully exhausted, so
// fetchAllThreadsResolved fails closed to `false` rather than guessing --
// this cap can only cause a false negative (a genuinely-all-resolved PR
// with more threads than the cap doesn't get the stale-review badge),
// never a false positive.
const MAX_REVIEW_THREAD_PAGES = 20;

/**
 * Determines whether *all* of a PR's review threads are resolved, following
 * GraphQL pagination beyond the first page fetched in the parent query.
 * Short-circuits as soon as an unresolved thread is found, since that alone
 * is enough to know the PR isn't a "stale review" candidate — avoiding extra
 * GraphQL round-trips for PRs that clearly still have open feedback.
 */
async function fetchAllThreadsResolved(
  octokit: Octokit,
  prNodeId: string,
  initialThreads: ReviewThreadsConnection
): Promise<boolean> {
  let hadThreads = initialThreads.nodes.length > 0;
  for (const thread of initialThreads.nodes) {
    if (!thread.isResolved) return false;
  }

  // pageInfo is optional here defensively (e.g. in tests that stub a bare
  // `{ nodes: [...] }` shape) — treat a missing pageInfo as "no more pages".
  let hasNextPage = initialThreads.pageInfo?.hasNextPage ?? false;
  let cursor = initialThreads.pageInfo?.endCursor ?? null;
  let pages = 0;

  while (hasNextPage && pages < MAX_REVIEW_THREAD_PAGES) {
    pages++;
    let result: { node: { reviewThreads: ReviewThreadsConnection } | null };
    try {
      result = await octokit.graphql<{
        node: { reviewThreads: ReviewThreadsConnection } | null;
      }>(
        `query($id: ID!, $cursor: String) {
          node(id: $id) {
            ... on PullRequest {
              reviewThreads(first: 100, after: $cursor) {
                pageInfo { hasNextPage endCursor }
                nodes { isResolved }
              }
            }
          }
        }`,
        { id: prNodeId, cursor }
      );
    } catch (error) {
      // A follow-up pagination call failing (network blip, rate limit)
      // must not propagate up through getPullRequestReadiness's loop and
      // wipe out readiness data for every other PR in the repo -- contain
      // it to "this PR isn't confirmed stale" and move on.
      logger.warn(`[GitHub] reviewThreads pagination failed for PR node ${prNodeId}:`, error);
      return false;
    }

    const threads = result.node?.reviewThreads;
    // An incomplete fetch (missing connection, or hitting the page cap
    // below while more pages remain) means unexamined threads could still
    // exist beyond this point -- we cannot safely claim "all resolved"
    // without having seen everything. Fail closed to `false` rather than
    // `hadThreads`, since a false negative here is safe (a genuinely-fine
    // PR just doesn't get the stale-review badge) while a false positive
    // could tell a caller "safe to merge" when an unresolved thread is
    // sitting just past where pagination stopped.
    if (!threads) return false;
    hadThreads = hadThreads || threads.nodes.length > 0;
    for (const thread of threads.nodes) {
      if (!thread.isResolved) return false;
    }
    hasNextPage = threads.pageInfo.hasNextPage;
    cursor = threads.pageInfo.endCursor;
  }

  if (hasNextPage) return false;
  return hadThreads;
}

/**
 * Pure classification helper, deliberately kept separate from the GraphQL
 * fetch above: given a PR's raw review/CI signals, decides whether it's
 * "stale-reviewed" — a formal CHANGES_REQUESTED decision that GitHub never
 * auto-clears when its threads resolve (that needs a re-review or a
 * dismissal), even though the PR is otherwise code-and-review-complete.
 * Distinct from a PR that's genuinely still blocked on open feedback or
 * failing/pending checks.
 */
export function isStaleReview(pr: {
  reviewDecision: string | null;
  mergeable: string;
  ciState: string | null;
  threadsResolved: boolean;
}): boolean {
  const changesRequested = pr.reviewDecision === 'CHANGES_REQUESTED';
  const ciPassing = pr.ciState === 'SUCCESS';
  const hasConflicts = pr.mergeable === 'CONFLICTING';
  // Require CI to have actually finished green, not merely "not failing" —
  // PENDING/EXPECTED/null states shouldn't count as "stale, safe to merge".
  return changesRequested && pr.threadsResolved && ciPassing && !hasConflicts;
}

/**
 * Pure helper: extracts the PR numbers flagged as stale-reviewed from a set
 * of readiness records, sorted ascending, so the dashboard can link straight
 * to each affected PR instead of a repo's generic PR list.
 */
export function getStaleReviewPrNumbers(records: PullRequestReadinessRecord[]): number[] {
  return records
    .filter((r: PullRequestReadinessRecord) => r.staleReview)
    .map((r: PullRequestReadinessRecord) => r.number)
    .sort((a: number, b: number) => a - b);
}

export async function getPullRequestReadiness(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{
  readyCount: number;
  blockedCount: number;
  staleReviewCount: number;
  staleReviewPrNumbers: number[];
  records: PullRequestReadinessRecord[];
}> {
  try {
    const result = await octokit.graphql<{
      repository: {
        pullRequests: {
          nodes: Array<{
            id: string;
            number: number;
            isDraft: boolean;
            reviewDecision: string | null;
            mergeable: string;
            commits: {
              nodes: Array<{
                commit: { statusCheckRollup: { state: string } | null };
              }>;
            };
            reviewThreads: ReviewThreadsConnection;
          }>;
        } | null;
      } | null;
    }>(
      `query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          pullRequests(states: OPEN, first: 50) {
            nodes {
              id
              number
              isDraft
              reviewDecision
              mergeable
              commits(last: 1) {
                nodes {
                  commit {
                    statusCheckRollup { state }
                  }
                }
              }
              reviewThreads(first: 50) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  isResolved
                }
              }
            }
          }
        }
      }`,
      { owner, repo }
    );

    const nodes = result.repository?.pullRequests?.nodes || [];
    let readyCount = 0;
    let blockedCount = 0;
    let staleReviewCount = 0;
    const records: PullRequestReadinessRecord[] = [];

    for (const pr of nodes) {
      const ciState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null;
      const ciFailing = ciState === 'FAILURE' || ciState === 'ERROR';
      const changesRequested = pr.reviewDecision === 'CHANGES_REQUESTED';
      const hasConflicts = pr.mergeable === 'CONFLICTING';

      const threadsResolved = await fetchAllThreadsResolved(
        octokit,
        pr.id,
        pr.reviewThreads ?? { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] }
      );
      const staleReview = isStaleReview({
        reviewDecision: pr.reviewDecision,
        mergeable: pr.mergeable,
        ciState,
        threadsResolved,
      });

      records.push({
        number: pr.number,
        reviewDecision: pr.reviewDecision,
        mergeable: pr.mergeable,
        ciState,
        threadsResolved,
        staleReview,
      });

      if (staleReview) {
        staleReviewCount++;
      } else if (pr.isDraft || changesRequested || ciFailing || hasConflicts) {
        blockedCount++;
      } else {
        readyCount++;
      }
    }

    return { readyCount, blockedCount, staleReviewCount, staleReviewPrNumbers: getStaleReviewPrNumbers(records), records };
  } catch (error) {
    logger.warn(`[GitHub] Failed to fetch PR readiness for ${owner}/${repo}:`, error);
    return { readyCount: 0, blockedCount: 0, staleReviewCount: 0, staleReviewPrNumbers: [], records: [] };
  }
}

export async function getPullRequestStats(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ avgMergeTimeHours: number }> {
  try {
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state: 'closed',
      per_page: 30,
      sort: 'updated',
      direction: 'desc',
    });

    const mergedPrs = prs.filter((pr) => pr.merged_at);
    if (mergedPrs.length === 0) return { avgMergeTimeHours: 0 };

    const mergeTimes = mergedPrs.map((pr) => {
      const created = new Date(pr.created_at).getTime();
      const merged = new Date(pr.merged_at!).getTime();
      return (merged - created) / (1000 * 60 * 60);
    });

    const avg = mergeTimes.reduce((sum, t) => sum + t, 0) / mergeTimes.length;
    return { avgMergeTimeHours: Math.round(avg * 10) / 10 };
  } catch (error) {
    logger.warn(`[GitHub] Failed to fetch PR stats for ${owner}/${repo}:`, error);
    return { avgMergeTimeHours: 0 };
  }
}

export async function createPrForFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  filePath: string,
  content: string,
  message: string
): Promise<string> {
  assertFileSize(content, 'File content');

  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const sha = refData.object.sha;

  try {
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status !== 422) throw error; // 422 = ref already exists, reuse it
  }

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: Buffer.from(content).toString('base64'),
    branch: branchName,
  });

  const { data: prData } = await octokit.pulls.create({
    owner,
    repo,
    title: message.split('\n')[0],
    head: branchName,
    base: defaultBranch,
    body: `Automated PR to add ${filePath}`,
  });

  return prData.html_url;
}

export async function createPrForFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
  files: Array<{ path: string; content: string }>,
  message: string
): Promise<string> {
  // Validate every file before any API call so an oversized file cannot leave a half-created branch behind.
  for (const file of files) assertFileSize(file.content, `File content (${file.path})`);

  const { data: repoData } = await octokit.repos.get({ owner, repo });
  logger.debug('[createPrForFiles] Repo status', {
    archived: repoData.archived,
    disabled: repoData.disabled,
    permissions: repoData.permissions,
  });

  if (repoData.archived) {
    throw new Error(`Repository ${owner}/${repo} is archived and cannot accept changes`);
  }

  const defaultBranch = repoData.default_branch;
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const sha = refData.object.sha;

  const refToCreate = `refs/heads/${branchName}`;
  logger.debug('[createPrForFiles] Creating branch', { ref: refToCreate });
  try {
    const createResult = await octokit.git.createRef({ owner, repo, ref: refToCreate, sha });
    logger.debug('[createPrForFiles] Branch created', { ref: createResult.data.ref });
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    logger.error('[createPrForFiles] Failed to create branch', {
      error: err.message,
      status: err.status,
      branchName,
      ref: refToCreate,
      sha,
    });
    throw error;
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  logger.debug('[createPrForFiles] Writing files to branch via Contents API');
  for (const file of files) {
    const normalizedPath = file.path.replace(/^\/+/, '').replace(/\\/g, '/');
    let existingSha: string | undefined = undefined;
    try {
      const { data: existing } = await octokit.repos.getContent({
        owner,
        repo,
        path: normalizedPath,
        ref: branchName,
      });
      if (!Array.isArray(existing) && (existing as { sha?: string }).sha) {
        existingSha = (existing as { sha: string }).sha;
        logger.debug('[createPrForFiles] Existing file found on branch', { path: normalizedPath, sha: existingSha });
      }
    } catch (getErr: unknown) {
      const err = getErr as { status?: number };
      if (err.status !== 404) {
        logger.warn('[createPrForFiles] getContent warning', { path: normalizedPath, error: getErr });
      } else {
        logger.debug('[createPrForFiles] File does not exist on branch, will create', { path: normalizedPath });
      }
    }

    const commitMsgTitle = message.split('\n')[0] || 'chore: add file';
    const commitMessage = `${commitMsgTitle}: ${normalizedPath}`;
    const { data: writeResult } = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: normalizedPath,
      message: commitMessage,
      content: Buffer.from(file.content).toString('base64'),
      branch: branchName,
      sha: existingSha,
    });
    logger.debug('[createPrForFiles] Wrote file', { path: normalizedPath, commit: writeResult.commit?.sha });
  }

  const messageParts = message.split('\n\n');
  const title = messageParts[0];
  const body =
    messageParts.length > 1
      ? messageParts.slice(1).join('\n\n')
      : `Automated PR to add files:\n\n${files.map((f) => `- ${f.path}`).join('\n')}`;

  const { data: prData } = await octokit.pulls.create({
    owner,
    repo,
    title,
    head: branchName,
    base: defaultBranch,
    body,
  });

  return prData.html_url;
}
