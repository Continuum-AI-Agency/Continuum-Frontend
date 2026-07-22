'use client';

import {
  type InstagramTopMediaResponse,
  instagramTopMediaResponseSchema,
} from '@continuum/contracts';
import { http } from '@/lib/api/http';

// Fetches Instagram top media via the Backend. With a `username`, searches that
// public account (Graph business_discovery); without one, the Backend returns
// the brand's OWN connected account media (auto-resolve, no handle to type).
// Auth bearer is attached by http.request; non-ok responses throw ApiError with
// the Backend `code` (IG_VIEWER_UNAVAILABLE / IG_ACCOUNT_NOT_FOUND) so the caller
// can show a tailored notice.
export interface FetchInstagramTopMediaParams {
  brandId: string;
  username?: string;
  signal?: AbortSignal;
}

export async function fetchInstagramTopMedia({
  brandId,
  username,
  signal,
}: FetchInstagramTopMediaParams): Promise<InstagramTopMediaResponse> {
  return http.request<InstagramTopMediaResponse>({
    path: '/api/ai-studio/instagram/top-media',
    method: 'POST',
    body: username ? { brandId, username } : { brandId },
    schema: instagramTopMediaResponseSchema,
    cache: 'no-store',
    signal,
  });
}
