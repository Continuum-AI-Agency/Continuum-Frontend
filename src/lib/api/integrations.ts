'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api/http';
import { deriveMetaAccountRole } from '@/lib/integrations/metaRole';
import {
  applyBrandProfileIntegrationAccountsRequestSchema,
  type GoogleDrivePickerResponse,
  type GoogleSyncResponse,
  googleDrivePickerResponseSchema,
  googleSyncResponseSchema,
  type IntegrationAssetsResponse,
  integrationAssetsResponseSchema,
  type LinkedInResyncResponse,
  type LinkedInSyncResponse,
  type LinkIntegrationAccountsResponse,
  linkedinResyncResponseSchema,
  linkedinSyncResponseSchema,
  linkIntegrationAccountsResponseSchema,
  type MetaAccountRole,
  type MetaResyncResponse,
  type MetaSyncResponse,
  metaResyncResponseSchema,
  metaSyncResponseSchema,
  type SelectableAssetsResponse,
  selectableAssetsResponseSchema,
  type TikTokResyncResponse,
  type TikTokSyncResponse,
  tiktokResyncResponseSchema,
  tiktokSyncResponseSchema,
  type XResyncResponse,
  type XSyncResponse,
  xResyncResponseSchema,
  xSyncResponseSchema,
} from '@/lib/schemas/integrations';

