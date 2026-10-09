import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// The Performance+ deep-test campaign's UI lane (`perfplus:ui:bench`, docs/perfplus-campaign
// P1.2): every Performance+ surface opened with the L1 invariants attached
// (e2e/support/l1Invariants.ts), as the Easy Fit owner, against PRODUCTION Supabase and the
// Backend the Frontend `.env` points at (NEXT_PUBLIC_API_URL — the local :4000 in the campaign
// worktree).
//
// Its own harness, like playwright.optimizer.config.ts, because:
//   1. loadProdSupabaseEnv() pins the prod project BEFORE the dev server spawns and fails fast
//      if the env does not resolve to it — a run against the local stack proves nothing.
//   2. The campaign runs one headless browser per agent (01-method.md, "Orquestación"): its own
//      port, its own Next dist dir, one worker. Port 3112 is in the Backend CORS allowlist.
//
// The Recorder envelope is printed by the spec's afterAll; the `list` reporter prints after
// it, and the factory runner scans stdout upward for the last `{...counts...}` line.

loadProdSupabaseEnv();

const PORT = process.env.PERFPLUS_E2E_PORT ?? '3112';
// `localhost`, not 127.0.0.1: the Backend CORS allowlist (Continuum-Backend/App/cors.ts) names
// http://localhost:3112, and the session cookie domain is derived from this value.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /perfplus-l1\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // The dev server compiles each route on its first hit and the surfaces read live Meta data
  // through the edge functions. Bounded: a hang is a failure, not a wait.
  timeout: 300_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    // A click that cannot land (covered, detached, off-screen) is a finding, not a hang.
    actionTimeout: 30_000,
    // Off, not retain-on-failure: the lane is ONE long test, so a trace spans every surface
    // and both viewports, and the evidence that matters — a screenshot per surface and the
    // Recorder envelope with each invariant's first line — is written by the spec itself.
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/perfplus-e2e',
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
