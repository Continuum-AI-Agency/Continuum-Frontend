import { defineConfig, devices } from '@playwright/test';
import { pinProdSupabase } from './e2e/paid-parity.env';
import { benchBrowserChannel } from './e2e/support/prodEnv';

// Harness for `optimizer:multiplatform:portfolio:e2e:bench` — a mixed Meta + Google portfolio
// is created, enrolled, read back on screen with its allowed actions, archived and deleted.
// See e2e/optimizer-portfolio-mixed.bench.spec.ts.
//
// Same shape as playwright.optimizer-stale-moves.config.ts: PRODUCTION Supabase pinned before
// the webServer spawns, its own port and Next dist dir, one worker.

pinProdSupabase();

const PORT = process.env.OPTIMIZER_PORTFOLIO_MIXED_E2E_PORT ?? '3133';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

// mintSessionBundleForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /optimizer-portfolio-mixed\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 300_000,
  expect: { timeout: 60_000 },
  // A click that cannot land fails by name in 30s instead of waiting out the test.
  use: { baseURL, trace: 'retain-on-failure', video: 'off', actionTimeout: 30_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/optimizer-portfolio-mixed-e2e',
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
