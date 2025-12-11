"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { getSupabaseCookieOptions } from "./cookies";

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
      "Supabase client is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or publishable/anon key."
    );
  }

  client = createBrowserClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookieOptions: getSupabaseCookieOptions(),
    }
  );

  return client;
}
