import { defineConfig, devices } from '@playwright/test';

/**
 * Post-deploy smoke config -- targets an already-running site, no local server:
 *
 *   SMOKE_URL=https://gh-vigil.netlify.app npx playwright test -c playwright.smoke.config.ts
 */
export default defineConfig({
  testDir: './e2e/smoke',
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.SMOKE_URL ?? 'https://gh-vigil.netlify.app',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
