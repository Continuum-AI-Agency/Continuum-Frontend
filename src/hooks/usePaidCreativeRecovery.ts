'use client';

// Shared expired-thumbnail recovery for paid Meta creatives. Meta CDN URLs
// expire; the Jaina creative-preview endpoint re-resolves a FRESH URL from the
// Graph. Surfaces pass `recover` as a ChatMediaThumb onRecover and re-read
// `freshUrlById` — a resolved URL overrides the stale one and the thumb
// retries automatically (failure state is keyed to the failed URL).

import type { DatasetCreativeRef, JainaCreativePreviewResponse } from '@continuum/contracts';
import { useCallback, useRef, useState } from 'react';
import { fetchJainaCreativePreview } from '@/lib/api/jainaCreativePreview.client';

type FetchPreview = (ref: DatasetCreativeRef) => Promise<JainaCreativePreviewResponse>;

export function usePaidCreativeRecovery({
  brandId,
  adAccountId,
  fetchImpl = fetchJainaCreativePreview,
}: {
  brandId: string | null | undefined;
  adAccountId: string | null | undefined;
  fetchImpl?: FetchPreview;
}) {
  const [freshUrlById, setFreshUrlById] = useState<Record<string, string>>({});
  // One resolve attempt per ad — a URL that fails twice is dead, not stale.
  const attemptedIds = useRef<Set<string>>(new Set());

  const recover = useCallback(
    (adId: string) => {
      if (!brandId || !adAccountId || attemptedIds.current.has(adId)) return;
      attemptedIds.current.add(adId);
      fetchImpl({
        brand_id: brandId,
        ad_account_id: adAccountId,
        ad_id: adId,
        creative_id: null,
        asset_id: null,
        bucket: null,
        storage_path: null,
        thumbnail_url: null,
      })
        .then((preview) => {
          // Full-size first. Recovery exists to replace a dead URL with a live one —
          // taking the 64x64 first meant a healed tile came back less readable than
          // the one that failed.
          const url = preview.image_url ?? preview.thumbnail_url;
          if (url) setFreshUrlById((prev) => ({ ...prev, [adId]: url }));
        })
        .catch(() => {
          // Best-effort: the thumb keeps its branded fallback tile.
        });
    },
    [adAccountId, brandId, fetchImpl],
  );

  return { freshUrlById, recover };
}
