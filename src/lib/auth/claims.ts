import 'server-only';

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

export async function getClaimsIdentity(): Promise<AuthIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  return toAuthIdentity(data?.claims as SupabaseClaims | null | undefined);
}

export async function requireClaimsIdentity(): Promise<AuthIdentity> {
  const identity = await getClaimsIdentity();

  if (!identity) {
    redirect('/login');
  }

  return identity;
}
