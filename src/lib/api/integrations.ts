"use client";

import { useMutation } from "@tanstack/react-query";
import { http } from "@/lib/api/http";
import {
  metaSyncResponseSchema,
  googleSyncResponseSchema,
  googleDrivePickerResponseSchema,
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