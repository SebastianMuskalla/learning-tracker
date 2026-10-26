import { defineConfig, devices } from '@playwright/test';

// Browser tests against the production build (`pnpm build` first). GitHub is replaced by a fake
// in e2e/fakeGithub.ts, so the tests need no network and no token.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : 'github',
  use: {
    baseURL: 'http://[::1]:4173/learning-tracker/',
    trace: 'retain-on-failure',
    // On WSL2, the GPU process of Chromium connects to the WSLg Wayland socket and can wait 20 to
    // 100 s for an answer before the first frame. The headless browser never needs Wayland.
    launchOptions: { env: { ...process.env, WAYLAND_DISPLAY: 'none' } },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Before the start, Playwright checks if a server already answers at `url`. With WSL2 mirrored
  // networking, a connection to a closed port on 127.0.0.1 gets no answer, and that check waits
  // 130 s for the TCP timeout. A closed port on ::1 refuses at once, so the server uses ::1 only.
  webServer: {
    command: 'pnpm preview --host ::1 --port 4173 --strictPort',
    url: 'http://[::1]:4173/learning-tracker/',
    reuseExistingServer: process.env['CI'] === undefined,
  },
});
