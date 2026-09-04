'use client';

import type { AuthoredBrandPiece } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';

import { fetchBrandDirectionPieces } from '@/lib/api/brandDirectionPieces.client';

export type BrandDirectionPiecesState = {
  readonly pieces: readonly AuthoredBrandPiece[];
  /** Null when this brand has authored no v2 direction — a real answer, not an error. */
  readonly directionVersion: number | null;
  readonly isLoading: boolean;
  /** Set when the READ failed, which must not look like "the brand authored nothing". */
  readonly error: string | null;
};

/** Module-level so the empty answer keeps one identity: callers put `pieces` straight into
 *  `useCallback` deps, and a fresh `[]` per render would rebuild those on every render. */
const NO_PIECES: readonly AuthoredBrandPiece[] = [];

export const brandDirectionPiecesQueryKey = (brandId?: string) =>
  ['brand-direction-pieces', brandId] as const;

/**
 * The creative-direction pieces this brand has authored.
 *
 * Distinguishes three states a control panel must not conflate: still loading, the brand has
 * written nothing, and the read failed. The last two would otherwise render an identical
 * empty panel, and only one of them means "there is nothing to switch on".
 *
 * Goes through React Query because the answer is per-BRAND, not per-caller: the node
 * inspector mounts this hook twice over (its own toggle handlers, then the popover it
 * renders), and every generation node on the canvas mounts it again. One shared key
 * collapses all of them into a single request.
 */
export function useBrandDirectionPieces(brandId?: string): BrandDirectionPiecesState {
  const query = useQuery({
    queryKey: brandDirectionPiecesQueryKey(brandId),
    queryFn: ({ signal }) => fetchBrandDirectionPieces(brandId as string, signal),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });

  return {
    pieces: query.data?.pieces ?? NO_PIECES,
    directionVersion: query.data?.directionVersion ?? null,
    isLoading: query.isLoading,
    error: query.error
      ? query.error instanceof Error
        ? query.error.message
        : 'Could not read creative direction.'
      : null,
  };
}
