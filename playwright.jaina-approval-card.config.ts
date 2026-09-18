import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Dedicated harness for `jaina:approval:card:e2e:bench` — the tool-approval card's
// before → after table, end to end in a real Chrome.
//
// Why its own file, like `playwright.jaina-canvas.config.ts`:
//
//  1. It runs only against the hydrated LOCAL Supabase fixture. The page is
//     server-rendered and the seeded brand already owns a synthetic Meta account.
//  2. Its own port, dist dir, tsconfig and one worker, so it never collides with
//     another agent's dev server.
//  3. NO BACKEND. `NEXT_PUBLIC_API_URL` is pinned to a port nothing listens on: the
//     spec answers the chat routes with `page.route`, and a dead upstream is what
//     proves the assertions came from the stub rather than from a Fastify someone
//     else left running on :4000.

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  throw new Error(
    'jaina:approval:card:e2e:bench requires local Supabase. Run `bun run supabase:env:local`.',
  );
}

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
  // Its own output directory. Playwright wipes `outputDir` when a run starts, and every config in
  // this project defaulted to the shared `test-results/` — so another session's bench starting
  // mid-run deleted this run's trace and failed it with ENOENT, a failure that says nothing about
  // the code. `.playwright/` is gitignored and no config claims it wholesale.
  outputDir: '.playwright/jaina-approval-card',
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
      // Explicit rather than inherited so the process cannot drift away from localhost.
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
