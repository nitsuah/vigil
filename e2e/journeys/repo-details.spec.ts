import { test, expect, step, openDashboard, settle } from './vigil';

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
  },
);
