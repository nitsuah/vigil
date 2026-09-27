import { defineConfig, devices } from '@playwright/test';

/**
 * Promo capture: the real app under `next dev`, every /api call mocked from
 * promo/demo-seed.ts (see promo/capture.spec.ts). Run by promo/pipeline.sh.
 */
const PORT = 3000;
const AUTH_ENV = {
    GITHUB_ID: 'promo-dummy-id',
    GITHUB_SECRET: 'promo-dummy-secret',
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'promo-dummy-nextauth-secret',
    NEXTAUTH_URL: `http://localhost:${PORT}`,
    AUTH_TRUST_HOST: 'true',
};
process.env.NEXTAUTH_SECRET = AUTH_ENV.NEXTAUTH_SECRET;

export default defineConfig({
    testDir: '.',
    testMatch: 'capture.spec.ts',
    workers: 1,
    timeout: 180_000,
    reporter: 'list',
    use: { baseURL: `http://localhost:${PORT}` },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'npm run dev',
        cwd: '..',
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: AUTH_ENV,
    },
});