function buildSyncPath(basePath: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${basePath}?${search.toString()}`;
}

async function getBrowserUserId(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? undefined;
  } catch {
    return undefined;
  }
}

export async function startMetaSync(callbackUrl: string): Promise<MetaSyncResponse> {
  return http.request({
    path: buildSyncPath('/integrations/meta/sync', { callback_url: callbackUrl }),
    method: 'GET',
    schema: metaSyncResponseSchema,
    cache: 'no-store',
  });
}

type StartGoogleSyncOptions = {
  /**
   * Forces Google's account chooser (`prompt=select_account consent`)
   * instead of the default `prompt=consent`. Used when a user wants to link
   * Google Ads under a different Google identity than the one already
   * connected (#151) — Google otherwise silently re-authenticates the same
   * signed-in account without ever showing a chooser.
   */
  forceAccountChooser?: boolean;
};

export async function startGoogleSync(
  callbackUrl: string,
  options?: StartGoogleSyncOptions,
): Promise<GoogleSyncResponse> {
  const params: Record<string, string> = { callback_url: callbackUrl };
  if (options?.forceAccountChooser) {
    params.force_account_chooser = 'true';
  }
  return http.request({
    path: buildSyncPath('/integrations/google/sync', params),
    method: 'GET',
    schema: googleSyncResponseSchema,
    cache: 'no-store',
  });
}

// Re-pull the latest Meta accounts/assets using stored tokens. Mirrors
// resyncTikTok/resyncX. This is the FE entry point to the already-tested
// POST /meta/resync that was never wired up (#154) — the picker calls it in the
// background when the Meta integration looks empty/stale so a connect that
// enumerated zero ad accounts can self-heal without a full re-OAuth.
export async function resyncMeta(platformEmail?: string): Promise<MetaResyncResponse> {
  return http.request({
    path: '/integrations/meta/resync',
    method: 'POST',
    body: platformEmail ? { platform_email: platformEmail } : {},
    schema: metaResyncResponseSchema,
    cache: 'no-store',
  });
}

export async function startTikTokSync(callbackUrl: string): Promise<TikTokSyncResponse> {
  return http.request({
    path: buildSyncPath('/integrations/tiktok/sync', { callback_url: callbackUrl }),
    method: 'GET',
    schema: tiktokSyncResponseSchema,
    cache: 'no-store',
  });
}

export async function resyncTikTok(platformUserId?: string): Promise<TikTokResyncResponse> {
  return http.request({
    path: '/integrations/tiktok/resync',
    method: 'POST',
    body: platformUserId ? { platform_user_id: platformUserId } : {},
    schema: tiktokResyncResponseSchema,
    cache: 'no-store',
  });
}

export type LinkedInSyncMode = 'paid' | 'organic';

export async function startLinkedInSync(
  callbackUrl: string,
  options?: { mode?: LinkedInSyncMode },
): Promise<LinkedInSyncResponse> {
  const params: Record<string, string> = { callback_url: callbackUrl };
  if (options?.mode) {
    params.mode = options.mode;
  }
  return http.request({
    path: buildSyncPath('/integrations/linkedin/sync', params),
    method: 'GET',
    schema: linkedinSyncResponseSchema,
    cache: 'no-store',
  });
}

export async function resyncLinkedIn(platformUserId?: string): Promise<LinkedInResyncResponse> {
  return http.request({
    path: '/integrations/linkedin/resync',
    method: 'POST',
    body: platformUserId ? { platform_user_id: platformUserId } : {},
    schema: linkedinResyncResponseSchema,
    cache: 'no-store',
  });
}

export async function startXSync(callbackUrl: string): Promise<XSyncResponse> {
  return http.request({
    path: buildSyncPath('/integrations/x/sync', { callback_url: callbackUrl }),
    method: 'GET',
    schema: xSyncResponseSchema,
    cache: 'no-store',
  });
}

export async function resyncX(platformUserId?: string): Promise<XResyncResponse> {
  return http.request({
    path: '/integrations/x/resync',
    method: 'POST',
    body: platformUserId ? { platform_user_id: platformUserId } : {},
    schema: xResyncResponseSchema,
    cache: 'no-store',
  });
}

type StartGoogleDrivePickerParams = {
  brandId: string;
  callbackUrl: string;
  context: string;
};

/**
 * Removing a personal OAuth connection is addressed by its integration id, not
 * by provider. The five per-provider deauthorize endpoints this replaces each
 * identified the connection differently and Meta/Google required a
 * `platform_email` the Frontend never had — so those two disconnects always
 * returned 400.
 */
export type DisconnectPreview = {
  integrationId: string;
  provider: string;
  label: string;
  accountCount: number;
  brands: Array<{ id: string; name: string }>;
  queuedPostCount: number;
};

export type DisconnectResult = {
  brandsRevoked: string[];
  accountsRemoved: number;
  postsDetached: number;
};

export async function fetchDisconnectPreview(integrationId: string): Promise<DisconnectPreview> {
  return http.request({
    path: `/integrations/connections/${encodeURIComponent(integrationId)}/disconnect-preview`,
    method: 'GET',
    cache: 'no-store',
  });
}

export async function disconnectConnection(integrationId: string): Promise<DisconnectResult> {
  return http.request({
    path: `/integrations/connections/${encodeURIComponent(integrationId)}/disconnect`,
    method: 'POST',
    cache: 'no-store',
  });
}

export async function startGoogleDrivePicker(
  params: StartGoogleDrivePickerParams,
): Promise<GoogleDrivePickerResponse> {
  const { brandId, callbackUrl, context } = params;
  return http.request({
    path: buildSyncPath('/integrations/google-drive/picker', {
      brand_id: brandId,
      callback_url: callbackUrl,
      context,
    }),
    method: 'GET',
    schema: googleDrivePickerResponseSchema,
    cache: 'no-store',
  });
}

export function useStartMetaSync() {
  return useMutation({
    mutationFn: (callbackUrl: string) => startMetaSync(callbackUrl),
  });
}

export function useStartGoogleSync() {
  return useMutation({
    mutationFn: (callbackUrl: string) => startGoogleSync(callbackUrl),
  });
}

// #151: identical mutateAsync(callbackUrl) shape to useStartGoogleSync so
// call sites that branch on provider (e.g. ConnectProviderPopover) can swap
// between the two without touching the rest of the popup flow.
export function useStartGoogleAccountChooserSync() {
  return useMutation({
    mutationFn: (callbackUrl: string) =>
      startGoogleSync(callbackUrl, { forceAccountChooser: true }),
  });
}

export function useResyncMeta() {
  return useMutation({
    mutationFn: (platformEmail?: string) => resyncMeta(platformEmail),
  });
}

export function useStartTikTokSync() {
  return useMutation({
    mutationFn: (callbackUrl: string) => startTikTokSync(callbackUrl),
  });
}

export function useResyncTikTok() {
  return useMutation({
    mutationFn: (platformUserId?: string) => resyncTikTok(platformUserId),
  });
}

export function useStartLinkedInSync() {
  return useMutation({
    mutationFn: (input: string | { callbackUrl: string; mode?: LinkedInSyncMode }) => {
      if (typeof input === 'string') return startLinkedInSync(input);
      return startLinkedInSync(input.callbackUrl, { mode: input.mode });
    },
  });
}

export function useResyncLinkedIn() {
  return useMutation({
    mutationFn: (platformUserId?: string) => resyncLinkedIn(platformUserId),
  });
}

export function useStartXSync() {
  return useMutation({
    mutationFn: (callbackUrl: string) => startXSync(callbackUrl),
  });
}

export function useResyncX() {
  return useMutation({
    mutationFn: (platformUserId?: string) => resyncX(platformUserId),
  });
}

export function useStartGoogleDrivePicker() {
  return useMutation({
    mutationFn: (params: StartGoogleDrivePickerParams) => startGoogleDrivePicker(params),
  });
}

export async function fetchSelectableAssets(userId?: string): Promise<SelectableAssetsResponse> {
  const resolvedUserId = userId ?? (await getBrowserUserId());
  if (!resolvedUserId) {
    throw new Error('Unable to determine user id for selectable assets.');
  }
  const path = `/integrations/brand-profiles/${encodeURIComponent(resolvedUserId)}/selectable-assets`;

  return http.request({
    path,
    method: 'GET',
    schema: selectableAssetsResponseSchema,
    cache: 'no-store',
  });
}

type UseSelectableAssetsOptions = {
  enabled?: boolean;
  staleTimeMs?: number;
  gcTimeMs?: number;
  refetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
};

export function useSelectableAssets(userId?: string, options?: UseSelectableAssetsOptions) {
  return useQuery({
    queryKey: ['selectable-assets', userId ?? 'self'],
    queryFn: () => fetchSelectableAssets(userId),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTimeMs ?? 0,
    gcTime: options?.gcTimeMs ?? 5 * 60 * 1000,
    refetchOnMount: options?.refetchOnMount,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
    refetchOnReconnect: options?.refetchOnReconnect,
  });
}

export async function fetchIntegrationAssets(
  integrationId: string,
): Promise<IntegrationAssetsResponse> {
  if (!integrationId) {
    throw new Error('integrationId is required to fetch integration assets.');
  }

  return http.request({
    path: buildSyncPath('/integrations/assets', { integration_id: integrationId }),
    method: 'GET',
    schema: integrationAssetsResponseSchema,
    cache: 'no-store',
  });
}

export function useIntegrationAssets(integrationId: string | undefined) {
  return useQuery({
    queryKey: ['integration-assets', integrationId ?? 'missing'],
    queryFn: () => {
      if (!integrationId) {
        throw new Error('integrationId is required to fetch integration assets.');
      }
      return fetchIntegrationAssets(integrationId);
    },
    enabled: Boolean(integrationId),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}

export type ApplyBrandProfileIntegrationAccountsParams =
  | { brandId: string; assetPks: string[] }
  | { brandId: string; integrationAccountIds: string[] };

export async function applyBrandProfileIntegrationAccounts(
  params: ApplyBrandProfileIntegrationAccountsParams,
): Promise<LinkIntegrationAccountsResponse> {
  const { brandId } = params;
  const assetPks = 'assetPks' in params ? params.assetPks : params.integrationAccountIds;

  const body = { asset_pks: assetPks };
  const parsedBody = applyBrandProfileIntegrationAccountsRequestSchema.parse(body);

  return http.request({
    path: `/integrations/brand-profiles/${encodeURIComponent(brandId)}/integration-accounts`,
    method: 'POST',
    body: parsedBody,
    schema: linkIntegrationAccountsResponseSchema,
    cache: 'no-store',
  });
}

export function useApplyBrandProfileIntegrationAccounts() {
  return useMutation({
    mutationFn: (params: ApplyBrandProfileIntegrationAccountsParams) =>
      applyBrandProfileIntegrationAccounts(params),
  });
}

export type UserIntegrationAssetRow = {
  id: string;
  integration_id: string;
  type: string | null;
  name: string | null;
  status: string | null;
  external_account_id: string | null;
  ad_account_id: string | null;
  // Computed client-side from the account's stored Graph permissions/tasks; only
  // meaningful for Meta ad accounts. Drives the "Read-only" badge (#155).
  role: MetaAccountRole | null;
};

type RawUserIntegrationAssetRow = Omit<UserIntegrationAssetRow, 'role'> & {
  raw_payload: unknown;
};

// The Graph `permissions`/tasks array lives inside the account's stored
// raw_payload; it can appear either directly or under a nested profile.
function extractPermissions(rawPayload: unknown): unknown {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const payload = rawPayload as Record<string, unknown>;
  if (Array.isArray(payload.permissions)) return payload.permissions;
  const nested = payload.raw_profile;
  if (
    nested &&
    typeof nested === 'object' &&
    Array.isArray((nested as Record<string, unknown>).permissions)
  ) {
    return (nested as Record<string, unknown>).permissions;
  }
  return null;
}

export async function fetchUserIntegrationAssets(): Promise<UserIntegrationAssetRow[]> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('integration_accounts_assets')
    .select(`
      id,
      integration_id,
      type,
      name,
      status,
      external_account_id,
      ad_account_id,
      raw_payload,
      user_integrations!inner(user_id)
    `)
    .eq('user_integrations.user_id', user.id);

  if (error) throw error;
  const rows = (data ?? []) as unknown as RawUserIntegrationAssetRow[];
  return rows.map(({ raw_payload, ...row }) => ({
    ...row,
    role:
      row.type === 'meta_ad_account'
        ? deriveMetaAccountRole(extractPermissions(raw_payload))
        : null,
  }));
}

export function useUserIntegrationAssets() {
  return useQuery({
    queryKey: ['user-integration-assets'],
    queryFn: () => fetchUserIntegrationAssets(),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}

export async function assignBrandIntegrationAccount(
  brandId: string,
  integrationAccountId: string,
): Promise<string> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();

  const { data: existing, error: lookupError } = await supabase
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .select('id')
    .eq('brand_profile_id', brandId)
    .eq('integration_account_id', integrationAccountId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .insert({ brand_profile_id: brandId, integration_account_id: integrationAccountId })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function unassignBrandIntegrationAccount(
  brandId: string,
  integrationAccountId: string,
): Promise<void> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase
    .schema('brand_profiles')
    .from('brand_profile_integration_accounts')
    .delete()
    .eq('brand_profile_id', brandId)
    .eq('integration_account_id', integrationAccountId);

  if (error) throw new Error(error.message);
}

export async function fetchUserTikTokAccountIds(): Promise<string[]> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('integration_accounts_assets')
    .select('id, user_integrations!inner(user_id, provider)')
    .eq('user_integrations.user_id', user.id)
    .eq('user_integrations.provider', 'tiktok');

  if (error) {
    console.error('[fetchUserTikTokAccountIds] query failed', error);
    return [];
  }
  return (data ?? []).map((row: { id: string }) => row.id);
}

export async function fetchUserLinkedInAccountIds(options?: {
  type?: 'linkedin_ad_account' | 'linkedin_organization';
}): Promise<string[]> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  let query = supabase
    .schema('brand_profiles')
    .from('integration_accounts_assets')
    .select('id, user_integrations!inner(user_id, provider)')
    .eq('user_integrations.user_id', user.id)
    .eq('user_integrations.provider', 'linkedin');
  if (options?.type) {
    query = query.eq('type', options.type);
  }
  const { data, error } = await query;

  if (error) {
    console.error('[fetchUserLinkedInAccountIds] query failed', error);
    return [];
  }
  return (data ?? []).map((row: { id: string }) => row.id);
}

export async function fetchUserXAccountIds(): Promise<string[]> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('integration_accounts_assets')
    .select('id, user_integrations!inner(user_id, provider)')
    .eq('user_integrations.user_id', user.id)
    .eq('user_integrations.provider', 'x');

  if (error) {
    console.error('[fetchUserXAccountIds] query failed', error);
    return [];
  }
  return (data ?? []).map((row: { id: string }) => row.id);
}
