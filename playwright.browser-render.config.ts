import { defineConfig, devices } from '@playwright/test';

// Browser-only rendering benches synthesize their page in Playwright and do not
// need the authenticated Next.js application server.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome-render',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
