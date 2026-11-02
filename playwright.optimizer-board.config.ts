import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Harness for `optimizer:board:e2e:bench`: production Supabase pinned before the dev server
// spawns (same reason as playwright.optimizer.config.ts), its own port and dist dir, one worker.
// The port is in the Backend's CORS allowlist (3110–3115), so the deployed API answers the
// browser: the package script points NEXT_PUBLIC_API_URL at it unless the runner says otherwise.

loadProdSupabaseEnv();

const PORT = process.env.OPTIMIZER_BOARD_E2E_PORT ?? '3115';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
// mintSessionForEmail derives the session-cookie domain from PLAYWRIGHT_BASE_URL, so it has to
// see the same origin the browser will.
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /optimizer-board\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  // Each account crosses the Optimizer's reads, Google's or Meta's live read, and a first compile
  // of /scale; bounded, so a hang still fails.
  timeout: 420_000,
  expect: { timeout: 90_000 },
  use: { baseURL, trace: 'retain-on-failure', video: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/optimizer-board-e2e',
      NEXT_TSCONFIG_PATH: process.env.NEXT_TSCONFIG_PATH ?? 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: process.env
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'https://api.trycontinuum.ai',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
