import { describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { getPullRequestReadiness, MAX_REVIEW_THREAD_PAGES_PER_REPO } from "../lib/github/prs";
import { getZombieBranches, getOpenIssueLabels, MAX_REFS_PAGES, MAX_OPEN_ISSUE_PAGES } from "../lib/github/repos";
import { getContributorStats } from "../lib/github/contributors";

describe("health-sync pagination budgets", () => {
  it("shares one follow-up review-thread budget across all open PRs", async () => {
    const nodes = Array.from({ length: 10 }, (_, index) => ({
      id: `pr-${index}`,
      number: index + 1,
      isDraft: false,
      reviewDecision: "CHANGES_REQUESTED",
      mergeable: "MERGEABLE",
      commits: { nodes: [{ commit: { statusCheckRollup: { state: "SUCCESS" } } }] },
      reviewThreads: {
        pageInfo: { hasNextPage: true, endCursor: "first" },
        nodes: [{ isResolved: true }],
      },
    }));
    const graphql = vi.fn(async (query: string) => query.includes("pullRequests")
      ? { repository: { pullRequests: { nodes } } }
      : { node: { reviewThreads: { pageInfo: { hasNextPage: true, endCursor: "next" }, nodes: [{ isResolved: true }] } } });
    const result = await getPullRequestReadiness({ graphql } as unknown as Octokit, "owner", "repo");

    expect(graphql).toHaveBeenCalledTimes(1 + MAX_REVIEW_THREAD_PAGES_PER_REPO);
    expect(result.staleReviewCount).toBe(0);
    expect(result.records).toHaveLength(10);
  });

  it("caps zombie-branch pagination", async () => {
    const graphql = vi.fn().mockResolvedValue({
      repository: { refs: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "next" } } },
    });
    await getZombieBranches({ graphql } as unknown as Octokit, "owner", "repo");
    expect(graphql).toHaveBeenCalledTimes(MAX_REFS_PAGES);
  });

  it("caps open-issue label pagination and reports an incomplete scan", async () => {
    const listForRepo = vi.fn().mockResolvedValue({ data: Array.from({ length: 100 }, () => ({ labels: [], pull_request: null })) });
    const result = await getOpenIssueLabels({ issues: { listForRepo } } as unknown as Octokit, "owner", "repo");
    expect(listForRepo).toHaveBeenCalledTimes(MAX_OPEN_ISSUE_PAGES);
    expect(result.complete).toBe(false);
    expect(result.issues).toHaveLength(MAX_OPEN_ISSUE_PAGES * 100);
  });

  it("reads only one contributor page", async () => {
    const listContributors = vi.fn().mockResolvedValue({ data: Array.from({ length: 100 }, () => ({ contributions: 1 })) });
    const getCommitActivityStats = vi.fn().mockResolvedValue({ status: 200, data: [{ total: 12 }] });
    const stats = await getContributorStats({
      repos: { listContributors, getCommitActivityStats },
      paginate: vi.fn(),
    } as unknown as Octokit, "owner", "repo");
    expect(listContributors).toHaveBeenCalledTimes(1);
    expect(stats.contributorCount).toBe(100);
  });
});
