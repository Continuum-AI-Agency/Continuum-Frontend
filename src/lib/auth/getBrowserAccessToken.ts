const SESSION_RETRY_DELAY_MS = 300;

async function readSessionToken(): Promise<string | null> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Retries once after a short delay: the client-side Supabase session can still be
// hydrating from cookies when a caller resolves a token immediately after mount,
// and without a retry that race silently produces an unauthenticated request.
export async function getBrowserAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const token = await readSessionToken();
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, SESSION_RETRY_DELAY_MS));
    return await readSessionToken();
  } catch {
    return null;
  }
}
