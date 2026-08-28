import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type OwnedConnection = {
  id: string;
  provider: string;
  status: string | null;
  createdAt: string | null;
  /**
   * Which login this connection is. Two Meta connections under one user are
   * otherwise indistinguishable in the UI, and removal is per connection.
   */
  identity: string | null;
};

export async function fetchOwnedConnections(userId: string): Promise<OwnedConnection[]> {
  if (!userId) return [];
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('user_integrations')
    .select('id, provider, status, created_at, platform_email, platform_user_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[fetchOwnedConnections] query failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    status: row.status ?? null,
    createdAt: row.created_at ?? null,
    identity: row.platform_email ?? row.platform_user_id ?? null,
  }));
}
