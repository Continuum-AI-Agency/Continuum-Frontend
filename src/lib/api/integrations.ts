"use client";

import { useMutation } from "@tanstack/react-query";
import { http } from "@/lib/api/http";
import {
  metaSyncResponseSchema,
  googleSyncResponseSchema,
  type MetaSyncResponse,
  type GoogleSyncResponse,
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