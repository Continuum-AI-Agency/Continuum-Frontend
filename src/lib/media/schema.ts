// Local row-type for media.assets — used because Supabase CLI-generated types do not
// yet include the `media` schema. Kept in sync with the migration manually.
// Map to the camelCase MediaAsset contract shape via rowToMediaAsset().

import type { MediaKind, MediaReviewStatus, MediaSource } from '@continuum/contracts';

export type MediaAssetRow = {
  id: string;
  brand_id: string;
  created_by: string | null;
  kind: MediaKind;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source: MediaSource;
  origin_ref: Record<string, unknown> | null;
  status: 'stored' | 'analyzing' | 'ready' | 'error' | 'skipped_free';
  // Optional so pre-v2 cached payloads/fixtures without the columns still
  // typecheck; the mapper defaults them ('none' / null).
  review_status?: MediaReviewStatus;
  checksum?: string | null;
  progress_step: string | null;
  error_code: string | null;
  error_message: string | null;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  ad_creative_analysis: Record<string, unknown> | null;
  detected_objects: Record<string, unknown>[] | null;
  // Poster image inside the asset's own bucket (v1.6). Optional so fixtures and
  // cached payloads written before the column existed still typecheck.
  thumbnail_path?: string | null;
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
  'id, brand_id, created_by, kind, bucket, storage_path, file_name, mime_type, ' +
  'size_bytes, width, height, duration_ms, source, origin_ref, status, ' +
  'review_status, checksum, ' +
  'progress_step, error_code, error_message, title, description, tags, ' +
  'ad_creative_analysis, detected_objects, thumbnail_path, embedding_model, has_image_embedding, ' +
  'created_at, updated_at, deleted_at';

export type MediaCollectionRow = {
  id: string;
  brand_id: string;
  name: string;
  kind: 'manual' | 'smart';
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
