// Point a Playwright run at PRODUCTION Supabase, deliberately and verifiably.
//
// The trap this module exists for: `Continuum-Frontend/.env.local` sets
// NEXT_PUBLIC_SUPABASE_URL to the LOCAL stack (127.0.0.1:54321). Next.js loads
// `.env.local` at the HIGHEST file priority, and the local stack has no optimizer
// data and (by design) no edge functions — a live bench run against it would
// exercise an empty room and report a false green.
//
// Real process environment variables beat every .env file in Next (@next/env never
// overwrites an existing process.env entry), so exporting the prod values into the
// runner's own environment before the dev server starts is the fix. Playwright's
// webServer inherits process.env, so mutating it here — at config load, before the
// server spawns — reaches the Next process too.
//
// Shell `set -a; . ./.env` is NOT used: Continuum-Backend/.env contains at least one
// unquoted multi-word value that a POSIX shell tries to execute. This parser reads
// `KEY=VALUE` literally and never evaluates anything.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright transpiles specs and configs to CJS, so `__dirname` is the portable
// anchor here — `import.meta` is a syntax error in that pipeline.
const FRONTEND_ENV = resolve(__dirname, '../../.env');
const BACKEND_ENV = resolve(__dirname, '../../../Continuum-Backend/.env');

/** The one Supabase project these live benches are allowed to read. */
export const PROD_SUPABASE_URL = 'https://nkejqgyushulohxwtytl.supabase.co';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseEnvFile(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  const parsed: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!KEY_PATTERN.test(key)) continue;
    parsed[key] = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
  return parsed;
}

/**
 * Overwrites the Supabase-facing environment with the PRODUCTION values and returns
 * the service-role credentials the bench needs for its own out-of-band reads.
 *
 * Throws when a required value is missing or when the resolved URL is not the prod
 * project — a live bench that silently fell back to the local stack is the exact
 * failure mode this whole module is here to make impossible.
 */
export function loadProdSupabaseEnv(): {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
} {
  const frontend = parseEnvFile(FRONTEND_ENV);
  const backend = parseEnvFile(BACKEND_ENV);

  const url = frontend.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const publishableKey =
    frontend.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    frontend.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ??
    '';
  const serviceRoleKey = backend.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!url || !publishableKey) {
    throw new Error(
      `[e2e/prodEnv] ${FRONTEND_ENV} is missing NEXT_PUBLIC_SUPABASE_URL or a publishable key. ` +
        'This bench reads production and cannot run without them.',
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      `[e2e/prodEnv] ${BACKEND_ENV} is missing SUPABASE_SERVICE_ROLE_KEY. ` +
        'It is required to mint a real member session and to count money events.',
    );
  }
  if (url.replace(/\/$/, '') !== PROD_SUPABASE_URL) {
    throw new Error(
      `[e2e/prodEnv] Refusing to run: resolved Supabase URL is "${url}", expected ` +
        `"${PROD_SUPABASE_URL}". A run against any other stack proves nothing.`,
    );
  }

  // Highest-priority overrides for both this process and the inherited dev server.
  // NEXT_PUBLIC_SUPABASE_ANON_KEY is overwritten too: `.env.local` sets it to the
  // LOCAL key, and a prod URL paired with a local key is a 401 machine.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = publishableKey;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY = publishableKey;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = publishableKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  for (const passthrough of [
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_API_URL',
    'API_URL',
    'NEXT_PUBLIC_PYTHON_API_URL',
    'BRAND_INSIGHTS_API_URL',
  ]) {
    if (frontend[passthrough]) process.env[passthrough] = frontend[passthrough];
  }

  return { url, publishableKey, serviceRoleKey };
}
