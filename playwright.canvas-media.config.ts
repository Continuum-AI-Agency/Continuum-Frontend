import { defineConfig } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Dedicated harness for `canvas-media:e2e:bench` — canvas downloads, re-drop dedup and
// library thumbnails, end to end in a real Chromium AND a real WebKit (the report came
// from Safari).
//
//  1. PRODUCTION Supabase: the bench reads real generated outputs in the bench brand and
//     their real storage objects. `loadProdSupabaseEnv()` fails fast before the dev
//     server spawns if the env would resolve anywhere else.
//  2. The PRODUCTION Backend, for the one Backend hop (`/api/ai-studio/media/sign`). The
//     change under test is Frontend-only; that route is what prod already runs.
//     `localhost` (not 127.0.0.1) because the Backend's CORS allowlist names
//     localhost:3110-3115.
//  3. Its own port, dist dir and output dir so it never collides with another agent.
//     The spec drives both browsers itself, so the Recorder envelope covers both.

loadProdSupabaseEnv();

const PORT = process.env.CANVAS_MEDIA_E2E_PORT ?? '3115';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const backendURL = process.env.CANVAS_MEDIA_BENCH_API_URL ?? 'https://api.trycontinuum.ai';

process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.NEXT_PUBLIC_API_URL = backendURL;
process.env.API_URL = backendURL;

export default defineConfig({
  testDir: './e2e',
  testMatch: /canvas-media\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  outputDir: '.playwright/canvas-media',
  timeout: 600_000,
  expect: { timeout: 60_000 },
  use: { baseURL, trace: 'off', video: 'off' },
  webServer: {
    command: 'bun run dev',
    env: {
      NEXT_DIST_DIR: '.next/canvas-media-e2e',
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
