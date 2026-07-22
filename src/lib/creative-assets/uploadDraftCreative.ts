// Uploads a locally-selected/dropped creative to durable storage and returns a
// schema-valid MediaAsset ready to place into an organic draft via
// useDraftMediaPlacement. Mirrors StudioCanvas/utils/uploadReferenceFile.ts (the
// canvas equivalent) but writes into a draft instead of a canvas node.
//
// Flow: uploadMediaAsset (library-upload edge fn — browser PUTs straight to
// storage, registers the media.assets row, returns a signed URL) → synthesize a
// MediaAsset. Deps are injected so the orchestration is testable without the
// network.

import { type MediaAsset, mediaAssetSchema } from '@continuum/contracts';

import { MEDIA_LIBRARY_BUCKET, uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

// Uploads reuse the media-library bucket, so a dropped creative also becomes a
// browsable library asset.
export const DRAFT_UPLOAD_BUCKET = MEDIA_LIBRARY_BUCKET;

export type UploadStatus = 'processing' | 'ready' | 'error';

export interface UploadDraftCreativeDeps {
  uploadAsset?: (params: {
    file: File;
    brandId: string;
  }) => Promise<{ assetId: string; storagePath: string; signedUrl: string }>;
  // Called as each file moves through its lifecycle; `index` is its position in a
  // multi-file batch (0 for the single-file path).
  onStatus?: (status: UploadStatus, index: number) => void;
}

function synthesizeAsset(params: {
  assetId: string;
  storagePath: string;
  signedUrl: string;
  file: File;
  brandId: string;
}): MediaAsset {
  const now = new Date().toISOString();
  return mediaAssetSchema.parse({
    id: params.assetId,
    brandId: params.brandId,
    kind: params.file.type.startsWith('video/') ? 'video' : 'image',
    bucket: DRAFT_UPLOAD_BUCKET,
    storagePath: params.storagePath,
    fileName: params.file.name || 'upload',
    mimeType: params.file.type || 'application/octet-stream',
    source: 'upload',
    status: 'stored',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: now,
    updatedAt: now,
    signedUrl: params.signedUrl,
  });
}

async function uploadOne(
  file: File,
  brandId: string,
  index: number,
  deps: UploadDraftCreativeDeps,
): Promise<MediaAsset | null> {
  const uploadAsset = deps.uploadAsset ?? ((p) => uploadMediaAsset(p));
  deps.onStatus?.('processing', index);
  try {
    const { assetId, storagePath, signedUrl } = await uploadAsset({ file, brandId });
    const asset = synthesizeAsset({ assetId, storagePath, signedUrl, file, brandId });
    deps.onStatus?.('ready', index);
    return asset;
  } catch (err) {
    console.warn('[organic] uploadDraftCreative failed', err);
    deps.onStatus?.('error', index);
    return null;
  }
}

export async function uploadDraftCreative(
  params: { file: File; brandId: string },
  deps: UploadDraftCreativeDeps = {},
): Promise<MediaAsset | null> {
  return uploadOne(params.file, params.brandId, 0, deps);
}

/** Upload many files concurrently; returns the successes in input order. */
export async function uploadDraftCreatives(
  params: { files: File[]; brandId: string },
  deps: UploadDraftCreativeDeps = {},
): Promise<MediaAsset[]> {
  const results = await Promise.all(
    params.files.map((file, index) => uploadOne(file, params.brandId, index, deps)),
  );
  return results.filter((asset): asset is MediaAsset => asset !== null);
}
