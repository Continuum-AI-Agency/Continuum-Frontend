'use client';

import { createBrowserClient } from '@supabase/ssr';
import { fetchWithTimeout, supabaseTimeoutPolicy } from '@/lib/api/timeout';
import { getSupabaseCookieOptions } from './cookies';
import type { Database } from './types';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createSupabaseBrowserClient() {
  if (client) {
    return client;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or publishable/anon key.',
    );
  }

  client = createBrowserClient<Database>(supabaseUrl, supabaseKey, {
    cookieOptions: getSupabaseCookieOptions(),
    // Every REST, RPC, auth and edge call from the browser carries the one client bound
    // (src/lib/api/timeout.ts): a hung socket becomes a RequestTimeoutError the surface can
    // name, instead of a skeleton that never leaves.
    global: { fetch: fetchWithTimeout(supabaseTimeoutPolicy) },
  });

  return client;
}
