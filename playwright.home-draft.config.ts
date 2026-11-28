import { defineConfig, devices } from '@playwright/test';
import { benchBrowserChannel } from './e2e/support/prodEnv';

const runId = process.env.HOME_DRAFT_RUN_ID;
if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId) || !process.env.ARTIFACT_RUN_DIR) {
  throw new Error('Run this bench through bun run home:draft:e2e:bench.');
}

const baseURL = 'http://localhost:3112';
process.env.PLAYWRIGHT_BASE_URL = baseURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /home-board\.bench\.spec\.ts/,
  outputDir: `${process.env.ARTIFACT_RUN_DIR}/playwright`,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 1_200_000,
  expect: { timeout: 90_000 },
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 240_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...benchBrowserChannel() } }],
  webServer: {
    // A unique cache avoids stale chunks and never deletes an existing run's evidence.
    command: 'bun run --bun next dev --webpack',
    env: {
      PORT: '3112',
      NEXT_DIST_DIR: `.next/home-draft-${runId}`,
      NEXT_TSCONFIG_PATH: `.next/home-draft-${runId}.tsconfig.json`,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'https://api.trycontinuum.ai',
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
