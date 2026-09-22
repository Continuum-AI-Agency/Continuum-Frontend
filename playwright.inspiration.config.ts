import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Dedicated harness for `inspiration:fe:e2e:bench` — the Inspiration Library end to end.
//
// It runs against PRODUCTION Supabase because what it grades exists nowhere else: the
// bench login's brand, its real tracked Instagram competitors, their persisted posts
// (competitor_ad_spy.organic_posts) and the Meta viewer that Business Discovery reads
// through. The local stack is a schema-only snapshot with none of it. The default
// playwright.config.ts cannot be used: `.env.local` pins the dev server to the local
// stack, and only a config that calls `loadProdSupabaseEnv()` BEFORE the webServer
// spawns can move it (real process env beats every .env file in Next).
//
// FE 3121 / BE 4431 are this bench's own ports (4421 belongs to jaina:canvas:e2e:bench).
// The Backend is spawned by the spec (support/localBackend.ts, hosted target, job
// workers off), never borrowed from :4000.

loadProdSupabaseEnv();

const PORT = process.env.INSPIRATION_E2E_PORT ?? '3121';
const BACKEND_PORT = process.env.BENCH_BACKEND_PORT ?? '4431';
const baseURL = `http://127.0.0.1:${PORT}`;
const backendURL = `http://127.0.0.1:${BACKEND_PORT}`;

// mintSessionForEmail derives the cookie domain from PLAYWRIGHT_BASE_URL.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.BENCH_BACKEND_PORT = BACKEND_PORT;
// The browser calls the Backend directly; the client bundle reads this at compile time.
process.env.NEXT_PUBLIC_API_URL = backendURL;
process.env.API_URL = backendURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /inspiration\.bench\.spec\.ts/,
  // Other Playwright runs clear the whole test-results/ tree on start, mid-run traces
  // included; this run's artifacts live outside it.
  outputDir: join(tmpdir(), 'inspiration-bench-results'),
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // Analyse runs the real describer (Vertex) and Develop runs a real organic
  // generation; both are bounded, and a hang must still fail.
  timeout: 900_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/inspiration-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_API_URL: backendURL,
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
