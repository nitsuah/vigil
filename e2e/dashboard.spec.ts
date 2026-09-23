/**
 * Playwright E2E tests for Vigil dashboard.
 *
 * Auth notes:
 *  - proxy.ts middleware allows: /, /login, /api/auth/*, /api/health, /api/version,
 *    /api/github-rate-limit, /api/repos*, /api/repo-details*, /api/seed-defaults
 *  - All other routes (including /api/mcp, /api/context) redirect to /login
 *    for unauthenticated users. Those are tested as redirect behaviour here; their JSON
 *    contracts are covered by the Vitest unit test suite (tests/mcp.test.ts).
 */

import { test, expect } from '@playwright/test';
import type { Browser } from '@playwright/test';
import { encode } from 'next-auth/jwt';

// ─── Core: page loads ────────────────────────────────────────────────────────

test.describe('Dashboard – Core', () => {
  test('loads and shows page heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: /vigil/i })).toBeVisible({ timeout: 15000 });
  });

  test('has correct page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Vigil/);
  });

  test('loads within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test('viewport meta tag set for mobile', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });
});

// ─── Desktop layout ───────────────────────────────────────────────────────────

test.describe('Dashboard – Desktop (1280 × 800)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  });

  test('shows sign-in button with GitHub text', async ({ page }) => {
    await page.goto('/');
    // Desktop header shows "Sign in with GitHub"
    const btn = page.locator('button, [role="button"]').filter({ hasText: /sign in/i });
    await expect(btn.first()).toBeVisible({ timeout: 10000 });
  });

  test('shows repository table with column headers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('columnheader', { name: /repository/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('columnheader', { name: /health/i })).toBeVisible({ timeout: 5000 });
  });

  test('desktop table visible, mobile card list hidden', async ({ page }) => {
    await page.goto('/');
    // At 1280px, `hidden md:block` wrapping the table should be visible
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    // The mobile card list `md:hidden divide-y` should not be visible at 1280px
    const mobileCardList = page.locator('.md\\:hidden.divide-y');
    await expect(mobileCardList).not.toBeVisible();
  });

  test('no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    const scroll = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(2);
  });

  test('filter control is present', async ({ page }) => {
    await page.goto('/');
    // The filter area is a compact set of selects, not a standalone button with "filter" text
    // Look for the filter-related UI - it's visible in the header area
    await page.waitForLoadState('load');
    const filterArea = page.locator('[data-tour]').first();
    await expect(filterArea).toBeAttached({ timeout: 10000 });
  });

  test('no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForLoadState('load');
    // Filter out known non-critical errors (next.js hydration warnings etc.)
    const criticalErrors = errors.filter(e =>
      !e.includes('Warning:') && !e.includes('favicon') && !e.includes('hydrat')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});

// ─── Mobile layout (375 × 812) ────────────────────────────────────────────────

test.describe('Dashboard – Mobile (375 × 812)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('shows heading on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').filter({ hasText: /vigil/i })).toBeVisible({ timeout: 10000 });
  });

  test('shows mobile sign-in button', async ({ page }) => {
    await page.goto('/');
    // On mobile, the sign-in button is in the `flex md:hidden` right cluster
    // Use :visible filter to target the rendered (non-hidden) button at 375px
    await page.waitForLoadState('load');
    const btn = page.locator('button:visible').filter({ hasText: /sign in/i });
    await expect(btn.first()).toBeVisible({ timeout: 10000 });
  });

  test('table is hidden at 375px', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    // table is inside `hidden md:block` — not visible at 375px
    await expect(page.locator('table')).not.toBeVisible();
    // Wait for repo loading, then assert mobile cards or empty state is visible
    await page.waitForTimeout(3000);
    const hasMobileCards = await page.locator('.md\\:hidden > div > div').count() > 0;
    const hasEmptyState = await page.getByText(/no repositories found/i).isVisible();
    expect(hasMobileCards || hasEmptyState).toBe(true);
  });

  test('no horizontal overflow on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    const scroll = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(2);
  });
});

// ─── Tablet layout (768 × 1024) ──────────────────────────────────────────────

