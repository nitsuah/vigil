import { test, expect, step, openDashboard, settle } from './vigil';
import { ISSUES_CARD_DEMO, REPOS } from '../fixtures/demo-portfolio';

test(
  'owner opens a repo and reads its stats and open work',
  { tag: ['@feature:expandable-details', '@feature:repository-stats', '@feature:lines-of-code-loc', '@feature:contributor-analytics', '@feature:roadmap-visualization', '@feature:task-management'] },
  async ({ page }) => {
    await step(page, 'expand vigil', async () => {
      await openDashboard(page);
      await page.locator('table tbody tr', { hasText: 'Portfolio health dashboard' }).locator('td').nth(1).click();
      await expect(page.getByRole('heading', { name: 'Repository Stats' })).toBeVisible({ timeout: 15_000 });
      await settle(page);
    });

    await step(page, 'read the repository stats', async () => {
      await expect(page.getByText('48.2K')).toBeVisible();
      await expect(page.getByText('14.2h')).toBeVisible();
      await expect(page.getByText('7.9 tok/line')).toBeVisible();
    }, { docs: 'repository-stats' });

    await step(page, 'check the roadmap and tasks', async () => {
      await expect(page.getByRole('table').getByText('AI-assisted roadmap management')).toBeVisible();
      await expect(page.locator('[data-tour="tasks-section"]').first()).toContainText('0/2');
    }, { docs: 'task-management' });

    await step(page, 'verify Issues card counts and destinations', async () => {
      // Override the repo-list response only after the existing screenshot steps,
      // so the shared visual-docs/demo baselines remain unchanged.
      const issueRepos = REPOS.map((repo) => repo.name === 'vigil' ? { ...repo, ...ISSUES_CARD_DEMO } : repo);
      await page.route('**/api/repos?*', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(issueRepos),
      }));
      await openDashboard(page);
      await page.locator('table tbody tr', { hasText: 'Portfolio health dashboard' }).locator('td').nth(1).click();
      await expect(page.getByRole('heading', { name: 'Repository Stats' })).toBeVisible({ timeout: 15_000 });
      await settle(page);

      const issues = page.locator('[data-tour="issues"]');
      await expect(issues).toBeVisible();
      await issues.getByText('Issues', { exact: true }).click();

      const links = issues.getByRole('link');
      await expect(links).toHaveCount(4);
      await expect(links.nth(0)).toHaveText('5');
      await expect(links.nth(1)).toHaveText('1');
      await expect(links.nth(2)).toHaveText('2');
      await expect(links.nth(3)).toHaveText('1');

      const plain = 'https://github.com/nitsuah/vigil/issues?q=is%3Aissue+is%3Aopen';
      await expect(links.nth(0)).toHaveAttribute('href', plain);
      await expect(links.nth(1)).toHaveAttribute('href', plain + '+label%3Aenhancement');
      await expect(links.nth(2)).toHaveAttribute('href', plain + '+label%3Abug');
      await expect(links.nth(3)).toHaveAttribute('href', plain);

      await expect(issues.getByText('Counts are incomplete: not every open issue page was read.')).toBeVisible();
      const rows = issues.locator('div.space-y-2 > div');
      const rowTexts = await rows.allTextContents();
      expect(rowTexts[0]).toContain('Total');
      expect(rowTexts[1]).toContain('Feedback');
      expect(rowTexts[2]).toContain('Bugs');
      expect(rowTexts[3]).toContain('Other');
      expect(rowTexts[4]).toContain('Vulnerabilities');
      expect(rowTexts[4]).toContain('3');
    }, { screenshot: false });
  },
);
