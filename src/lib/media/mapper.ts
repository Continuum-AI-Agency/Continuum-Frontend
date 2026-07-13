// Single mapper from DB snake_case row to the camelCase MediaAsset contract shape.
// Validated against mediaAssetSchema at the boundary so callers get a typed object.

import type { DetectedObject, MediaAsset } from '@continuum/contracts';
import type { MediaAssetRow } from './schema';

function parseDetectedObjects(raw: Record<string, unknown>[] | null): DetectedObject[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const label = typeof item.label === 'string' ? item.label : null;
    if (!label) return [];
    const box = item.box;
    const parsedBox =
      box && typeof box === 'object'
        ? {
            x: Number((box as Record<string, unknown>).x ?? 0),
            y: Number((box as Record<string, unknown>).y ?? 0),
            width: Number((box as Record<string, unknown>).width ?? 0),
            height: Number((box as Record<string, unknown>).height ?? 0),
          }
        : null;
    const confidence = typeof item.confidence === 'number' ? item.confidence : null;
    return [{ label, confidence, box: parsedBox }];
  });
}

export function rowToMediaAsset(
  row: MediaAssetRow,
  signedUrl?: string | null,
  thumbnailUrl?: string | null,
): MediaAsset {
  return {
    id: row.id,
    brandId: row.brand_id,
    createdBy: row.created_by,
    kind: row.kind,
    bucket: row.bucket,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    source: row.source,
    originRef: row.origin_ref,
    status: row.status,
    reviewStatus: row.review_status ?? 'none',
    checksum: row.checksum ?? null,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    detectedObjects: parseDetectedObjects(row.detected_objects),
    adCreativeAnalysis: row.ad_creative_analysis
      ? (row.ad_creative_analysis as MediaAsset['adCreativeAnalysis'])
      : null,
    thumbnailPath: row.thumbnail_path ?? null,
    embeddingModel: row.embedding_model,
    hasImageEmbedding: row.has_image_embedding,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedUrl: signedUrl ?? null,
    thumbnailUrl: thumbnailUrl ?? null,
  };
}

// Row + the batch-signing Map (keyed by storage path) -> a fully signed asset.
// The asset's poster lives in the SAME bucket as the asset, so one signing pass
// covers both paths; callers that fed `assetSignablePaths(rows)` into
// mintSignedUrls get the thumbnail for free instead of hand-wiring it per route.
export function rowToSignedMediaAsset(
  row: MediaAssetRow,
  signedUrls: ReadonlyMap<string, string>,
): MediaAsset {
  const thumbnailPath = row.thumbnail_path ?? null;
  return rowToMediaAsset(
    row,
    signedUrls.get(row.storage_path) ?? null,
    thumbnailPath ? (signedUrls.get(thumbnailPath) ?? null) : null,
  );
}
