/**
 * DB-free Playwright coverage: every /api call the dashboard makes is mocked,
 * so this suite needs only a running Next server (dummy auth env is enough).
 * That is what lets it run in CI (see playwright.ci.config.ts and
 * .github/workflows/e2e.yml). The live-API suite in e2e/dashboard.spec.ts
 * still needs a real database and is run locally.
 *
 * Covers what nothing else did: expanding a repo row (the page used to crash
 * outright), and the repo-chat auth boundary end to end in a real browser.
 */
import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { encode } from 'next-auth/jwt';

/**
 * Deliberately shaped like the production payload that crashed the dashboard:
 * Postgres NUMERIC values arrive as STRINGS ("8.25"), not numbers.
 */
const REPO = {
  id: 'repo-1',
  name: 'demo-repo',
  full_name: 'acme/demo-repo',
  description: 'A demo repo used by the DB-free e2e suite',
  language: 'TypeScript',
  stars: 3,
  forks: 1,
  open_issues: 0,
  open_prs: 0,
  branches_count: 2,
  url: 'https://github.com/acme/demo-repo',
  homepage: null,
  topics: [],
  is_fork: false,
  is_hidden: false,
  is_archived: false,
  repo_type: 'web-app',
  health_score: 91,
  total_loc: 12345,
  loc_language_breakdown: { TypeScript: 12345 },
  contributor_count: 2,
  bus_factor: 1,
  commit_frequency: '12.5',
  avg_pr_merge_time_hours: '21.7',
  token_density: '8.25',
  comment_to_code_ratio: '0.18',
  coverage_score: '83.34',
  ci_status: 'passing',
  last_commit_date: '2026-09-01T00:00:00Z',
  last_synced: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

const DETAILS = {
  repo: REPO,
  tasks: [],
  roadmapItems: [],
  metrics: [],
  features: [],
  docStatuses: [],
  bestPractices: [],
  communityStandards: [],
  securityConfig: null,
};

async function mockApi(target: Page | BrowserContext): Promise<void> {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await target.route('**/api/repos?*', (route) => route.fulfill(json([REPO])));
  await target.route('**/api/repo-details/*/trend', (route) => route.fulfill(json({ success: true, snapshots: [] })));
  await target.route('**/api/repo-details/*', (route) => route.fulfill(json(DETAILS)));
  await target.route('**/api/relationships', (route) => route.fulfill(json({ relationships: [], kinds: {} })));
  await target.route('**/api/gemini-status', (route) => route.fulfill(json({ status: 'ok' })));
  await target.route('**/api/github-rate-limit', (route) => route.fulfill(json({ core: { remaining: 5000, limit: 5000, reset: 0 } })));
}

/** Collects uncaught page exceptions so tests can assert the page never threw. */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** A real Auth.js session cookie -- no GitHub OAuth handshake needed. */
async function authenticatedContext(browser: Browser): Promise<BrowserContext> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET must be set for the e2e server and tests');

  const sessionToken = await encode({
    token: { name: 'E2E Test User', email: 'e2e-test@example.com', sub: 'e2e-test-user' },
    secret,
    salt: 'authjs.session-token',
  });

  const context = await browser.newContext();
  await context.addCookies([
    { name: 'authjs.session-token', value: sessionToken, domain: 'localhost', path: '/' },
  ]);
  return context;
}

test.describe('Repo row expansion', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('expanding a row shows its details and the page survives (NUMERIC strings)', async ({ page }) => {
    const pageErrors = trackPageErrors(page);
    await mockApi(page);

    await page.goto('/');
    const row = page.locator('table tbody tr').first();
    await expect(row).toContainText('demo-repo', { timeout: 30000 });

    await row.locator('td').nth(1).click();

    // The details render (this is where token_density.toFixed used to throw)
    await expect(page.getByRole('heading', { name: 'Repository Stats' })).toBeVisible({ timeout: 15000 });
    // Scoped to the desktop table: the hidden mobile card renders the same text.
    await expect(page.locator('table').getByText(/8\.[23] tok\/line/)).toBeVisible();
    await expect(page.locator('table').getByText('18%')).toBeVisible();

    // ...and the dashboard itself is still standing.
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText(/this page couldn.t load/i)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('a row can be collapsed and expanded again', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    const row = page.locator('table tbody tr').first();
    await expect(row).toContainText('demo-repo', { timeout: 30000 });

    const cell = row.locator('td').nth(1);
    await cell.click();
    await expect(page.getByRole('heading', { name: 'Repository Stats' })).toBeVisible({ timeout: 15000 });
    await cell.click();
    await expect(page.getByRole('heading', { name: 'Repository Stats' })).toHaveCount(0);
    await cell.click();
    await expect(page.getByRole('heading', { name: 'Repository Stats' })).toBeVisible();
  });
});

test.describe('Repo chat authentication boundary (browser)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('signed out: repo rows render but the chat option does not exist', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.locator('table tbody tr').first()).toContainText('demo-repo', { timeout: 30000 });
    await expect(page.locator('[data-tour="repo-chat"]')).toHaveCount(0);
  });

  test('signed in: the chat option appears on every repo row', async ({ browser }) => {
    const context = await authenticatedContext(browser);
    await mockApi(context);
    const page = await context.newPage();
    const pageErrors = trackPageErrors(page);

    await page.goto('/');
    await expect(page.locator('table tbody tr').first()).toContainText('demo-repo', { timeout: 30000 });
    await expect(page.locator('[data-tour="repo-chat"]').first()).toBeVisible({ timeout: 15000 });
    expect(pageErrors).toEqual([]);
    await context.close();
  });

  test('signing out removes the chat option and restores the sign-in prompt', async ({ browser }) => {
    const context = await authenticatedContext(browser);
    await mockApi(context);
    const page = await context.newPage();

    await page.goto('/');
    await expect(page.locator('[data-tour="repo-chat"]').first()).toBeVisible({ timeout: 30000 });

    await context.clearCookies();
    await page.reload();

    await expect(page.locator('table tbody tr').first()).toContainText('demo-repo', { timeout: 30000 });
    await expect(page.locator('[data-tour="repo-chat"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
    await context.close();
  });

  test('the chat API rejects an unauthenticated caller with 401', async ({ request }) => {
    const res = await request.post('/api/repos/demo-repo/chat', {
      data: { messages: [{ role: 'user', content: 'hello' }] },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });
});
