import { test, expect, step, signedInContext, settle } from './vigil';

test(
  'owner reviews open work across the portfolio',
  { tag: ['@feature:pmo-mode-dashboard', '@feature:cross-repo-task-rollup', '@feature:workflow-pipeline-stage-indicator'] },
  async ({ page }) => {
    await step(page, 'open PMO', async () => {
      await signedInContext(page);
      await page.goto('/pmo');
      await expect(page.getByText('Portfolio Pipeline')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('4 repos · 24 items')).toBeVisible();
      await expect(page.getByText('Bring the marketplace backend live in production')).toBeVisible();
      await settle(page);
    }, { docs: 'pmo-mode-dashboard' });

    await step(page, 'include P2 work', async () => {
      await expect(page.getByText('Set up the email sending domain')).toHaveCount(0);
      await page.getByRole('button', { name: /^P2 \d+$/ }).click();
      await expect(page.getByText('Set up the email sending domain')).toBeVisible();
    }, { docs: 'cross-repo-task-rollup' });
  },
);

test(
  'owner sees which repo uses which, and what an agent proposed',
  { tag: ['@feature:cross-repo-relationship-map'] },
  async ({ page }) => {
    await step(page, 'open the relationship map', async () => {
      await signedInContext(page);
      await page.goto('/pmo');
      await expect(page.getByText('3 confirmed · 1 proposed')).toBeVisible({ timeout: 60_000 });
      await settle(page);
      await page.getByText('3 confirmed · 1 proposed').scrollIntoViewIfNeeded();
      await expect(page.getByText('proposed by agent')).toBeVisible();
      await expect(page.getByText('Reads the visual-docs CI recipe', { exact: true })).toBeVisible();
    }, { docs: 'cross-repo-relationship-map' });
  },
);
