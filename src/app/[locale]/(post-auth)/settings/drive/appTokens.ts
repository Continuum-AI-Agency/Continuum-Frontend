// App tokens for Drive, server side. The user's own rows and the create/revoke RPCs run on
// the server under the caller's session (RLS + auth.uid()); the browser only ever sees the
// parsed results. The plaintext token exists once, in the create result, and is never stored.

import {
  type AppToken,
  appTokenSchema,
  type CreateAppTokenResponse,
  createAppTokenRequestSchema,
  createAppTokenResponseSchema,
  type RevokeAppTokenResponse,
  revokeAppTokenResponseSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import type { createSupabaseServerClient } from '@/lib/supabase/server';

type Result<T> = { data: T | null; error: { message: string } | null };

type AppTokenRow = {
  id: string;
  user_id: string;
  name: string;
  last4: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/** The three calls the page needs — the seam the unit test replaces. */
export type AppTokenStore = {
  list(): PromiseLike<Result<AppTokenRow[]>>;
  create(name: string): PromiseLike<Result<unknown>>;
  revoke(id: string): PromiseLike<Result<unknown>>;
};

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export function supabaseAppTokenStore(client: ServerClient): AppTokenStore {
  const profiles = () => client.schema('brand_profiles');
  return {
    list: () =>
      profiles()
        .from('app_tokens')
        .select('id,user_id,name,last4,scopes,created_at,last_used_at,revoked_at')
        .order('created_at', { ascending: false }),
    create: (name) => profiles().rpc('create_app_token', { p_name: name }),
    revoke: (id) => profiles().rpc('revoke_app_token', { p_id: id }),
  };
}

export async function listAppTokens(store: AppTokenStore): Promise<AppToken[]> {
  const { data, error } = await store.list();
  if (error) throw new Error(`Could not load app tokens: ${error.message}`);
  return (data ?? []).map((row) =>
    appTokenSchema.parse({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      last4: row.last4,
      scopes: row.scopes,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    }),
  );
}

export async function createAppToken(
  store: AppTokenStore,
  input: unknown,
): Promise<CreateAppTokenResponse> {
  const { name } = createAppTokenRequestSchema.parse(input);
  const { data, error } = await store.create(name);
  if (error) throw new Error(`Could not create the app token: ${error.message}`);
  return createAppTokenResponseSchema.parse(data);
}

export async function revokeAppToken(
  store: AppTokenStore,
  id: unknown,
): Promise<RevokeAppTokenResponse> {
  const tokenId = z.string().uuid().parse(id);
  const { data, error } = await store.revoke(tokenId);
  if (error) throw new Error(`Could not revoke the app token: ${error.message}`);
  return revokeAppTokenResponseSchema.parse(data);
}
