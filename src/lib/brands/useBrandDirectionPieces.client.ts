'use client';

import type { AuthoredBrandPiece } from '@continuum/contracts';
import React from 'react';

import { fetchBrandDirectionPieces } from '@/lib/api/brandDirectionPieces.client';

export type BrandDirectionPiecesState = {
  readonly pieces: readonly AuthoredBrandPiece[];
  /** Null when this brand has authored no v2 direction — a real answer, not an error. */
  readonly directionVersion: number | null;
  readonly isLoading: boolean;
  /** Set when the READ failed, which must not look like "the brand authored nothing". */
  readonly error: string | null;
};

const EMPTY: BrandDirectionPiecesState = {
  pieces: [],
  directionVersion: null,
  isLoading: false,
  error: null,
};

/**
 * The creative-direction pieces this brand has authored.
 *
 * Distinguishes three states a control panel must not conflate: still loading, the brand has
 * written nothing, and the read failed. The last two would otherwise render an identical
 * empty panel, and only one of them means "there is nothing to switch on".
 */
export function useBrandDirectionPieces(brandId?: string): BrandDirectionPiecesState {
  const [state, setState] = React.useState<BrandDirectionPiecesState>(EMPTY);

  React.useEffect(() => {
    if (!brandId) {
      setState(EMPTY);
      return;
    }

    const controller = new AbortController();
    setState({ ...EMPTY, isLoading: true });

    fetchBrandDirectionPieces(brandId, controller.signal)
      .then((response) =>
        setState({
          pieces: response.pieces,
          directionVersion: response.directionVersion,
          isLoading: false,
          error: null,
        }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          ...EMPTY,
          error: error instanceof Error ? error.message : 'Could not read creative direction.',
        });
      });

    return () => controller.abort();
  }, [brandId]);

  return state;
}