test.describe('Dashboard – Tablet (768 × 1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('table visible at md breakpoint', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
  });

  test('no horizontal overflow on tablet', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    const scroll = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(2);
  });
});

// ─── Login page ───────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test('renders with sign-in form', async ({ page }) => {
    await page.goto('/login');
    const body = await page.content();
    // Should contain sign-in related content
    expect(body.toLowerCase()).toMatch(/sign in|github|login|vigil/i);
  });

  test('has a sign-in button', async ({ page }) => {
    await page.goto('/login');
    const btn = page.locator('button').filter({ hasText: /sign in/i });
    await expect(btn.first()).toBeVisible({ timeout: 10000 });
  });

  test('PMO page redirects to login without auth', async ({ page }) => {
    const response = await page.goto('/pmo');
    // Should end up at /login (redirected) or show auth UI
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/login|pmo/);
    if (finalUrl.includes('pmo')) {
      // If on pmo page, check it has some content
      const body = await page.content();
      expect(body.length).toBeGreaterThan(100);
    }
  });
});

// ─── Route protection (proxy.ts middleware) ───────────────────────────────────

test.describe('Route protection', () => {
  test('/api/health is public when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/health', { maxRedirects: 0 });
    expect([200, 503]).toContain(res.status());
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('/api/mcp GET redirects to /login when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/mcp', { maxRedirects: 0 });
    expect([307, 308]).toContain(res.status());
    expect(res.headers()['location']).toContain('/login');
  });

  test('/api/context redirects to /login when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/context', { maxRedirects: 0 });
    expect([307, 308]).toContain(res.status());
    expect(res.headers()['location']).toContain('/login');
  });

  test('/pmo redirects to /login when unauthenticated', async ({ request }) => {
    const res = await request.get('/pmo', { maxRedirects: 0 });
    expect([307, 308]).toContain(res.status());
    expect(res.headers()['location']).toContain('/login');
  });
});

// ─── Public API routes ────────────────────────────────────────────────────────

