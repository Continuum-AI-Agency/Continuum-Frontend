'use client';

import { MEDIA_LIBRARY_BUCKET, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

// Save a finalized, browser-rendered Video Editor clip into the media library.
// The render is an in-browser Blob with no storage path yet, so this uses the
// library-upload signed-upload flow (sign → PUT → register) — the same path the
// Library UI uses — which lands a real, browsable `media.assets` row and kicks
// off auto-analysis. Returns the durable storage coordinates so the node can
// persist a re-signable reference (signed URLs expire; bucket+storagePath
// survive canvas serialization and are re-signed on reload).

export type PersistedTimelineRender = {
  assetId: string;
  versionId: string;
  bucket: string;
  storagePath: string;
  signedUrl: string;
};

export async function persistTimelineRender(params: {
  blob: Blob;
  brandId: string;
  nodeId: string;
}): Promise<PersistedTimelineRender> {
  const { blob, brandId, nodeId } = params;
  const fileName = `video-edit-${nodeId}.mp4`;
  const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });

  const result = await uploadMediaAsset({ file, brandId });

  return {
    assetId: result.assetId,
    versionId: result.versionId,
    bucket: MEDIA_LIBRARY_BUCKET,
    storagePath: result.storagePath,
    signedUrl: result.signedUrl,
  };
}
