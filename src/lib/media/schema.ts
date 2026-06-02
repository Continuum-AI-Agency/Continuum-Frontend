// Local row-type for media.assets — used because Supabase CLI-generated types do not
// yet include the `media` schema. Kept in sync with the migration manually.
// Map to the camelCase MediaAsset contract shape via rowToMediaAsset().

export type MediaAssetRow = {
  id: string;
  brand_id: string;
  created_by: string | null;
  kind: "image" | "video";
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source: "upload" | "ai_generated" | "backfill";
  origin_ref: Record<string, unknown> | null;
  status: "stored" | "analyzing" | "ready" | "error" | "skipped_free";
  progress_step: string | null;
  error_code: string | null;
  error_message: string | null;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  ad_creative_analysis: Record<string, unknown> | null;
  detected_objects: Record<string, unknown>[] | null;
  embedding_model: string | null;
  // Stored generated boolean (embedding_image is not null). Lets list/search
  // queries avoid pulling the 1408-dim vector. The vector column itself is only
  // selected where genuinely needed (similar-mode reference lookup).
  has_image_embedding: boolean;
  embedding_image?: unknown | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// Explicit column projection for media.assets — every column EXCEPT the heavy
// vectors (embedding_text vector(1536), embedding_image vector(1408)), which the
// mapper never needs. Use this instead of select("*") on list/search queries.
export const MEDIA_ASSET_SELECT =
  "id, brand_id, created_by, kind, bucket, storage_path, file_name, mime_type, " +
  "size_bytes, width, height, duration_ms, source, origin_ref, status, " +
  "progress_step, error_code, error_message, title, description, tags, " +
  "ad_creative_analysis, detected_objects, embedding_model, has_image_embedding, " +
  "created_at, updated_at, deleted_at";

export type MediaCollectionRow = {
  id: string;
  brand_id: string;
  name: string;
  kind: "manual" | "smart";
  smart_query: Record<string, unknown> | null;
  cover_asset_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchAssetRow = {
  id: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  similarity: number;
};
