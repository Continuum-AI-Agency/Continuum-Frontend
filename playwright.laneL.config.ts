import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Deep test 2026-10-31, lane L (Ramiro's decision 1, PP-DT-C-signout-ends-every-device): Sign out
// ends only this browser, measured on two minted sessions of the bench owner against production
// Supabase. It never confirms "Sign out of all devices": on a shared real identity that would end
// every other session. The dev server is started OUTSIDE this config, on the one port the API's
// CORS allows and a dist dir tsconfig.json already lists (so Next never rewrites a tracked file):
//   NEXT_DIST_DIR=.next-qa PORT=3116 bun run dev
//   LANE_L_BASE_URL=http://localhost:3116 bunx playwright test -c playwright.laneL.config.ts

loadProdSupabaseEnv();

const baseURL = process.env.LANE_L_BASE_URL ?? 'http://localhost:3116';
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e/laneL',
  testMatch: /\.laneL\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 600_000,
  expect: { timeout: 30_000 },
  outputDir: process.env.LANE_L_OUTPUT_DIR ?? 'test-results/laneL',
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 120_000,
    ...devices['Desktop Chrome'],
    ...benchBrowserChannel(),
  },
});
