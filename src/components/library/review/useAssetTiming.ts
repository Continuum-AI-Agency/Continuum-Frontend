'use client';

// A video version's frame rate and start timecode, for SMPTE labels on surfaces
// that are not next to the playing file (comment list, editor view). Read once per
// version per page and shared; null while loading, when not wanted, or unreadable.

import type { AssetTiming } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { fetchAssetTiming } from '@/lib/library/comments';

const cache = new Map<string, Promise<AssetTiming | null>>();

export function useAssetTiming(
  params: { brandId: string; assetId: string; versionId: string | null } | null,
): AssetTiming | null {
  const key = params ? `${params.brandId}:${params.assetId}:${params.versionId ?? 'head'}` : null;
  const [timing, setTiming] = useState<AssetTiming | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` fully encodes `params`
  useEffect(() => {
    if (!key || !params) return;
    let pending = cache.get(key);
    if (!pending) {
      pending = fetchAssetTiming(params).catch((error: unknown) => {
        console.warn('[useAssetTiming] timing unavailable', error);
        cache.delete(key);
        return null;
      });
      cache.set(key, pending);
    }
    let cancelled = false;
    void pending.then((value) => {
      if (!cancelled) setTiming(value);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return timing;
}
