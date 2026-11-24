/**
 * /metrics against the fixed demo overview (e2e/fixtures/demo-portfolio.ts):
 * scorecard, the three charts, URL-persisted filters. No database needed.
 */
import { test, expect } from '@playwright/test';
import { mockApi, signedInContext } from '../fixtures/demo-portfolio';

test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await signedInContext(page);
  await mockApi(page);
});

test('renders the scorecard, charts and repo breakdown', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/metrics');
  await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('region', { name: 'Weekly scorecard' })).toContainText('2026-W39');
  await expect(page.locator('[data-metric]')).toHaveCount(8);
  await expect(page.getByRole('img', { name: /^Burn-up/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Opened vs closed/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Merge lead time/ })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('skyview');
  expect(errors).toEqual([]);
});

test('filters live in the URL and survive a reload', async ({ page }) => {
  await page.goto('/metrics');
  await expect(page.getByRole('button', { name: 'bug', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'bug', exact: true }).click();
  await page.getByRole('group', { name: 'Author type' }).getByRole('button', { name: 'imp' }).click();
  await page.getByRole('button', { name: 'vigil', exact: true }).click();
  await page.getByLabel('Range').selectOption('26');
  await expect(page).toHaveURL(/label=bug/);
  await expect(page).toHaveURL(/repos=nitsuah%2Fvigil|repos=nitsuah\/vigil/);
  await expect(page).toHaveURL(/weeks=26/);
  await expect(page).toHaveURL(/authorType=imp/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'bug', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
  await expect(page.getByLabel('Range')).toHaveValue('26');
});
