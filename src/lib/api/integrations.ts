"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/lib/api/http";
import {
  metaSyncResponseSchema,
  googleSyncResponseSchema,
  googleDrivePickerResponseSchema,
  selectableAssetsResponseSchema,
  linkIntegrationAccountsResponseSchema,
  type SelectableAssetsResponse,
  type LinkIntegrationAccountsResponse,
  type MetaSyncResponse,
  type GoogleSyncResponse,
  type GoogleDrivePickerResponse,
} from "@/lib/schemas/integrations";

function buildSyncPath(basePath: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `${basePath}?${search.toString()}`;
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

export function useStartGoogleDrivePicker() {
  return useMutation({
    mutationFn: (params: StartGoogleDrivePickerParams) => startGoogleDrivePicker(params),
  });
}

export async function fetchSelectableAssets(userId?: string): Promise<SelectableAssetsResponse> {
  const path = userId
    ? `/brand-profiles/${encodeURIComponent(userId)}/selectable-assets`
    : "/brand-profiles/selectable-assets";

  return http.request({
    path,
    method: "GET",
    schema: selectableAssetsResponseSchema,
    cache: "no-store",
  });
}

export function useSelectableAssets(userId?: string) {
  return useQuery({
    queryKey: ["selectable-assets", userId ?? "self"],
    queryFn: () => fetchSelectableAssets(userId),
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
}

export async function linkIntegrationAccounts(
  brandId: string,
  assetPks: string[]
): Promise<LinkIntegrationAccountsResponse> {
  if (!assetPks.length) {
    throw new Error("No assets selected to link.");
  }
  return http.request({
    path: `/brand-profiles/${encodeURIComponent(brandId)}/integration-accounts`,
    method: "POST",
    body: { asset_pks: assetPks },
    schema: linkIntegrationAccountsResponseSchema,
    cache: "no-store",
  });
}
