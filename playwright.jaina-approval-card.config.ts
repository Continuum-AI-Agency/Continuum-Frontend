import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Dedicated harness for `jaina:approval:card:e2e:bench` — the tool-approval card's
// before → after table, end to end in a real Chrome.
//
// Why its own file, like `playwright.jaina-canvas.config.ts`:
//
//  1. It runs against PRODUCTION Supabase. The page is server-rendered: the active
//     brand and its ad account come out of Supabase in the RSC pass, and the chat
//     composer refuses to dispatch without an ad account. The local stack is a
//     schema-only snapshot with neither. `loadProdSupabaseEnv()` overwrites the
//     Supabase env and FAILS FAST if it does not resolve to prod, BEFORE the
//     webServer spawns, so `.env.local` cannot pull it back to the local stack.
//  2. Its own port, dist dir, tsconfig and one worker, so it never collides with
//     another agent's dev server.
//  3. NO BACKEND. `NEXT_PUBLIC_API_URL` is pinned to a port nothing listens on: the
//     spec answers the chat routes with `page.route`, and a dead upstream is what
//     proves the assertions came from the stub rather than from a Fastify someone
//     else left running on :4000.

loadProdSupabaseEnv();

const PORT = process.env.JAINA_APPROVAL_CARD_E2E_PORT ?? '3121';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
// Deliberately dead. Nothing in this bench may reach a Backend.
const backendURL = `http://127.0.0.1:${process.env.JAINA_APPROVAL_CARD_DEAD_PORT ?? '4499'}`;

// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL, so it
// has to see the same origin the browser will.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.NEXT_PUBLIC_API_URL = backendURL;
process.env.API_URL = backendURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /jaina-approval-card\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // No model turn here — the only slow part is the dev server's first compile of /scale.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/jaina-approval-card-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_API_URL: backendURL,
      // Explicit rather than inherited — the prod pinning is the point of this file.
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
