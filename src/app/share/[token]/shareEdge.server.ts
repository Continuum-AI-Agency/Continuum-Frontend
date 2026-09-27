// The share page's door to the library-share edge function. The page runs for an
// anonymous viewer, so it calls with the anon key only; the function scopes every
// guest action by the share token and the reviewer's session token.

import 'server-only';

import type { LibraryShareRequest } from '@continuum/contracts';

export type EdgeResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string };

export async function invokeLibraryShare<T>(request: LibraryShareRequest): Promise<EdgeResult<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, status: 503, error: 'The share service is not configured.' };
  try {
    // LIBRARY_SHARE_FUNCTION_URL points at a locally served copy of the function
    // (local development, and the share bench before the function is deployed).
    const endpoint = process.env.LIBRARY_SHARE_FUNCTION_URL ?? `${url}/functions/v1/library-share`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      cache: 'no-store',
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const error = (body as { error?: unknown } | null)?.error;
      return {
        ok: false,
        status: response.status,
        error: typeof error === 'string' ? error : 'The share service refused the request.',
      };
    }
    return { ok: true, status: response.status, data: body as T };
  } catch (error) {
    console.error('[share] library-share call failed', { action: request.action, error });
    return { ok: false, status: 503, error: 'The share service is temporarily unavailable.' };
  }
}
