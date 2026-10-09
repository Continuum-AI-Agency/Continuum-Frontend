import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// The Performance+ deep-test campaign's CHAOS CRAWLER (`perfplus:crawler:bench`,
// docs/perfplus-campaign P2.1): seeded random traversals over every Performance+ surface with
// the L1 invariants (e2e/support/l1Invariants.ts) read after every action and the L1V
// detector (e2e/support/visualInvariants.ts) read at the end of each traversal, as the Easy
// Fit owner, against PRODUCTION Supabase and the Backend the Frontend `.env` points at (the
// local :4000 in the campaign worktree).
//
// Its own harness, beside playwright.perfplus.config.ts (L1) and
// playwright.perfplus-visual.config.ts (L1V), because the campaign runs one headless browser
// per agent on its own port and its own Next dist dir. Port 3116 is in the Backend CORS
// allowlist (Continuum-Backend/App/cors.ts).
//
// Knobs (all env, all optional):
//   PERFPLUS_CRAWL_SEED               the campaign seed (default 20261009)
//   PERFPLUS_CRAWL_RUNS               traversals per surface (default 25)
//   PERFPLUS_CRAWL_SURFACE_BUDGET_MS  wall-clock per surface; the default keeps the default
//                                     run under 25 minutes (traversals beyond it are SKIP by name)
//   PERFPLUS_CRAWL_ONLY               one surface, by name (replay)
//   PERFPLUS_CRAWL_RUN                one traversal index of that surface (replay)
//
// The Recorder envelope is printed by the spec; the `list` reporter prints after it, and the
// factory runner scans stdout upward for the last `{...counts...}` line.

loadProdSupabaseEnv();

const PORT = process.env.PERFPLUS_CRAWLER_E2E_PORT ?? '3116';
// `localhost`, not 127.0.0.1: the Backend CORS allowlist names http://localhost:3116, and the
// session cookie domain is derived from this value.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

/** The default run is bounded to ~25 min by the per-surface budget; an overnight run raises
 *  PERFPLUS_CRAWL_RUNS and PERFPLUS_CRAWL_SURFACE_BUDGET_MS and needs this ceiling. */
const LANE_TIMEOUT_MS = 6 * 60 * 60_000;

export default defineConfig({
  testDir: './e2e',
  testMatch: /perfplus-crawler\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: LANE_TIMEOUT_MS,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    // A click that cannot land within this is a `click-unreachable` finding for the row,
    // never a hang: the crawler takes hundreds of actions per run.
    actionTimeout: 8_000,
    // One long test: a trace would span everything. The evidence is a screenshot per FAIL
    // row in e2e/__screenshots__/perfplus-crawler/<seed>-<n>.png and the Recorder envelope.
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/perfplus-crawler-e2e',
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
