import path from 'path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Nightly journeys (e2e/journeys), DB-free like playwright.visual-docs.config.ts:
 *
 *   npm run test:journeys
 *
 * Baselines are Linux-only: generate them in the Playwright image the
 * workflow uses (.github/workflows/journeys.yml). Contract:
 * https://github.com/nitsuah/.github/blob/main/journeys/STANDARD.md
 */
const PORT = 3000;
const AUTH_ENV = {
  GITHUB_ID: 'journeys-dummy-id',
  GITHUB_SECRET: 'journeys-dummy-secret',
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'journeys-dummy-nextauth-secret',
  NEXTAUTH_URL: `http://localhost:${PORT}`,
  AUTH_TRUST_HOST: 'true',
};

// The specs mint session cookies with the same secret the server uses.
process.env.NEXTAUTH_SECRET = AUTH_ENV.NEXTAUTH_SECRET;

export default defineConfig({
  testDir: './e2e/journeys',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{testName}/{arg}{ext}',
  // A missing baseline fails in CI instead of being silently written.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0, // pass-on-retry = flaky, not an issue
  timeout: 120_000,
  reporter: [['list'], ['json', { outputFile: path.resolve(__dirname, 'journeys-report/report.json') }]],
  expect: {
    toHaveScreenshot: {
      // vigil renders DOM text only (no canvas): 0 px of noise across a 3x18-run
      // soak, while one changed letter in a row description is 66 px. Measure
      // before loosening it (fire needs 1000 for canvas emoji noise).
      maxDiffPixels: 20,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: AUTH_ENV,
  },
});
