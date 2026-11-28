import { existsSync, readFileSync, statfsSync } from 'node:fs';
import path from 'node:path';
import { type WatchmanCreateInput, watchmanCreateInputSchema } from '@continuum/contracts';
import { z } from 'zod';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing explicit local browser configuration: ${name}`);
  return value;
};
const loopback = (name: string) => {
  const url = new URL(required(name));
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(`${name} must be an HTTP loopback origin.`);
  return url.origin;
};

export function assertWatchmanFixtureLane(input: Pick<WatchmanCreateInput, 'kind' | 'role'>) {
  const role = input.role ?? (input.kind === 'paid' ? 'performance' : 'content');
  if ((role === 'performance') !== (input.kind === 'paid'))
    throw new Error('The browser fixture kind must match its selected teammate role.');
}

export function watchmanBrowserPreflight() {
  if (required('WATCHMAN_LOCAL_BROWSER_BENCH') !== 'authorized-local-stack')
    throw new Error('The real local browser bench is not authorized.');
  const disk = statfsSync(process.cwd());
  if (Number(disk.bavail) * Number(disk.bsize) < 50 * 1024 ** 3)
    throw new Error(
      'UNRUN: browser acceptance requires at least 50 GiB free before Playwright starts its server.',
    );
  const origin = loopback('PLAYWRIGHT_BASE_URL');
  const apiOrigin = loopback('NEXT_PUBLIC_API_URL');
  const supabaseOrigin = loopback('NEXT_PUBLIC_SUPABASE_URL');
  const statePath = path.resolve(required('WATCHMAN_BROWSER_STORAGE_STATE'));
  if (!existsSync(statePath))
    throw new Error('The explicit existing authenticated storageState file is missing.');
  const state: unknown = JSON.parse(readFileSync(statePath, 'utf8'));
  z.object({ cookies: z.array(z.unknown()), origins: z.array(z.unknown()) }).parse(state);
  const input = watchmanCreateInputSchema.parse(
    JSON.parse(readFileSync(required('WATCHMAN_BROWSER_SETUP_INPUT_FILE'), 'utf8')),
  );
  assertWatchmanFixtureLane(input);
  if (!input.first_assignment?.trim())
    throw new Error('The user-controlled browser setup fixture needs a first assignment.');
  if (!required('NEXT_DIST_DIR').startsWith('.next/'))
    throw new Error('Use an explicit .next/ staging directory for the existing Playwright server.');
  return {
    origin,
    apiOrigin,
    supabaseOrigin,
    statePath,
    input,
    brandId: z.string().uuid().parse(required('WATCHMAN_SETUP_BRAND_ID')),
    runId: z.string().uuid().parse(required('WATCHMAN_SETUP_RUN_ID')),
    owner: required('WATCHMAN_BENCH_OWNER'),
    serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

if (process.argv[1]?.endsWith('/preflight.ts')) {
  watchmanBrowserPreflight();
  console.log(
    'Local browser admission passed; no server, browser, database or provider operation ran.',
  );
}
