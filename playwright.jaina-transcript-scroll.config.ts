import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Harness for `jaina:transcript:scroll:e2e:bench` — where the transcript parks, in a real Chrome.
//
// Same shape as playwright.jaina-approval-card.config.ts and for the same reasons: local Supabase
// only, its own port and dist dir so it cannot collide with another agent's dev server, and a
// DEAD Backend port. The chat stream is answered inside the page, so a dead upstream is what
// proves the frames came from the bench rather than from a Fastify someone left on :4000.

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
if (!/127\.0\.0\.1|localhost/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  throw new Error(
    'jaina:transcript:scroll:e2e:bench requires local Supabase. Run `bun run supabase:env:local`.',
  );
}

const PORT = process.env.JAINA_TRANSCRIPT_SCROLL_E2E_PORT ?? '3123';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const backendURL = `http://127.0.0.1:${process.env.JAINA_TRANSCRIPT_SCROLL_DEAD_PORT ?? '4497'}`;

// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.NEXT_PUBLIC_API_URL = backendURL;
process.env.API_URL = backendURL;

export default defineConfig({
  testDir: './e2e',
  // Its own output directory. Playwright wipes `outputDir` when a run starts, and every config in
  // this project defaulted to the shared `test-results/` — so another session's bench starting
  // mid-run deleted this run's trace and failed it with ENOENT, a failure that says nothing about
  // the code. `.playwright/` is gitignored and no config claims it wholesale.
  outputDir: '.playwright/jaina-transcript-scroll',
  testMatch: /jaina-transcript-scroll\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // No model turn; the only slow part is the dev server's first compile of /scale.
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
      NEXT_DIST_DIR: '.next/jaina-transcript-scroll-e2e',
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
