import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { pinProdSupabase } from './e2e/paid-parity.env';

// Dedicated harness for `paid:parity:e2e:bench` — does each Performance+ screen render the
// figures it was handed? See e2e/paid-parity.bench.spec.ts for what is graded.
//
// Its own config for the same two reasons `playwright.optimizer.config.ts` has one: it reads
// PRODUCTION Supabase (pinProdSupabase() pins the env before the webServer spawns and
// refuses any other project; e2e/paid-parity.env.ts has the one fallback it adds), and it
// must not collide with another agent's dev server — its own port, its own Next dist dir,
// one worker.
//
// Screenshots: masked snapshots live under e2e/__screenshots__/paid-parity/ (the template
// below, no platform suffix). The first run writes the baselines; later runs diff against them.

pinProdSupabase();

const PORT = process.env.PAID_PARITY_E2E_PORT ?? '3128';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

// Playwright tears the worker down after a failed test and starts a fresh one, so grades
// kept in module state would vanish with it. Every worker appends to ONE run-scoped file
// and the envelope is re-read from it, so the last envelope printed is the cumulative one.
process.env.PAID_PARITY_RUN_STARTED_AT = new Date().toISOString();
process.env.PAID_PARITY_RUN_LEDGER = join(tmpdir(), `paid-parity-${Date.now()}.jsonl`);

export default defineConfig({
  testDir: './e2e',
  testMatch: /paid-parity\.bench\.spec\.ts/,
  snapshotPathTemplate: '{testDir}/__screenshots__/paid-parity/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 240_000,
  expect: {
    timeout: 60_000,
    // Real data drifts day to day (dates in copy, sparklines). Figures are masked; the
    // rest of the frame is allowed a small share of changed pixels before it reads as a
    // layout regression.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/paid-parity-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
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
