import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    // A pre-installed Chromium (sandboxes without network access to download browsers).
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Auto-start the frontend for the tests. Locally this reuses a server you
  // already have running; in CI it boots a fresh one. The backend (plus its
  // DB/Redis) must be running separately — see the `e2e` CI job.
  webServer: {
    // Pin to 3000 explicitly — `next dev` honors a stray PORT env var, and the
    // backend uses 3001, so we don't want them to collide.
    command: process.env.CI ? 'npm run start -- -p 3000' : 'npm run dev -- -p 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
