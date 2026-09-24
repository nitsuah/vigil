import { Octokit } from '@octokit/rest';
import { createOctokitClient } from '@/lib/githubClient';
import { githubCache } from '@/lib/github-cache';

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

  constructor(token: string, owner: string) {
    this.octokit = createOctokitClient(token);
    this.owner = owner;
  }

  public getOctokit(): Octokit {
    return this.octokit;
  }

  async getRateLimit(): Promise<{ limit: number; remaining: number; reset: number }> {
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

  getFileContent(repo: string, path: string, owner?: string): Promise<string | null> {
    return Repos.getFileContent(this.octokit, owner || this.owner, repo, path);
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

  getRepoFileList(repo: string, owner?: string): Promise<string[]> {
    return Repos.getRepoFileList(this.octokit, owner || this.owner, repo);
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
    return Security.getSecurityConfig(this.octokit, owner || this.owner, repo);
  }

  // Contributor operations
  getContributorStats(repo: string, owner?: string): Promise<{ contributorCount: number; commitFrequency: number | null; busFactor: number }> {
    return Contributors.getContributorStats(this.octokit, owner || this.owner, repo);
  }
}
