'use client';

import { MEDIA_LIBRARY_BUCKET, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

/**
 * Save a composed layer document into the media library.
 *
 * The composite is an in-browser Blob with no storage path, so this takes the same
 * signed-upload route `persistTimelineRender.ts` does — the Library UI's own path —
 * which lands a real, browsable `media.assets` row and kicks off auto-analysis.
 *
 * Storing the durable coordinates rather than only the signed URL is what makes the
 * output survive a reload (signed URLs expire; bucket + path are re-signable), and it
 * is also what lets `executeWorkflow`'s existing `registerCanvasIfDurable` register the
 * composite during a run: that helper refuses `data:` URLs and needs a bucket and a
 * storage path, so a data-URL-only output would silently never reach the Library.
 */
export interface PersistedLayerComposite {
  assetId: string;
  versionId: string;
  bucket: string;
  storagePath: string;
  signedUrl: string;
}

export async function persistLayerComposite(params: {
  blob: Blob;
  brandId: string;
  nodeId: string;
}): Promise<PersistedLayerComposite> {
  const { blob, brandId, nodeId } = params;
  const file = new File([blob], `layer-composite-${nodeId}.png`, {
    type: blob.type || 'image/png',
  });
  const result = await uploadMediaAsset({ file, brandId });
  return {
    assetId: result.assetId,
    versionId: result.versionId,
    bucket: MEDIA_LIBRARY_BUCKET,
    storagePath: result.storagePath,
    signedUrl: result.signedUrl,
  };
}

/** A PNG data URL as a Blob, for the upload above. */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
