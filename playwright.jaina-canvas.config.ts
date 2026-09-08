import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Dedicated harness for `jaina:canvas:e2e:bench` — the Campaign Flow Canvas end to end.
//
// Same three reasons `playwright.optimizer.config.ts` needs its own file:
//
//  1. It runs against PRODUCTION Supabase, because the rows this bench renders
//     (`paid_scaffolds`, its gate approvals, `audience_groups`) exist nowhere else —
//     the local stack is a schema-only snapshot with no scaffold rows and no edge
//     functions. `loadProdSupabaseEnv()` overwrites the Supabase env with the prod
//     values, and FAILS FAST if they do not resolve to the prod project, BEFORE the
//     webServer spawns — so the dev server cannot fall back to the local stack that
//     `.env.local` otherwise pins it to.
//  2. It must never collide with another agent's dev server: its own port, its own
//     Next dist dir, its own tsconfig, one worker, no parallelism.
//  3. The propose hop drives a REAL Jaina turn through a Fastify the spec itself
//     spawns on a private port, so `NEXT_PUBLIC_API_URL` is pinned here rather than
//     inherited from whatever is listening on :4000.

loadProdSupabaseEnv();

const PORT = process.env.JAINA_CANVAS_E2E_PORT ?? '3117';
const BACKEND_PORT = process.env.JAINA_CANVAS_BENCH_BACKEND_PORT ?? '4421';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const backendURL = `http://127.0.0.1:${BACKEND_PORT}`;

// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL, so it
// has to see the same origin the browser will.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.JAINA_CANVAS_BENCH_BACKEND_PORT = BACKEND_PORT;
// The browser calls the Backend directly (src/lib/api/http.ts reads this at build time
// in the client bundle), so the dev server has to be told before it compiles.
process.env.NEXT_PUBLIC_API_URL = backendURL;
process.env.API_URL = backendURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /jaina-canvas\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // The propose test drives a real model turn behind a real approval gate, and the dev
  // server compiles /scale/campaign-canvas on first hit. Generous, but bounded — a hang
  // must still fail, not wait forever.
  timeout: 660_000,
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
      NEXT_DIST_DIR: '.next/jaina-canvas-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_API_URL: backendURL,
      // Explicit, even though webServer inherits process.env — the prod pinning is the
      // whole point of this file and should not depend on inheritance staying true.
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
