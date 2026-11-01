import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel, loadProdSupabaseEnv } from './e2e/support/prodEnv';

// app:sweep:bench — see e2e/app-sweep.bench.spec.ts. Against a deployed origin
// (PLAYWRIGHT_BASE_URL=https://app.beta.trycontinuum.ai) no server is started; without one, a
// dev server on :3118 serves this checkout with production Supabase.
loadProdSupabaseEnv();

const PORT = process.env.APP_SWEEP_E2E_PORT ?? '3118';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
process.env.PLAYWRIGHT_BASE_URL = baseURL;
const remote = !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(baseURL);

export default defineConfig({
  testDir: './e2e',
  testMatch: /app-sweep\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 4 * 60 * 60_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL,
    actionTimeout: 8_000,
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: remote
    ? undefined
    : {
        command: 'bun run dev',
        env: {
          NEXT_DIST_DIR: '.next/app-sweep-e2e',
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
