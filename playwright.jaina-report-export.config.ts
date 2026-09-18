import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

// Harness for `jaina:report:export:e2e:bench`.
//
// Unlike the other Jaina benches this needs NO Supabase and NO Backend: the export
// is a pure client-side composition over a fixture report, so the only dependency
// is the app's own CSS and components. `NEXT_PUBLIC_API_URL` points at a dead port
// so nothing can quietly reach a Fastify someone left running on :4000.

loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const PORT = process.env.JAINA_REPORT_EXPORT_E2E_PORT ?? '3122';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const backendURL = `http://127.0.0.1:${process.env.JAINA_REPORT_EXPORT_DEAD_PORT ?? '4498'}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /jaina-report-export\.bench\.spec\.ts/,
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
      NEXT_DIST_DIR: '.next/jaina-report-export-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
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
