import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Lane E reuses the campaign's existing lanes (perfplus L1 / L1V, home overview) against the ONE
// dev server lane E already runs (LANE_E_BASE_URL), instead of each lane's own webServer — whose
// fixed dist dirs would make Next rewrite a tracked tsconfig in the shared checkout.
loadProdSupabaseEnv();
const baseURL = process.env.LANE_E_BASE_URL ?? 'http://localhost:3116';
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: (process.env.LANE_E_REUSE ?? 'perfplus-l1\\.bench\\.spec\\.ts')
    .split(',')
    .map((pattern) => new RegExp(pattern)),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 3_600_000,
  expect: { timeout: 60_000 },
  outputDir: process.env.LANE_E_OUTPUT_DIR ?? 'test-results/laneE-reuse',
  use: { baseURL, trace: 'off', video: 'off', ...benchBrowserChannel() },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
});
