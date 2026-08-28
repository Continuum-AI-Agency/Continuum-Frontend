'use client';

// The burn-in's resolved face and ink, for the surfaces that have to NAME them.
//
// The op resolves the same two things at run time from the same reader and the same pure
// chain; this hook exists so the config panel and the node badge can say which rung was used
// BEFORE anything runs. A fallback face is fine — an unlabelled one is not, and a panel that
// cannot see the source cannot label it.
//
// It also registers a preloaded family on this thread's font set, because the panel's block
// preview is measured with `ctx.measureText`: without the face the preview sizes the block in
// Helvetica and the render burns it in Montserrat, and the user drags a rectangle that is not
// the one they get.

import {
  type BrandTypeInputs,
  type DesignSystemSnapshot,
  resolveBrandType,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ensureCaptionFonts } from '@/lib/clips/captionFonts';
import { brandTypeInputsQueryKey, loadBrandTypeInputs } from './brandTypeInputs.client';

export interface BrandTypeState {
  /** Everything reachable about the brand — what the panel feeds the pure resolvers. */
  readonly inputs: BrandTypeInputs;
  /** The design system alone, for the swatch list that still needs named tokens. */
  readonly snapshot: DesignSystemSnapshot | null;
  /**
   * True once the font set is as good as it is going to get for this family — the preloaded
   * face registered, or there was never a file to register. Either way the wait is over and a
   * canvas measure is now the one the render will use.
   */
  readonly facesReady: boolean;
  readonly isLoading: boolean;
}

const EMPTY: BrandTypeInputs = {};

export function useBrandType(brandId?: string): BrandTypeState {
  const query = useQuery({
    queryKey: brandTypeInputsQueryKey(brandId),
    queryFn: () => loadBrandTypeInputs(brandId),
    enabled: Boolean(brandId),
    staleTime: 5 * 60_000,
  });
  const inputs = query.data ?? EMPTY;
  const family = resolveBrandType(inputs).display;
  const [readyFamily, setReadyFamily] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Settled either way. A brand's own family has no file behind it and never will register;
    // waiting forever for that would leave the panel measuring nothing at all.
    void ensureCaptionFonts([family]).finally(() => {
      if (!cancelled) setReadyFamily(family);
    });
    return () => {
      cancelled = true;
    };
  }, [family]);

  return {
    inputs,
    snapshot: inputs.designSystem ?? null,
    facesReady: readyFamily === family,
    isLoading: query.isLoading,
  };
}
