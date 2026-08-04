'use client';

import {
  type BrandDirectionPiecesResponse,
  brandDirectionPiecesResponseSchema,
} from '@continuum/contracts';

import { http } from '@/lib/api/http';

/**
 * Which creative-direction pieces a brand has actually authored.
 *
 * Used to build the Canvas compiler toggles. Validated by `schema` rather than cast: a
 * control panel is a promise that flipping a switch changes the prompt, and rendering one
 * from an unvalidated payload is how a brand ends up with a toggle for a piece it never
 * wrote.
 */
export async function fetchBrandDirectionPieces(
  brandId: string,
  signal?: AbortSignal,
): Promise<BrandDirectionPiecesResponse> {
  return http.request({
    path: `/api/ai-studio/brands/${brandId}/direction-pieces`,
    schema: brandDirectionPiecesResponseSchema,
    signal,
  });
}
