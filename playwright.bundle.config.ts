import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

loadEnvConfig(process.cwd());
const baseURL = 'http://127.0.0.1:3125';
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.NEXT_DIST_DIR ??= '.next/bundle-optimized';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'bundle.bench.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run start --port 3125',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
