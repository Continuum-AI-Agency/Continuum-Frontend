// The env of organic:headless-batch:e2e:bench: the local stack, the bench's own Backend on :4041,
// and NO cache. Both checkout .env files name production, so every key that could reach a shared
// cache (Redis, Upstash, the app and chat caches, KV) is dropped from the Backend's env and blanked
// for the Next server: an empty value outranks the .env line in both Bun and @next/env.
//
// Its own module (not headlessBatchBench.ts) because `--print-env` must not import
// chatMediaBench.ts, whose module body answers `--print-env` with chat-media's ports.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const BENCH_FE_PORT = 3041;
export const BENCH_BE_PORT = 4041;
export const BENCH_FE_ORIGIN = `http://localhost:${BENCH_FE_PORT}`;
export const BENCH_BE_URL = `http://127.0.0.1:${BENCH_BE_PORT}`;

// The package script and Playwright both run from Continuum-Frontend.
export const CLONE_ROOT = path.resolve(process.cwd(), '..');
export const BACKEND_DIR = path.join(CLONE_ROOT, 'Continuum-Backend');
const FRONTEND_DIR = path.join(CLONE_ROOT, 'Continuum-Frontend');

export const CACHE_KEY = /REDIS|UPSTASH|APP_CACHE|CHAT_CACHE|(^|_)KV(_|$)/;

const readEnvFile = (file: string): Record<string, string> =>
  fs.existsSync(file) ? (parseEnv(fs.readFileSync(file, 'utf8')) as Record<string, string>) : {};

/** `supabase status -o env` of the stack this clone's workdir names. */
export function localStackStatus(): Record<string, string> {
  const raw = execFileSync('supabase', ['status', '-o', 'env', '--workdir', '.'], {
    cwd: CLONE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  if (!values.API_URL || !values.SERVICE_ROLE_KEY || !values.ANON_KEY || !values.DB_URL) {
    throw new Error('[headless-batch bench] the local stack is not up: `bun run supabase:start`.');
  }
  return values;
}

/** The Frontend's env: local Supabase, the bench Backend, every cache key blanked. */
export function frontendBenchEnv(status = localStackStatus()): Record<string, string> {
  const blanked = Object.fromEntries(
    [
      ...Object.keys(readEnvFile(path.join(FRONTEND_DIR, '.env'))),
      ...Object.keys(readEnvFile(path.join(FRONTEND_DIR, '.env.local'))),
      ...Object.keys(process.env),
      'APP_CACHE_REDIS_URL',
      'APP_CACHE_REDIS_TOKEN',
    ]
      .filter((key) => CACHE_KEY.test(key))
      .map((key) => [key, '']),
  );
  return {
    ...blanked,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: status.ANON_KEY ?? '',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY: status.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? '',
    // Browser AND Next server: the checkout's .env names the production API for both.
    NEXT_PUBLIC_API_URL: BENCH_BE_URL,
    API_URL: BENCH_BE_URL,
    API_BASE_URL: BENCH_BE_URL,
  };
}

/**
 * The Backend's env, last-wins: the checkout's .env supplies the non-Supabase config with every
 * Supabase and cache key dropped, then the local stack and the worker switches go in. Used for
 * the bench server AND the quote subprocess, so both read exactly the same thing.
 */
export function backendBenchEnv(status = localStackStatus()): Record<string, string> {
  const kept = (env: Record<string, string | undefined>) =>
    Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] =>
          !entry[0].startsWith('SUPABASE_') &&
          !entry[0].startsWith('NEXT_PUBLIC_') &&
          !CACHE_KEY.test(entry[0]) &&
          typeof entry[1] === 'string',
      ),
    );
  return {
    ...kept(process.env),
    ...kept(readEnvFile(path.join(BACKEND_DIR, '.env'))),
    SUPABASE_URL: status.API_URL ?? '',
    SUPABASE_PROJECT_URL: status.API_URL ?? '',
    SUPABASE_ANON_KEY: status.ANON_KEY ?? '',
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? '',
    SUPABASE_DB_URL: status.DB_URL ?? '',
    PORT: String(BENCH_BE_PORT),
    HOST: '127.0.0.1',
    ALLOWED_ORIGINS: [BENCH_FE_ORIGIN, `http://127.0.0.1:${BENCH_FE_PORT}`].join(','),
    MCP_JOB_WORKER_ENABLED: 'false',
    // Also stops the 30 s batch reconcile tick (headless-content/routes.ts).
    BACKGROUND_WORKERS_ENABLED: 'false',
    ORGANIC_JOB_WORKER_ENABLED: 'false',
    JAINA_REPORT_ARTIFACT_WORKER_ENABLED: 'false',
  };
}

if (process.argv.includes('--print-env')) {
  const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  for (const [key, value] of Object.entries(frontendBenchEnv())) {
    console.log(`export ${key}=${quote(value)}`);
  }
}
