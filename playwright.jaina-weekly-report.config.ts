import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Harness for `jaina:weekly-report:render:bench`.
//
// Like the report export bench, this needs NO Supabase and NO Backend: it renders a report
// the Backend already wrote (artifacts/jaina/weekly-report-live.json) or the fixture, through
// the app's own components. `NEXT_PUBLIC_API_URL` points at a dead port so nothing can
// quietly reach a Fastify someone left running on :4000. `tsconfig.e2e.local.json` because
// the root contracts lag the vendored copy the Frontend builds against.

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const PORT = process.env.JAINA_WEEKLY_REPORT_E2E_PORT ?? '3131';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const backendURL = `http://127.0.0.1:${process.env.JAINA_WEEKLY_REPORT_DEAD_PORT ?? '4491'}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /jaina-weekly-report\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
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
      NEXT_DIST_DIR: '.next/jaina-weekly-report-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.local.json',
      PORT,
      NEXT_PUBLIC_API_URL: backendURL,
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
