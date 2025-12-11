import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";
import { applySupabaseCookies, getSupabaseCookieOptions } from "./cookies";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server client misconfigured: missing URL or key env vars.");
  }

  return createServerClient<Database>(
    supabaseUrl,
    supabaseKey,
    {
      cookieOptions: getSupabaseCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        async setAll(cookiesToSet) {
          try {
            await applySupabaseCookies(cookiesToSet, {
              getExisting: () => cookieStore.getAll(),
              set: (name, value, options) => {
                cookieStore.set(name, value, options);
              },
              remove: (name, options) => {
                cookieStore.set(name, "", options);
              },
            });
          } catch {
            // Server Component, ignore
          }
        },
      },
    }
  );
}

export async function getServerSession() {
  const supabase = await createSupabaseServerClient();
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      throw error;
    }
    
    return session;
  } catch (error) {
    console.error("Error fetching session:", error);
    return null;
  }
}

export async function getServerUser() {
  const supabase = await createSupabaseServerClient();
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      throw error;
    }
    
    return user;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}
