"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/lib/api/http";
import {
  metaSyncResponseSchema,
  googleSyncResponseSchema,
  googleDrivePickerResponseSchema,
  tiktokSyncResponseSchema,
  tiktokResyncResponseSchema,
  selectableAssetsResponseSchema,
  integrationAssetsResponseSchema,
  applyBrandProfileIntegrationAccountsRequestSchema,
  linkIntegrationAccountsResponseSchema,
  type SelectableAssetsResponse,
  type IntegrationAssetsResponse,
  type LinkIntegrationAccountsResponse,
  type MetaSyncResponse,
  type GoogleSyncResponse,
  type GoogleDrivePickerResponse,
  type TikTokSyncResponse,
  type TikTokResyncResponse,
} from "@/lib/schemas/integrations";

function buildSyncPath(basePath: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${basePath}?${search.toString()}`;
}

async function getBrowserUserId(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? undefined;
  } catch {
    return undefined;
  }
}

export async function startMetaSync(callbackUrl: string): Promise<MetaSyncResponse> {
  return http.request({
    path: buildSyncPath("/integrations/meta/sync", { callback_url: callbackUrl }),
    method: "GET",
    schema: metaSyncResponseSchema,
    cache: "no-store",
  });
}

export async function startGoogleSync(callbackUrl: string): Promise<GoogleSyncResponse> {
  return http.request({
    path: buildSyncPath("/integrations/google/sync", { callback_url: callbackUrl }),
    method: "GET",
    schema: googleSyncResponseSchema,
    cache: "no-store",
  });
}

export async function deauthorizeMeta(): Promise<void> {
  await http.request({
    path: "/integrations/meta/deauthorize",
    method: "POST",
    cache: "no-store",
  });
}

export async function deauthorizeGoogle(): Promise<void> {
  await http.request({
    path: "/integrations/google/deauthorize",
    method: "POST",
    cache: "no-store",
  });
}

export async function startTikTokSync(callbackUrl: string): Promise<TikTokSyncResponse> {
  return http.request({
    path: buildSyncPath("/integrations/tiktok/sync", { callback_url: callbackUrl }),
    method: "GET",
    schema: tiktokSyncResponseSchema,
    cache: "no-store",
  });
}

export async function resyncTikTok(platformUserId?: string): Promise<TikTokResyncResponse> {
  return http.request({
    path: "/integrations/tiktok/resync",
    method: "POST",
    body: platformUserId ? { platform_user_id: platformUserId } : {},
    schema: tiktokResyncResponseSchema,
    cache: "no-store",
  });
}

export async function deauthorizeTikTok(platformUserId: string): Promise<void> {
  await http.request({
    path: "/integrations/tiktok/deauthorize",
    method: "POST",
    body: { platform_user_id: platformUserId },
    cache: "no-store",
  });
}

type StartGoogleDrivePickerParams = {
  brandId: string;
  callbackUrl: string;
  context: string;
};

export async function startGoogleDrivePicker(
  params: StartGoogleDrivePickerParams
): Promise<GoogleDrivePickerResponse> {
  const { brandId, callbackUrl, context } = params;
  return http.request({
    path: buildSyncPath("/integrations/google-drive/picker", {
      brand_id: brandId,
      callback_url: callbackUrl,
      context,
    }),
    method: "GET",
    schema: googleDrivePickerResponseSchema,
    cache: "no-store",
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

export function useDeauthorizeMeta() {
  return useMutation({
    mutationFn: () => deauthorizeMeta(),
  });
}

export function useDeauthorizeGoogle() {
  return useMutation({
    mutationFn: () => deauthorizeGoogle(),
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

export function useDeauthorizeTikTok() {
  return useMutation({
    mutationFn: (platformUserId: string) => deauthorizeTikTok(platformUserId),
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
    throw new Error("Unable to determine user id for selectable assets.");
  }
  const path = `/integrations/brand-profiles/${encodeURIComponent(resolvedUserId)}/selectable-assets`;

  return http.request({
    path,
    method: "GET",
    schema: selectableAssetsResponseSchema,
    cache: "no-store",
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
    queryKey: ["selectable-assets", userId ?? "self"],
    queryFn: () => fetchSelectableAssets(userId),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTimeMs ?? 0,
    gcTime: options?.gcTimeMs ?? 5 * 60 * 1000,
    refetchOnMount: options?.refetchOnMount,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
    refetchOnReconnect: options?.refetchOnReconnect,
  });
}

export async function fetchIntegrationAssets(integrationId: string): Promise<IntegrationAssetsResponse> {
  if (!integrationId) {
    throw new Error("integrationId is required to fetch integration assets.");
  }

  return http.request({
    path: buildSyncPath("/integrations/assets", { integration_id: integrationId }),
    method: "GET",
    schema: integrationAssetsResponseSchema,
    cache: "no-store",
  });
}

export function useIntegrationAssets(integrationId: string | undefined) {
  return useQuery({
    queryKey: ["integration-assets", integrationId ?? "missing"],
    queryFn: () => {
      if (!integrationId) {
        throw new Error("integrationId is required to fetch integration assets.");
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
  params: ApplyBrandProfileIntegrationAccountsParams
): Promise<LinkIntegrationAccountsResponse> {
  const { brandId } = params;
  const assetPks = "assetPks" in params
    ? params.assetPks
    : params.integrationAccountIds;

  const body = { asset_pks: assetPks };
  const parsedBody = applyBrandProfileIntegrationAccountsRequestSchema.parse(body);

  return http.request({
    path: `/integrations/brand-profiles/${encodeURIComponent(brandId)}/integration-accounts`,
    method: "POST",
    body: parsedBody,
    schema: linkIntegrationAccountsResponseSchema,
    cache: "no-store",
  });
}

export function useApplyBrandProfileIntegrationAccounts() {
  return useMutation({
    mutationFn: (params: ApplyBrandProfileIntegrationAccountsParams) => applyBrandProfileIntegrationAccounts(params),
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
};

export async function fetchUserIntegrationAssets(): Promise<UserIntegrationAssetRow[]> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = createSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select(`
      id,
      integration_id,
      type,
      name,
      status,
      external_account_id,
      ad_account_id,
      user_integrations!inner(user_id)
    `)
    .eq("user_integrations.user_id", user.id);

  if (error) throw error;
  return (data ?? []) as unknown as UserIntegrationAssetRow[];
}

export function useUserIntegrationAssets() {
  return useQuery({
    queryKey: ["user-integration-assets"],
    queryFn: () => fetchUserIntegrationAssets(),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}

export async function applyBrandAssignmentsDirect(
  brandId: string,
  desiredAccountIds: string[]
): Promise<{ linked: number }> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = createSupabaseBrowserClient();

  // Fetch current assignments for this brand
  const { data: existing, error: fetchError } = await supabase
    .schema("brand_profiles")
    .from("brand_profile_integration_accounts")
    .select("id, integration_account_id")
    .eq("brand_profile_id", brandId);

  if (fetchError) throw new Error(fetchError.message);

  const existingIds = new Set((existing ?? []).map((r: { integration_account_id: string }) => r.integration_account_id));
  const desiredSet = new Set(desiredAccountIds);

  // Delete removed assignments
  const toRemove = (existing ?? []).filter(
    (r: { integration_account_id: string }) => !desiredSet.has(r.integration_account_id)
  );
  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .delete()
      .in("id", toRemove.map((r: { id: string }) => r.id));
    if (deleteError) throw new Error(deleteError.message);
  }

  // Insert new assignments
  const toAdd = desiredAccountIds.filter((id) => !existingIds.has(id));
  if (toAdd.length > 0) {
    const { error: insertError } = await supabase
      .schema("brand_profiles")
      .from("brand_profile_integration_accounts")
      .insert(
        toAdd.map((accountId) => ({
          brand_profile_id: brandId,
          integration_account_id: accountId,
        }))
      );
    if (insertError) throw new Error(insertError.message);
  }

  return { linked: desiredAccountIds.length };
}

export async function fetchUserTikTokAccountIds(): Promise<string[]> {
  const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
  const supabase = createSupabaseBrowserClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .schema("brand_profiles")
    .from("integration_accounts_assets")
    .select("id, user_integrations!inner(user_id, provider)")
    .eq("user_integrations.user_id", user.id)
    .eq("user_integrations.provider", "tiktok");

  if (error) {
    console.error("[fetchUserTikTokAccountIds] query failed", error);
    return [];
  }
  return (data ?? []).map((row: { id: string }) => row.id);
}
