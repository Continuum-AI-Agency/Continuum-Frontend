import { defineConfig, devices } from '@playwright/test';

// Harness for `organic:session-content:e2e:bench`. No webServer on purpose: the spec starts its
// own hosted-targeted Next app and Backend AFTER loadProdSupabaseEnv(), because a config-level
// webServer boots before the spec loads and would read .env.local's local stack instead
// (the same reason organic-ship.bench.spec.ts spawns its own).
export default defineConfig({
  testDir: './e2e',
  testMatch: /session-content\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 900_000,
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