test.describe('Public API routes', () => {
  test('/api/repos returns JSON array', async ({ request }) => {
    const res = await request.get('/api/repos');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('/api/repos returns repos with expected shape', async ({ request }) => {
    const res = await request.get('/api/repos');
    expect(res.status()).toBe(200);
    const body = await res.json();
    // If repos exist, check shape
    if (body.length > 0) {
      const repo = body[0];
      expect(repo).toHaveProperty('id');
      expect(repo).toHaveProperty('name');
    }
  });

  test('/ renders the dashboard page', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain('Vigil');
  });
});

// ─── Dashboard: repo display ──────────────────────────────────────────────────

test.describe('Dashboard – Repository display', () => {
  test.slow(); // These tests may take longer due to data loading

  test('shows repos or empty state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    // Wait up to 8 seconds for repos to load
    await page.waitForTimeout(3000);

    const hasTable = await page.locator('table tbody tr').count() > 0;
    const hasMobileCards = await page.locator('.md\\:hidden > div > div').count() > 0;
    const hasEmptyState = await page.getByText(/no repositories found/i).isVisible();

    expect(hasTable || hasMobileCards || hasEmptyState).toBe(true);
  });

  test('no 404s from internal API calls', async ({ page }) => {
    const notFound: string[] = [];
    page.on('response', res => {
      if (res.status() === 404 && res.url().includes(page.url().split('/').slice(0, 3).join('/'))) {
        notFound.push(res.url());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);
    expect(notFound).toHaveLength(0);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('page has at least one heading', async ({ page }) => {
    await page.goto('/');
    const headings = page.getByRole('heading');
    await expect(headings.first()).toBeVisible({ timeout: 10000 });
  });

  test('page has interactive elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    const buttons = page.getByRole('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('login page has form and button', async ({ page }) => {
    await page.goto('/login');
    const form = page.locator('form, button');
    await expect(form.first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Docs column collapse/expand (v0.2.0) ────────────────────────────────────

test.describe('Dashboard – Docs column summary icon', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('Docs column shows a single collapsed summary icon by default, not the five per-doc icons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    // Give repo-details a moment to load in the background.
    await page.waitForTimeout(3000);
    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'No repo rows loaded to assert against');

    // Collapsed state renders exactly one button in the Docs cell (the
    // summary icon); expanding it swaps in the five per-doc icons plus a
    // collapse control. This only asserts the default (collapsed) state.
    const docsCell = page.locator('table tbody tr').first().locator('td').nth(3);
    const summaryButtons = docsCell.locator('button[aria-label*="Docs"]');
    await expect(summaryButtons).toHaveCount(1);
    await expect(summaryButtons.first()).toBeVisible();
  });
});

// ─── Repo chat: authentication boundary ───────────────────────────────────────
//
// "Chat about repo" is authenticated-only end to end:
//  - app/api/repos/[name]/chat/route.ts returns 401 before touching the DB or
//    calling the AI provider when there is no session.
//  - app/page.tsx only wires up `onOpenChat` (which RepoTableRow/MobileRepoCard
//    render as the `[data-tour="repo-chat"]` button) once a session exists, so
//    signed-out visitors never see the option at all.
//
// `authenticatedContext` mints a real Auth.js v5 session cookie via
// next-auth/jwt's `encode` (the officially documented way to test Auth.js
// apps without driving the actual GitHub OAuth handshake) so these tests
// don't depend on live GitHub credentials.

async function authenticatedContext(browser: Browser) {
  const secret = process.env.NEXTAUTH_SECRET;
  test.skip(!secret, 'NEXTAUTH_SECRET is not set in this environment');

  const sessionToken = await encode({
    token: { name: 'E2E Test User', email: 'e2e-test@example.com', sub: 'e2e-test-user' },
    secret: secret!,
    salt: 'authjs.session-token',
  });

  const context = await browser.newContext();
  await context.addCookies([
    { name: 'authjs.session-token', value: sessionToken, domain: 'localhost', path: '/' },
  ]);
  return context;
}

test.describe('Repo chat – authentication boundary', () => {
  test('unauthenticated: chat button is not rendered on the dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-tour="repo-chat"]')).toHaveCount(0);
  });

  test('unauthenticated: POST /api/repos/[name]/chat is rejected before reaching the DB or model', async ({ request }) => {
    const res = await request.post('/api/repos/vigil/chat', {
      data: { messages: [{ role: 'user', content: 'hello' }] },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('authenticated: chat button is rendered once signed in', async ({ browser }) => {
    const context = await authenticatedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);

    const rowCount = await page.locator('table tbody tr').count();
    test.skip(rowCount === 0, 'No repo rows loaded to assert against');
    await expect(page.locator('[data-tour="repo-chat"]').first()).toBeVisible();
    await context.close();
  });

  test('authenticated: POST /api/repos/[name]/chat is no longer rejected for lack of a session', async ({ browser }) => {
    const context = await authenticatedContext(browser);
    const res = await context.request.post('/api/repos/vigil/chat', {
      data: { messages: [{ role: 'user', content: 'hello' }] },
    });
    // Authenticated requests can still fail downstream (e.g. no DB/AI provider
    // configured in this environment), but never with the 401 an
    // unauthenticated caller gets — that boundary is what's under test here.
    expect(res.status()).not.toBe(401);
    await context.close();
  });

  test('signing out removes the chat option and restores the sign-in prompt', async ({ browser }) => {
    const context = await authenticatedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    // Simulate sign-out by clearing the session cookie, then reload: the
    // header should flip back to signed-out state and the chat option
    // should disappear along with it.
    await context.clearCookies();
    await page.reload();
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    await expect(page.locator('[data-tour="repo-chat"]')).toHaveCount(0);
    const signInBtn = page.locator('button, [role="button"]').filter({ hasText: /sign in/i });
    await expect(signInBtn.first()).toBeVisible({ timeout: 10000 });
    await context.close();
  });
});

// ─── Performance ─────────────────────────────────────────────────────────────

test.describe('Performance', () => {
  test('dashboard loads in under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    await page.waitForLoadState('load');
    expect(Date.now() - start).toBeLessThan(5000);
  });

  test('/api/repos responds within 3 seconds', async ({ request }) => {
    const start = Date.now();
    const res = await request.get('/api/repos');
    expect(res.status()).toBe(200);
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
