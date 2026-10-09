import { test, expect, step, settle } from './vigil';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test(
  'phone user opens a repo card',
  { tag: ['@feature:responsive-design', '@feature:repository-tiers'] },
  async ({ page }) => {
    await step(page, 'open the dashboard on a phone', async () => {
      await page.goto('/');
      await expect(page.getByText('Drone services marketplace').locator('visible=true').first()).toBeVisible({ timeout: 60_000 });
      await settle(page);
    }, { docs: 'responsive-design' });

    await step(page, 'expand vigil', async () => {
      await page.getByRole('button', { name: 'Expand vigil card details' }).click();
      await expect(page.getByRole('button', { name: /Back to repo list/ })).toBeVisible();
      await expect(page.locator('#mobile-card-details-vigil').getByText('AI-assisted roadmap management')).toBeVisible();
      await settle(page);
    });
  },
);
