/**
 * Journey fixture for vigil: the fictional demo portfolio (e2e/fixtures), a
 * frozen clock, mocked APIs, and helpers that wait for the page to settle.
 * Contract: https://github.com/nitsuah/.github/blob/main/journeys/STANDARD.md
 */
import type { Page, Request } from '@playwright/test';
import { test as base, expect, step } from './journey';
import { prepare, signedInContext } from '../fixtures/demo-portfolio';

// /api requests in flight per page. waitForLoadState('networkidle') can't be
// used: it resolves at once after the first idle, but the dashboard prefetches
// repo details on staggered timers after the table renders.
const inflight = new WeakMap<Page, number>();

export const test = base.extend<{ demo: void }>({
  demo: [
    async ({ page }, use) => {
      inflight.set(page, 0);
      const isApi = (r: Request) => new URL(r.url()).pathname.startsWith('/api/');
      const done = (r: Request) => { if (isApi(r)) inflight.set(page, (inflight.get(page) ?? 1) - 1); };
      page.on('request', (r) => { if (isApi(r)) inflight.set(page, (inflight.get(page) ?? 0) + 1); });
      page.on('requestfinished', done);
      page.on('requestfailed', done);
      await prepare(page);
      await use();
    },
    { auto: true },
  ],
});
test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });

export { expect, step, signedInContext };

/** No /api request in flight for 500 ms, and web fonts loaded. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const deadline = Date.now() + 20_000;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    if ((inflight.get(page) ?? 0) > 0) quietSince = Date.now();
    else if (Date.now() - quietSince >= 500) return;
    await page.waitForTimeout(100);
  }
  throw new Error('settle: /api requests still in flight after 20 s');
}

/** Dashboard with every demo repo listed and its doc status loaded (desktop table). */
export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/');
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(4, { timeout: 60_000 });
  // The prefetched repo details replace each row's "synced 12h ago" with a docs icon.
  // `next dev` hydrates slowly in Docker, so give the staggered fetches time.
  await expect(rows.getByRole('button', { name: /^Docs healthy/ })).toHaveCount(4, { timeout: 30_000 });
  await settle(page);
}
