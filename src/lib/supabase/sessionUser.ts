'use client';

import { createSupabaseBrowserClient } from './client';

/**
 * The signed-in user from this browser's session. getUser costs an Auth round trip plus a CORS
 * preflight before the caller can go on, which on a slow network is most of a second; the
 * session is already here. Identity only: RLS still checks every query against the JWT.
 */
export async function getSessionUser() {
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  return data.session?.user ?? null;
}
