"use client";

import { http } from "@/lib/api/http";
import { instagramTopMediaResponseSchema, type InstagramTopMediaResponse } from "@continuum/contracts";

// Fetches a public Instagram account's top media by username via the Backend
// (Graph business_discovery). Auth bearer is attached by http.request; non-ok
// responses throw ApiError with the Backend `code` (IG_VIEWER_UNAVAILABLE /
// IG_ACCOUNT_NOT_FOUND) so the caller can show a tailored notice.
export interface FetchInstagramTopMediaParams {
  brandId: string;
  username: string;
  signal?: AbortSignal;
}

export async function fetchInstagramTopMedia({
  brandId,
  username,
  signal,
}: FetchInstagramTopMediaParams): Promise<InstagramTopMediaResponse> {
  return http.request<InstagramTopMediaResponse>({
    path: "/api/ai-studio/instagram/top-media",
    method: "POST",
    body: { brandId, username },
    schema: instagramTopMediaResponseSchema,
    cache: "no-store",
    signal,
  });
}
