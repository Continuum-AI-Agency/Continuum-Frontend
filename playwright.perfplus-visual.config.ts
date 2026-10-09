import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// The Performance+ deep-test campaign's VISUAL lane (`perfplus:visual:bench`,
// docs/perfplus-campaign P1.3): every Performance+ surface audited by the L1V geometric
// detector (e2e/support/visualInvariants.ts) at 375 / 768 / 1280 / 1440, light and dark, in
// its loaded, empty and error states, as the Easy Fit owner, against PRODUCTION Supabase and
// the Backend the Frontend `.env` points at (the local :4000 in the campaign worktree).
//
// Its own harness, beside playwright.perfplus.config.ts (the L1 lane), because the campaign
// runs one headless browser per agent on its own port and its own Next dist dir. Port 3113
// is in the Backend CORS allowlist (Continuum-Backend/App/cors.ts).
//
// The Recorder envelope is printed by the spec; the `list` reporter prints after it, and the
// factory runner scans stdout upward for the last `{...counts...}` line.

loadProdSupabaseEnv();

const PORT = process.env.PERFPLUS_VISUAL_E2E_PORT ?? '3113';
// `localhost`, not 127.0.0.1: the Backend CORS allowlist names http://localhost:3113, and the
// session cookie domain is derived from this value.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

// 7 surfaces (+ the Optimizer's tabs and the portfolio detail) × 4 viewports × 2 themes, plus
// the empty and error states of three of them, each settling on live reads: hours, bounded.
const LANE_TIMEOUT_MS = 4 * 60 * 60_000;

export default defineConfig({
  testDir: './e2e',
  testMatch: /perfplus-l1v\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: LANE_TIMEOUT_MS,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    // A hover or click that cannot land is a finding, not a hang.
    actionTimeout: 30_000,
    // One long test: a trace would span everything. The evidence is a screenshot per audit
    // in e2e/__screenshots__/perfplus-l1v/ and the Recorder envelope, written by the spec.
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/perfplus-visual-e2e',
      NEXT_TSCONFIG_PATH: process.env.NEXT_TSCONFIG_PATH ?? 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
