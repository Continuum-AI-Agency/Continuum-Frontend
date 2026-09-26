import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Dedicated harness for `scale:campaigns:e2e:bench` — the Scale page's Campaigns tab and its
// human-in-the-loop Pause / Unpause, end to end.
//
// Same reasons as `playwright.jaina-canvas.config.ts`:
//
//  1. PRODUCTION Supabase: the rows this bench lists are a real ad account's campaigns, read
//     through the deployed `paid-media-reporting` edge function, which exists nowhere else.
//     `loadProdSupabaseEnv()` pins the Supabase env to prod and fails fast before the dev
//     server spawns, so it cannot fall back to the local stack `.env.local` points at.
//  2. Its own port, dist dir and output dir, one worker — it must never share a dev server or
//     a trace directory with another agent's bench.
//  3. The approval gate is opened by the Backend the spec spawns on a private port (the
//     working tree's `operator_action`), so `NEXT_PUBLIC_API_URL` is pinned here.

loadProdSupabaseEnv();

const PORT = process.env.SCALE_CAMPAIGNS_E2E_PORT ?? '3119';
const BACKEND_PORT = process.env.SCALE_CAMPAIGNS_BENCH_BACKEND_PORT ?? '4423';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const backendURL = `http://127.0.0.1:${BACKEND_PORT}`;

process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.SCALE_CAMPAIGNS_BENCH_BACKEND_PORT = BACKEND_PORT;
process.env.NEXT_PUBLIC_API_URL = backendURL;
process.env.API_URL = backendURL;
// The spawned Backend inherits this env. Job workers on a bench process would claim
// production queue work that belongs to the deployed Backend.
process.env.MCP_JOB_WORKER_ENABLED = 'false';
process.env.BRAND_REPORT_JOB_WORKER_ENABLED = 'false';
// EVERY loop that claims other brands' production work — queues, automations, the
// scheduled-publish poller that posts real clients' due posts.
process.env.BACKGROUND_WORKERS_ENABLED = 'false';
process.env.JAINA_REPORT_ARTIFACT_WORKER_ENABLED = 'false';

export default defineConfig({
  testDir: './e2e',
  testMatch: /scale-campaigns\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  outputDir: '.playwright/scale-campaigns',
  // Two gates opened and denied through a real Backend, plus a first compile of /scale.
  timeout: 540_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/scale-campaigns-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_API_URL: backendURL,
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
