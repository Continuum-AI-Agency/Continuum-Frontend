'use client';

import { type UnsplashSearchResponse, unsplashSearchResponseSchema } from '@continuum/contracts';
import { http } from '@/lib/api/http';

// Unsplash stock search via the Backend. Always proxied — Unsplash's API
// Guidelines require the Access Key to stay confidential, so there is no
// browser-side variant of this call to fall back on.

export interface SearchUnsplashParams {
  brandId: string;
  query: string;
  page?: number;
  perPage?: number;
  orientation?: 'landscape' | 'portrait' | 'squarish';
  signal?: AbortSignal;
}

export async function searchUnsplash({
  brandId,
  query,
  page = 1,
  perPage = 24,
  orientation,
  signal,
}: SearchUnsplashParams): Promise<UnsplashSearchResponse> {
  return http.request<UnsplashSearchResponse>({
    path: '/api/ai-studio/unsplash/search',
    method: 'POST',
    body: orientation
      ? { brandId, query, page, perPage, orientation }
      : { brandId, query, page, perPage },
    schema: unsplashSearchResponseSchema,
    cache: 'no-store',
    signal,
  });
}

/**
 * Tell Unsplash a photo was selected for use.
 *
 * Required by the API Guidelines and deliberately unawaited by callers: it
 * credits the photographer, and a failure to record that must never stop a photo
 * reaching the canvas.
 */
export async function trackUnsplashDownload(params: {
  brandId: string;
  downloadLocation: string;
}): Promise<void> {
  try {
    await http.request<unknown>({
      path: '/api/ai-studio/unsplash/track-download',
      method: 'POST',
      body: params,
      cache: 'no-store',
    });
  } catch {
    // Analytics for Unsplash, not state for us.
  }
}
