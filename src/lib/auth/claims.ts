import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { AuthIdentity } from '@/lib/auth/identity';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type SupabaseClaims = {
  sub?: string;
  email?: string;
  app_metadata?: AuthIdentity['app_metadata'];
  user_metadata?: AuthIdentity['user_metadata'];
};

// Identity is the Supabase UUID, which native Supabase tokens carry in `sub`.
export function toAuthIdentity(claims: SupabaseClaims | null | undefined): AuthIdentity | null {
  if (!claims?.sub) {
    return null;
  }

  return {
    id: claims.sub,
    email: claims.email,
    app_metadata: claims.app_metadata,
    user_metadata: claims.user_metadata,
  };
}

/**
 * The caller of a request, verified on a client the route already holds. getClaims checks the
 * JWT signature against the project's cached ES256 JWKS; getUser is an Auth round trip (~50 ms
 * of Auth time from Vercel, measured 2026-10-28) on every request. The trade: a session revoked
 * elsewhere stays usable until its access token expires, as it already does in proxy.ts and the
 * backend. Keep getUser where that must not happen (the admin page).
 */
export async function claimsIdentityOf(
  supabase: Pick<SupabaseClient, 'auth'>,
): Promise<AuthIdentity | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  return toAuthIdentity(data?.claims as SupabaseClaims | null | undefined);
}

export async function getClaimsIdentity(): Promise<AuthIdentity | null> {
  return claimsIdentityOf(await createSupabaseServerClient());
}

export async function requireClaimsIdentity(): Promise<AuthIdentity> {
  const identity = await getClaimsIdentity();

  if (!identity) {
    redirect('/login');
  }

  return identity;
}
