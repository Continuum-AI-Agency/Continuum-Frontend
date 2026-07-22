'use client';

// Opportunistic, client-side poster backfill for a video the user just opened.
//
// Upload-time poster generation only covers videos uploaded through a browser;
// AI-generated and legacy videos arrive with no poster and paint a blank card.
// The detail modal already downloads the video bytes for playback, so this is
// the one place the extra decode is nearly free — mount it ONLY there, never on
// the grid card (which would download every off-screen video and defeat
// `preload="none"`).
//
// Fire-and-forget and fail-soft: a poster that cannot be decoded, encoded, or
// stored leaves the asset exactly as it was, and every asset is attempted at
// most once per session so a permanently-undecodable video never loops.

import type { MediaAsset } from '@continuum/contracts';
import { useEffect } from 'react';
import { persistAssetRendition } from '@/lib/library/assetPreview';
import { ensureAssetHeadVersion } from '@/lib/library/creativeOperations';
import { shouldBackfillPoster } from '@/lib/library/posterBackfill';
import { writeAssetSourceMetadata } from '@/lib/library/sourceMetadata';
import { generateVideoPoster } from '@/lib/library/videoPoster';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const SESSION_KEY_PREFIX = 'continuum:library:poster-backfill:';

// Concurrency 1 across the whole tab: a WebCodecs decode is heavy, and opening a
// second video before the first finishes must not run two at once.
const inFlight = new Set<string>();

function alreadyAttempted(assetId: string): boolean {
  if (inFlight.has(assetId)) return true;
  try {
    return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${assetId}`) === '1';
  } catch {
    return false;
  }
}

function markAttempted(assetId: string): void {
  try {
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${assetId}`, '1');
  } catch {
    // Private-mode / quota: the in-flight Set still prevents same-session loops.
  }
}

async function backfillPoster(brandId: string, asset: MediaAsset): Promise<boolean> {
  const src = asset.signedUrl;
  if (!src) return false;
  const response = await fetch(src);
  if (!response.ok) return false;
  const blob = await response.blob();
  const poster = await generateVideoPoster(blob);
  if (!poster) return false;

  const client = createSupabaseBrowserClient();
  const versionId =
    asset.headVersionId ??
    (await ensureAssetHeadVersion(client, { brandId, assetId: asset.id })).headVersionId;
  await persistAssetRendition({
    client,
    brandId,
    assetId: asset.id,
    assetVersionId: versionId,
    role: 'poster',
    blob: poster.blob,
    mimeType: poster.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
    width: poster.width,
    height: poster.height,
    renderer: 'mediabunny-backfill-poster',
    posterSource: 'auto',
    sourceTimestampMs: Math.round(poster.timestampSec * 1000),
  });
  // The decode that produced the poster also yielded source dimensions/duration —
  // heal media.assets while we have them, so legacy videos gain a working
  // duration sort and dimension readout the same moment they gain a poster.
  await writeAssetSourceMetadata({
    client,
    brandId,
    assetId: asset.id,
    metadata: {
      width: poster.sourceWidth,
      height: poster.sourceHeight,
      durationMs: poster.durationMs,
    },
  });
  return true;
}

export function useOpportunisticPoster(
  brandId: string,
  asset: MediaAsset,
  onPosterChanged?: () => void,
): void {
  useEffect(() => {
    if (!shouldBackfillPoster(asset)) return;
    if (alreadyAttempted(asset.id)) return;

    let cancelled = false;
    const assetId = asset.id;
    inFlight.add(assetId);
    markAttempted(assetId);

    void backfillPoster(brandId, asset)
      .then((changed) => {
        if (changed && !cancelled) onPosterChanged?.();
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight.delete(assetId);
      });

    return () => {
      cancelled = true;
    };
    // Any extra re-run is a cheap no-op: the once-per-asset guard short-circuits
    // before touching the network, so listing every referenced value is safe.
  }, [brandId, asset, onPosterChanged]);
}
