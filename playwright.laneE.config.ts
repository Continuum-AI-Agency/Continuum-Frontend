import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Deep test 2026-10-31, lane E: the features that landed after the 10-27 deep tests, and the
// 10-27 hops production stalled on. Read-only against production Supabase and the DEPLOYED
// Backend. The dev server is started OUTSIDE this config (one server, its own port and a dist
// dir already listed in tsconfig.json, so Next never rewrites a tracked file):
//   LANE_E_BASE_URL=http://localhost:3116 (the only port of 3116–3119 the API's CORS allows)

loadProdSupabaseEnv();

const baseURL = process.env.LANE_E_BASE_URL ?? 'http://localhost:3116';
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e/laneE',
  testMatch: /\.laneE\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 3_600_000,
  expect: { timeout: 30_000 },
  outputDir: process.env.LANE_E_OUTPUT_DIR ?? 'test-results/laneE',
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
