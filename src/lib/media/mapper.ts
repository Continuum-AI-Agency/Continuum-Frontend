// Single mapper from DB snake_case row to the camelCase MediaAsset contract shape.
// Validated against mediaAssetSchema at the boundary so callers get a typed object.

import type { MediaAsset, DetectedObject } from "@continuum/contracts";
import type { MediaAssetRow } from "./schema";

function parseDetectedObjects(raw: Record<string, unknown>[] | null): DetectedObject[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const label = typeof item.label === "string" ? item.label : null;
    if (!label) return [];
    const box = item.box;
    const parsedBox =
      box && typeof box === "object"
        ? {
            x: Number((box as Record<string, unknown>).x ?? 0),
            y: Number((box as Record<string, unknown>).y ?? 0),
            width: Number((box as Record<string, unknown>).width ?? 0),
            height: Number((box as Record<string, unknown>).height ?? 0),
          }
        : null;
    const confidence = typeof item.confidence === "number" ? item.confidence : null;
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
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    detectedObjects: parseDetectedObjects(row.detected_objects),
    adCreativeAnalysis: row.ad_creative_analysis
      ? (row.ad_creative_analysis as MediaAsset["adCreativeAnalysis"])
      : null,
    embeddingModel: row.embedding_model,
    hasImageEmbedding: row.has_image_embedding,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedUrl: signedUrl ?? null,
    thumbnailUrl: thumbnailUrl ?? null,
  };
}
