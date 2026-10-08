// The production pin for `paid:parity:e2e:bench`, with one fallback the shared loader lacks.
//
// `loadProdSupabaseEnv()` reads the service-role key from `Continuum-Backend/.env` and from
// nowhere else. A checkout without that file (a fresh Superset session, a CI runner that
// carries secrets in the environment) cannot run any prod-pinned FE bench at all, even with
// the key sitting in `process.env`. The loader's own doctrine is that a real process env var
// outranks every file, so this helper applies it: the shared loader first; when it refuses
// for the missing file and the key IS in the environment, the Frontend's own `.env` pins the
// project and the key comes from the process. The prod-URL refusal stays either way — a run
// against any other stack proves nothing.

import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { loadProdSupabaseEnv, PROD_SUPABASE_URL } from './support/prodEnv';

const FRONTEND_ROOT = resolve(__dirname, '..');

export type ProdSupabasePin = { url: string; publishableKey: string; serviceRoleKey: string };

export function pinProdSupabase(): ProdSupabasePin {
  try {
    return loadProdSupabaseEnv();
  } catch (error) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    if (!serviceRoleKey) throw error;
    // The Frontend's own files, with Next's precedence, never overwriting the process env.
    loadEnvConfig(FRONTEND_ROOT, true, { info: () => {}, error: console.error });
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
    const publishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      '';
    if (url !== PROD_SUPABASE_URL || !publishableKey) {
      throw new Error(
        `[paid-parity] Refusing to run: Continuum-Frontend/.env resolves to "${url || '(unset)'}", ` +
          `expected "${PROD_SUPABASE_URL}" with a publishable key.`,
      );
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = publishableKey;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY = publishableKey;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = publishableKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
    console.warn(
      '[paid-parity] Continuum-Backend/.env is absent — the service-role key came from the process environment.',
    );
    return { url, publishableKey, serviceRoleKey };
  }
}
