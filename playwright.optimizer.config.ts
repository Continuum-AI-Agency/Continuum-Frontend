import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Dedicated harness for `optimizer:e2e:bench` — the Paid Media Optimizer live UI bench.
//
// Two things make it need its own config rather than the shared playwright.config.ts:
//
//  1. It runs against PRODUCTION Supabase. loadProdSupabaseEnv() overwrites the
//     Supabase env with the prod values (and FAILS FAST if they do not resolve to the
//     prod project) BEFORE the webServer is spawned, so the dev server cannot fall back
//     to the local stack that `.env.local` otherwise pins it to.
//  2. It must never collide with another agent's dev server: its own port, its own
//     Next dist dir, its own tsconfig, one worker, no parallelism.

loadProdSupabaseEnv();

const PORT = process.env.OPTIMIZER_E2E_PORT ?? '3107';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL, so it
// has to see the same origin the browser will.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /optimizer-experience\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // Live reads cross Meta and the optimizer VM; the dev server also compiles /scale
  // on first hit. Generous, but bounded — a hang must still fail, not wait forever.
  timeout: 240_000,
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
      NEXT_DIST_DIR: '.next/optimizer-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
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
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
