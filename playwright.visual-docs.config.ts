import { defineConfig, devices } from '@playwright/test';

/**
 * README screenshots (docs/screenshots/*.png), DB-free like playwright.ci.config.ts:
 *
 *   npx playwright test -c playwright.visual-docs.config.ts
 *
 * Run by .github/workflows/visual-docs.yml; see docs/VISUAL_DOCS.md.
 */
const PORT = 3000;
const AUTH_ENV = {
  GITHUB_ID: 'visual-docs-dummy-id',
  GITHUB_SECRET: 'visual-docs-dummy-secret',
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'visual-docs-dummy-nextauth-secret',
  NEXTAUTH_URL: `http://localhost:${PORT}`,
  AUTH_TRUST_HOST: 'true',
};

// The spec mints session cookies with the same secret the server uses.
process.env.NEXTAUTH_SECRET = AUTH_ENV.NEXTAUTH_SECRET;

export default defineConfig({
  testDir: './e2e/visual-docs',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: AUTH_ENV,
  },
});
