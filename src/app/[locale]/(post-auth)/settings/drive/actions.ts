'use server';

import type {
  AppToken,
  CreateAppTokenResponse,
  RevokeAppTokenResponse,
} from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAppToken, listAppTokens, revokeAppToken, supabaseAppTokenStore } from './appTokens';

const store = async () => supabaseAppTokenStore(await createSupabaseServerClient());

export async function listAppTokensAction(): Promise<AppToken[]> {
  return listAppTokens(await store());
}

/** The response carries the plaintext token; the caller shows it once and keeps no copy. */
export async function createAppTokenAction(input: {
  name: string;
}): Promise<CreateAppTokenResponse> {
  return createAppToken(await store(), input);
}

export async function revokeAppTokenAction(id: string): Promise<RevokeAppTokenResponse> {
  return revokeAppToken(await store(), id);
}
