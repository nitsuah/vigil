import { test, expect, step, openDashboard, settle } from './vigil';

test(
  'visitor sees every repo graded and sorts by health',
  { tag: ['@feature:modern-dashboard', '@feature:health-scoring', '@feature:repository-tiers', '@feature:ci-cd-status', '@feature:filtering-sorting'] },
  async ({ page }) => {
    await step(page, 'open the dashboard', async () => {
      await openDashboard(page);
      const vigil = page.locator('table tbody tr', { hasText: 'Portfolio health dashboard' });
      await expect(vigil).toContainText('T1');
      await expect(vigil).toContainText('A');
    }, { docs: 'modern-dashboard' });

    await step(page, 'sort the healthiest repo to the top', async () => {
      // The button's name gains the sort arrow ("Health ↑") after a click, so locate it by its column.
      const health = page.locator('thead th', { hasText: /^Health/ }).getByRole('button');
      await health.click(); // ascending
      await health.click(); // descending
      await expect(page.locator('th[aria-sort="descending"]')).toContainText('Health');
      await expect(page.locator('table tbody tr').first()).toContainText('vigil');
      await expect(page.locator('table tbody tr').last()).toContainText('skyview');
      await settle(page);
    }, { docs: 'filtering-sorting' });
  },
);
