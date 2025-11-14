import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const shouldDelete =
                !value || (options && typeof options.maxAge === "number" && options.maxAge <= 0);

              if (shouldDelete) {
                try {
                  cookieStore.delete(name);
                } catch {
                  // Some environments may not support delete; fall back to setting an expired cookie.
                  cookieStore.set(name, "", {
                    ...options,
                    maxAge: 0,
                  });
                }
                return;
              }

              cookieStore.set(name, value, options);
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

