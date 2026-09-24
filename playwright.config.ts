import { defineConfig, devices } from '@playwright/test';

// Browser tests against the production build (`pnpm build` first). GitHub is replaced by a fake
// in e2e/fakeGithub.ts, so the tests need no network and no token.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : 'github',
  use: {
    baseURL: 'http://localhost:4173/learning-tracker/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173/learning-tracker/',
    reuseExistingServer: process.env['CI'] === undefined,
  },
});
