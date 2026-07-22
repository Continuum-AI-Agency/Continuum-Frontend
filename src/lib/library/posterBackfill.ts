// Decides whether a video asset is worth an opportunistic, client-side poster
// backfill. This is the counterpart to upload-time poster generation: it heals
// AI-generated and legacy videos that were never uploaded through a browser and
// so have no poster rendition at all.
//
// The rule is deliberately conservative — a backfill costs a full video download
// plus a WebCodecs decode, so it only fires for a video that has bytes to decode
// (`signedUrl`) and genuinely nothing to show yet: no ready image preview and no
// legacy thumbnail. Anything already painted is left alone.

import type { MediaAsset } from '@continuum/contracts';

export function shouldBackfillPoster(asset: MediaAsset): boolean {
  if (asset.kind !== 'video') return false;
  if (!asset.signedUrl) return false;
  const hasReadyImagePreview = asset.preview?.state === 'ready' && asset.preview.kind === 'image';
  if (hasReadyImagePreview) return false;
  if (asset.thumbnailUrl) return false;
  return true;
}
