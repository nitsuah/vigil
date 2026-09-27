import { Octokit } from '@octokit/rest';
import { createOctokitClient } from '@/lib/githubClient';
import { githubCache } from '@/lib/github-cache';
import { coreFromHeaders, type RateBucket } from '@/lib/rate-limit-headers';

export { githubCache };
export type { RepoMetadata, BranchInfo, PullRequestInfo } from './github/types';
import type { RepoMetadata, BranchInfo, PullRequestInfo } from './github/types';
import type { PullRequestReadinessRecord } from './github/prs';
import type { ZombieBranch } from './github/repos';

import * as Repos from './github/repos';
import * as PRs from './github/prs';
import * as Security from './github/security';
import * as Contributors from './github/contributors';

export class GitHubClient {
  private octokit: Octokit;
  private owner: string;
  /**
   * One file tree per repo for this client's lifetime (a client lives for one
   * sync or request). getFileContent consults it so probes for docs a repo
   * doesn't have (TASKS.md, docs/ROADMAP.md, .github/SECURITY.md, ...) cost
   * nothing: a 404 is never ETag-cached, so each probe used to spend a request
   * on every sync. null = tree unavailable or truncated; probe as before.
   */
  private fileSets = new Map<string, Promise<Set<string> | null>>();
  /**
   * The core quota as of the latest response, from its x-ratelimit-* headers.
   * GET /rate_limit can report core as untouched (lib/rate-limit-headers.ts),
   * so the sync's low-quota guard reads this instead.
   */
  private lastCore: { bucket: RateBucket; at: number } | null = null;

  constructor(token: string, owner: string) {
    this.octokit = createOctokitClient(token);
    this.owner = owner;
    const record = (headers: unknown) => {
      const bucket = headers ? coreFromHeaders(headers as Record<string, string | number | undefined>) : null;
      if (bucket) this.lastCore = { bucket, at: Date.now() };
    };
    // Test doubles may not implement hooks.
    this.octokit.hook?.after?.('request', (res) => record(res.headers));
    this.octokit.hook?.error?.('request', (err) => {
      record((err as { response?: { headers?: unknown } }).response?.headers);
      throw err;
    });
  }

  public getOctokit(): Octokit {
    return this.octokit;
  }

  /** Core quota; reset is epoch seconds. Uses the latest response headers when under a minute old. */
  async getRateLimit(): Promise<{ limit: number; remaining: number; reset: number }> {
    if (!this.lastCore || Date.now() - this.lastCore.at > 60_000) {
      // A real core request (costs 1); the hook records its headers.
      await this.octokit.rest.users.getAuthenticated().catch(() => undefined);
    }
    if (this.lastCore) {
      const { limit, remaining, reset } = this.lastCore.bucket;
      return { limit, remaining, reset: Math.floor(new Date(reset).getTime() / 1000) };
    }
    const { data } = await this.octokit.rateLimit.get();
    return {
      limit: data.resources.core.limit,
      remaining: data.resources.core.remaining,
      reset: data.resources.core.reset,
    };
  }

  // Repo operations
  listRepos(since?: string): Promise<RepoMetadata[]> {
    return Repos.listRepos(this.octokit, since);
  }

  getRepo(owner: string, repo: string): Promise<RepoMetadata> {
    return Repos.getRepo(this.octokit, owner, repo);
  }

  private fileSet(owner: string, repo: string): Promise<Set<string> | null> {
    const key = `${owner}/${repo}`;
    let set = this.fileSets.get(key);
    if (!set) {
      set = Repos.getRepoFileTree(this.octokit, owner, repo)
        .then((t) => (t.truncated ? null : new Set(t.paths)))
        .catch(() => null);
      this.fileSets.set(key, set);
    }
    return set;
  }

  async getFileContent(repo: string, path: string, owner?: string): Promise<string | null> {
    const o = owner || this.owner;
    const files = await this.fileSet(o, repo);
    if (files && !files.has(path)) return null;
    return Repos.getFileContent(this.octokit, o, repo, path);
  }

  getBranches(repo: string, owner?: string): Promise<BranchInfo[]> {
    return Repos.getBranches(this.octokit, owner || this.owner, repo);
  }

  getZombieBranches(repo: string, owner?: string, staleAfterDays?: number): Promise<ZombieBranch[]> {
    return Repos.getZombieBranches(this.octokit, owner || this.owner, repo, staleAfterDays);
  }

  getFileLastModified(repo: string, path: string, owner?: string): Promise<string | null> {
    return Repos.getFileLastModified(this.octokit, owner || this.owner, repo, path);
  }

  async getRepoFileList(repo: string, owner?: string): Promise<string[]> {
    const files = await this.fileSet(owner || this.owner, repo);
    return files ? [...files] : Repos.getRepoFileList(this.octokit, owner || this.owner, repo);
  }

  getLanguageStats(repo: string, owner?: string): Promise<Record<string, number>> {
    return Repos.getLanguageStats(this.octokit, owner || this.owner, repo);
  }

  getWorkflowRuns(repo: string, owner?: string): Promise<{ status: string; lastRun: string | null; workflowName: string | null }> {
    return Repos.getWorkflowRuns(this.octokit, owner || this.owner, repo);
  }

  getIssues(repo: string, owner?: string, state?: 'open' | 'closed' | 'all', perPage?: number): Promise<Repos.IssueInfo[]> {
    return Repos.getIssues(this.octokit, owner || this.owner, repo, state, perPage);
  }

  // PR operations
  getPullRequests(repo: string, owner?: string): Promise<PullRequestInfo[]> {
    return PRs.getPullRequests(this.octokit, owner || this.owner, repo);
  }

  getPullRequestReadiness(repo: string, owner?: string): Promise<{
    readyCount: number;
    blockedCount: number;
    staleReviewCount: number;
    staleReviewPrNumbers: number[];
    records: PullRequestReadinessRecord[];
  }> {
    return PRs.getPullRequestReadiness(this.octokit, owner || this.owner, repo);
  }

  getPullRequestStats(repo: string, owner?: string): Promise<{ avgMergeTimeHours: number }> {
    return PRs.getPullRequestStats(this.octokit, owner || this.owner, repo);
  }

  createPrForFile(
    repo: string,
    branchName: string,
    filePath: string,
    content: string,
    message: string,
    owner?: string
  ): Promise<string> {
    return PRs.createPrForFile(
      this.octokit,
      owner || this.owner,
      repo,
      branchName,
      filePath,
      content,
      message
    );
  }

  createPrForFiles(
    repo: string,
    branchName: string,
    files: Array<{ path: string; content: string }>,
    message: string,
    owner?: string
  ): Promise<string> {
    return PRs.createPrForFiles(
      this.octokit,
      owner || this.owner,
      repo,
      branchName,
      files,
      message
    );
  }

  // Security operations
  getVulnerabilityAlerts(repo: string, owner?: string): Promise<{ total: number; critical: number; high: number }> {
    return Security.getVulnerabilityAlerts(this.octokit, owner || this.owner, repo);
  }

  getSecurityConfig(repo: string, owner?: string): ReturnType<typeof Security.getSecurityConfig> {
    const o = owner || this.owner;
    return Security.getSecurityConfig(this.octokit, o, repo, async (path) => {
      const files = await this.fileSet(o, repo);
      return files ? files.has(path) : null;
    });
  }

  // Contributor operations
  getContributorStats(repo: string, owner?: string): Promise<{ contributorCount: number; commitFrequency: number | null; busFactor: number }> {
    return Contributors.getContributorStats(this.octokit, owner || this.owner, repo);
  }
}
