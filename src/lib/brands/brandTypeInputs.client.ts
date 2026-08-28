'use client';

// Every brand shape the browser can reach, in one read.
//
// ONE READER, TWO CALLERS. The workflow runner resolves a brand mid-run and the burn-in's
// config panel previews the same resolution before anything runs; if they gathered the brand
// separately the panel could promise a face the render does not use. `resolveBrandType`
// (contracts) is pure, so the only way the two can disagree is by being fed different inputs —
// which is exactly what this module exists to prevent.
//
// BEST-EFFORT AND NEVER THROWN FROM. A failed read and an absent value both collapse to the
// same null, because the chain treats them the same: step to the next rung. Raising here would
// put a network blip in front of a render the fallback face could have finished.

import type { BrandTypeInputs } from '@continuum/contracts';
import { fetchBrandKit } from './brandKit.client';
import { fetchDesignSystem } from './designSystem.client';
import { fetchBrandBookClient } from './useBrandBook.client';

const attempt = async <T>(read: () => Promise<T | null>): Promise<T | null> => {
  try {
    return await read();
  } catch {
    return null;
  }
};

export async function loadBrandTypeInputs(brandId: string | undefined): Promise<BrandTypeInputs> {
  if (!brandId) return {};
  const [designSystem, book, kit] = await Promise.all([
    attempt(async () => (await fetchDesignSystem(brandId)).design_system),
    attempt(() => fetchBrandBookClient(brandId)),
    attempt(() => fetchBrandKit(brandId)),
  ]);
  return { designSystem, brandMd: book?.brand_tokens ?? null, brandKit: kit };
}

export const brandTypeInputsQueryKey = (brandId?: string) =>
  ['brand-type-inputs', brandId] as const;
