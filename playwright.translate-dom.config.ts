import { defineConfig, devices } from '@playwright/test';

// Harness for `translate-dom:e2e:bench`. No dev server and no Supabase: the spec bundles the
// real components itself and serves them from a routed origin.

export default defineConfig({
  testDir: './e2e',
  testMatch: /translate-dom\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  use: { trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
