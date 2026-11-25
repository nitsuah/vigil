import type { Octokit } from '@octokit/rest';
import logger from '@/lib/log';

export async function getContributorStats(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<{ contributorCount: number; commitFrequency: number | null; busFactor: number }> {
  try {
    const { data: contributors } = await octokit.repos.listContributors({
      owner,
      repo,
      per_page: 100,
    });
    if (contributors.length === 100) {
      logger.warn(`[GitHub] Contributor scan capped at 100 for ${owner}/${repo}`);
    }

    const contributorCount = contributors.length;
    const totalCommits = contributors.reduce((sum, c) => sum + (c.contributions || 0), 0);

    const sorted = [...contributors].sort((a, b) => (b.contributions || 0) - (a.contributions || 0));
    let cumulativeCommits = 0;
    let busFactor = 0;
    for (const contributor of sorted) {
      cumulativeCommits += contributor.contributions || 0;
      busFactor++;
      if (cumulativeCommits >= totalCommits * 0.8) break;
    }

    const activityResponse = await octokit.repos.getCommitActivityStats({ owner, repo });
    if (activityResponse.status === 202) {
      logger.warn(`[GitHub] Commit activity stats for ${owner}/${repo} are still being generated — skipping commitFrequency`);
      return { contributorCount, commitFrequency: null, busFactor };
    }
    const recentWeeks = Array.isArray(activityResponse.data) ? activityResponse.data.slice(-12) : [];
    const commitFrequency =
      recentWeeks.length > 0
        ? recentWeeks.reduce((sum, week) => sum + (week.total || 0), 0) / recentWeeks.length
        : 0;

    return {
      contributorCount,
      commitFrequency: Math.round(commitFrequency * 10) / 10,
      busFactor,
    };
  } catch (error) {
    logger.warn(`[GitHub] Failed to fetch contributor stats for ${owner}/${repo}:`, error);
    return { contributorCount: 0, commitFrequency: 0, busFactor: 0 };
  }
}
