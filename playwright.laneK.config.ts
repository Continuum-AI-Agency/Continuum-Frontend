import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Deep test 2026-10-31, lane K (the remaining Frontend items): the probes that check its fixes in the
// real app. Read-only against production Supabase and the DEPLOYED Backend, through lane E's
// harness (e2e/laneE/support.ts: minted sessions, a brand pin, the write guard, revoke at the end).
// The dev server is started OUTSIDE this config, on the one port the API's CORS allows and a dist
// dir tsconfig.json already lists (so Next never rewrites a tracked file):
//   NEXT_DIST_DIR=.next-qa bun run --bun next dev --turbopack -p 3116
//   LANE_K_BASE_URL=http://localhost:3116 bunx playwright test -c playwright.laneK.config.ts

loadProdSupabaseEnv();

const baseURL = process.env.LANE_K_BASE_URL ?? 'http://localhost:3116';
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e/laneK',
  testMatch: /\.laneK\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 1_800_000,
  expect: { timeout: 30_000 },
  outputDir: process.env.LANE_K_OUTPUT_DIR ?? 'test-results/laneK',
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 120_000,
    ...devices['Desktop Chrome'],
    ...benchBrowserChannel(),
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        ...benchBrowserChannel(),
        actionTimeout: 20_000,
        navigationTimeout: 120_000,
      },
    },
  ],
});
