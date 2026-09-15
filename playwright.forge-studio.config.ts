import { defineConfig, devices } from '@playwright/test';
import { loadProdSupabaseEnv } from './e2e/support/prodEnv';

// Dedicated harness for `forge:studio:e2e:bench` — Forge Studio in a real Chrome.
//
// Why its own file, like `playwright.optimizer.config.ts`:
//
//  1. PRODUCTION Supabase. /forge is server-rendered from the active brand, and the StarCraft
//     owner and brand exist only in prod. `loadProdSupabaseEnv()` overwrites the Supabase env and
//     FAILS FAST if it does not resolve to prod, before the dev server spawns, so `.env.local`
//     cannot pull it back to the local stack.
//  2. Two modes, one backend decision, made here because NEXT_PUBLIC_API_URL is baked into the
//     dev server at start:
//       - fixtures (default): the backend is a DEAD port. The spec answers every
//         /api/ai-studio/** call with contract-parsed fixtures, and a dead upstream is what proves
//         the assertions came from them rather than from a Fastify someone left on :4000.
//       - FORGE_STUDIO_LIVE=1: the LOCAL backend (FORGE_STUDIO_API_URL, else a local API_URL, else
//         http://localhost:4000). Anything that is not localhost is refused — `bun run` loads the
//         Frontend `.env`, whose API_URL is production.
//  3. Its own port (3115 — on the backend's default CORS allowlist as a localhost origin), dist
//     dir and tsconfig, one worker, bounded timeouts, so it never collides with another agent's
//     dev server.

const isLocal = (url: string) => {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};

// Read before loadProdSupabaseEnv(), which copies the Frontend .env's API_URL over it.
const operatorApiUrl = process.env.FORGE_STUDIO_API_URL?.trim();
const inheritedApiUrl = process.env.API_URL?.trim();

loadProdSupabaseEnv();

const LIVE = process.env.FORGE_STUDIO_LIVE === '1';
const PORT = process.env.FORGE_STUDIO_E2E_PORT ?? '3115';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

let backendURL = `http://127.0.0.1:${process.env.FORGE_STUDIO_DEAD_PORT ?? '4498'}`;
if (LIVE) {
  if (operatorApiUrl && !isLocal(operatorApiUrl)) {
    throw new Error(
      `[forge-studio config] FORGE_STUDIO_API_URL=${operatorApiUrl} is not a local backend. LIVE runs against localhost only.`,
    );
  }
  backendURL = (
    operatorApiUrl ||
    (inheritedApiUrl && isLocal(inheritedApiUrl) ? inheritedApiUrl : 'http://localhost:4000')
  ).replace(/\/$/, '');
}

// mintSessionBundleForEmail derives the cookie domain from PLAYWRIGHT_BASE_URL; the spec reads the
// backend and the run id from here so every worker agrees on both.
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.NEXT_PUBLIC_API_URL = backendURL;
process.env.API_URL = backendURL;
process.env.FORGE_STUDIO_API_URL = backendURL;
process.env.FORGE_STUDIO_RUN_ID ??= String(Date.now());

export default defineConfig({
  testDir: './e2e',
  testMatch: /forge-studio\.bench\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  // The first test pays the dev server's compile of /forge. LIVE FIRE sets its own, longer budget
  // for the render fleet; everything else must still fail rather than wait forever.
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
      // Parallel agents pass their own dist dir with their own port, so two dev servers never share one.
      NEXT_DIST_DIR: process.env.FORGE_STUDIO_DIST_DIR ?? '.next/forge-studio-e2e',
      NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
      PORT,
      NEXT_PUBLIC_API_URL: backendURL,
      API_URL: backendURL,
      // Explicit rather than inherited — the prod pinning is the point of this file.
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
