import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3110';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'vercel-runtime.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: '../node_modules/.bin/next start --port 3110',
    env: {
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? '.next',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
