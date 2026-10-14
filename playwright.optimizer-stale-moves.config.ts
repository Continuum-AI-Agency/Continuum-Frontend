import { defineConfig, devices } from '@playwright/test';
import { pinProdSupabase } from './e2e/paid-parity.env';

// Harness for `optimizer:stale-moves:e2e:bench` — a portfolio whose last cycle can no longer
// be acted on shows its moves read-only as withdrawn. See e2e/optimizer-stale-moves.bench.spec.ts.
//
// Same shape as playwright.paid-parity.config.ts: PRODUCTION Supabase pinned before the
// webServer spawns (any other project is refused), its own port and Next dist dir so it
// cannot collide with another agent's dev server, one worker.

pinProdSupabase();

const PORT = process.env.OPTIMIZER_STALE_MOVES_E2E_PORT ?? '3129';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /optimizer-stale-moves\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 300_000,
  expect: { timeout: 60_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/optimizer-stale-moves-e2e',
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
