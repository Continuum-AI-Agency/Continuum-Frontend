import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// The Performance+ campaign's failure-injection lane (`perfplus:failures:bench`, P2.5): every
// Performance+ surface loaded clean to record its data calls, then reloaded with each call
// answered by a 500 HTML page, a hang, a 2 s delay, an empty payload and a partial payload,
// graded against design-intent rule 7 (a named state, never a blank area, never raw JSON).
// Same harness as playwright.perfplus.config.ts — prod Supabase pinned before the dev server
// spawns, one headless browser, its own port and dist dir — on port 3110 (in the Backend CORS
// allowlist, Continuum-Backend/App/cors.ts).

loadProdSupabaseEnv();

const PORT = process.env.PERFPLUS_FAILURES_E2E_PORT ?? '3110';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /perfplus-failures\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 300_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    actionTimeout: 30_000,
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/perfplus-failures-e2e',
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
