// Single source of truth for the media-library "metadata search" data product:
// agents find creative by reading the metadata we generate (Gemini title /
// description / tags + a 1536-dim description embedding) and get back metadata +
// a short-lived signed URL — never the media bytes.
//
// This module is deliberately runtime-agnostic. The orchestration core
// (`runMediaMetadataSearch`) is a pure function whose I/O is injected, so the
// same logic backs the MCP connector tool AND the Fastify organic-agent tool
// without either runtime's Supabase/Gemini clients leaking into the contracts
// package. Correctness constants (embedding model, dimension, select columns)
// live here so the write side (analyze_media) and every read side cannot drift.

import { z } from 'zod';
import {
  TEXT_EMBEDDING_DIM,
  TEXT_EMBEDDING_MODEL,
  TEXT_EMBEDDING_QUERY_TASK_TYPE,
} from '../embedding/textEmbedding';
import {
  type AdCreativeAnalysis,
  adCreativeAnalysisSchema,
  boundingBoxSchema,
  type DetectedObject,
  type MediaAsset,
  type MediaKind,
  type MediaReviewStatus,
  type MediaSource,
  type MediaStatus,
  mediaKindSchema,
  mediaReviewStatusSchema,
  mediaSourceSchema,
  type TranscriptSegment,
  transcriptSegmentSchema,
} from './asset';
import { type MediaSearchResultItem, mediaSearchResultItemSchema } from './search';

// --- Correctness constants (must match analyze_media's write side) -----------

// The text/description embedding is written by the analyze_media edge function
// and queried here; both use the canonical text-embedding model. A query
// embedding MUST use the same model + dimension as the write side or pgvector's
// `<=>` compares different vector spaces (it only differs by taskType).
export const MEDIA_TEXT_EMBEDDING_MODEL = TEXT_EMBEDDING_MODEL;
export const MEDIA_TEXT_EMBEDDING_DIM = TEXT_EMBEDDING_DIM;
export const MEDIA_TEXT_EMBEDDING_QUERY_TASK_TYPE = TEXT_EMBEDDING_QUERY_TASK_TYPE;

export const MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const MEDIA_METADATA_SEARCH_DEFAULT_THRESHOLD = 0.2;
export const MEDIA_METADATA_SEARCH_DEFAULT_LIMIT = 8;
export const MEDIA_METADATA_SEARCH_MAX_LIMIT = 20;

// Columns hydrated to build a MediaAsset. Deliberately excludes the heavy
// embedding vectors (embedding_text/embedding_image) — only their cheap derived
// signals (`embedding_model`, `has_image_embedding`) are needed at read time.
export const MEDIA_ASSET_SELECT_COLUMNS = [
  'id',
  'brand_id',
  'created_by',
  'kind',
  'bucket',
  'storage_path',
  'file_name',
  'mime_type',
  'size_bytes',
  'width',
  'height',
  'duration_ms',
  'source',
  'origin_ref',
  'status',
  'review_status',
  'checksum',
  'title',
  'description',
  'tags',
  'ad_creative_analysis',
  'detected_objects',
  'transcript',
  'transcript_segments',
  'transcript_source',
  'thumbnail_path',
  'embedding_model',
  'has_image_embedding',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

export const MEDIA_ASSET_SELECT = MEDIA_ASSET_SELECT_COLUMNS.join(',');

// --- Request / response shapes ----------------------------------------------

export const mediaMetadataSearchInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe('Natural-language description of the creative media to find.'),
    tags: z
      .array(z.string().min(1))
      .optional()
      .describe('Optional tags; an asset matches only if it carries ALL of them.'),
    kind: mediaKindSchema.optional().describe('Optional media type filter (image | video).'),
    source: mediaSourceSchema
      .optional()
      .describe('Optional origin filter (upload, ai_generated, canvas, inspiration, …).'),
    reviewStatus: mediaReviewStatusSchema
      .optional()
      .describe(
        "Optional review-workflow filter; pass 'approved' to restrict to assets the brand has signed off on.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MEDIA_METADATA_SEARCH_MAX_LIMIT)
      .default(MEDIA_METADATA_SEARCH_DEFAULT_LIMIT),
    threshold: z.number().min(0).max(1).default(MEDIA_METADATA_SEARCH_DEFAULT_THRESHOLD),
  })
  .strict();
export type MediaMetadataSearchInput = z.infer<typeof mediaMetadataSearchInputSchema>;

export const mediaMetadataSearchResultSchema = z
  .object({
    query: z.string(),
    count: z.number().int().nonnegative(),
    items: z.array(mediaSearchResultItemSchema),
  })
  .strict();
export type MediaMetadataSearchResult = z.infer<typeof mediaMetadataSearchResultSchema>;

// --- DB row → MediaAsset mapper (consolidates the per-runtime copies) --------

// Loose snake_case row matching MEDIA_ASSET_SELECT. `detected_objects` and
// `ad_creative_analysis` are jsonb and parsed defensively by the mapper.
export interface MediaAssetRow {
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
  status: MediaStatus;
  review_status: MediaReviewStatus;
  checksum: string | null;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  ad_creative_analysis: unknown;
  detected_objects: unknown;
  // v1.5 video-understanding columns. Optional on the interface (not just
  // nullable) so a caller selecting an older column set still type-checks.
  transcript?: string | null;
  transcript_segments?: unknown;
  transcript_source?: string | null;
  // v1.6 poster column. Optional for the same reason: an older column set still
  // type-checks.
  thumbnail_path?: string | null;
  embedding_model: string | null;
  has_image_embedding: boolean;
  created_at: string;
  updated_at: string;
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeTags(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((tag) => {
    const trimmed = typeof tag === 'string' ? tag.trim() : '';
    return trimmed ? [trimmed] : [];
  });
}

function parseDetectedObjects(raw: unknown): DetectedObject[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === 'string' && record.label.trim() ? record.label : null;
    if (!label) return [];
    const boxResult = boundingBoxSchema.safeParse(
      record.box && typeof record.box === 'object'
        ? {
            x: clamp01((record.box as Record<string, unknown>).x),
            y: clamp01((record.box as Record<string, unknown>).y),
            width: clamp01((record.box as Record<string, unknown>).width),
            height: clamp01((record.box as Record<string, unknown>).height),
          }
        : undefined,
    );
    const confidence = typeof record.confidence === 'number' ? clamp01(record.confidence) : null;
    return [{ label, confidence, box: boxResult.success ? boxResult.data : null }];
  });
}

function parseAdCreativeAnalysis(raw: unknown): AdCreativeAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = adCreativeAnalysisSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// jsonb, so parsed defensively: a malformed segment is dropped rather than
// failing the whole row (same rule as detected_objects).
function parseTranscriptSegments(raw: unknown): TranscriptSegment[] | null {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = transcriptSegmentSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

// Maps a hydrated DB row + a freshly-minted signed URL into the boundary
// MediaAsset. Always produces a schema-valid asset (jsonb is parsed
// defensively) so a single malformed row cannot fail the whole search.
export function mapMediaRowToAsset(row: MediaAssetRow, signedUrl: string | null): MediaAsset {
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
    checksum: row.checksum,
    title: row.title,
    description: row.description,
    tags: normalizeTags(row.tags),
    detectedObjects: parseDetectedObjects(row.detected_objects),
    adCreativeAnalysis: parseAdCreativeAnalysis(row.ad_creative_analysis),
    transcript: row.transcript ?? null,
    transcriptSegments: parseTranscriptSegments(row.transcript_segments),
    transcriptSource: row.transcript_source ?? null,
    thumbnailPath: row.thumbnail_path ?? null,
    embeddingModel: row.embedding_model,
    hasImageEmbedding: row.has_image_embedding,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedUrl,
    thumbnailUrl: null,
  };
}

// ALL-of: the asset must carry every requested tag. This matches the Library UI
// (tag chips narrow) and the `filter_tags` RPC arg (`tags @> filter_tags`), so
// the same tag input returns the same set to an agent and to a person.
export function assetMatchesTags(rowTags: string[], requestedTags: string[] | undefined): boolean {
  if (!requestedTags?.length) return true;
  const owned = new Set(rowTags.map((tag) => tag.toLowerCase()));
  return requestedTags.every((tag) => owned.has(tag.toLowerCase()));
}

// --- Dependency-injected orchestration core ---------------------------------

export type MediaTextMatch = { id: string; similarity: number };

export interface MediaMetadataSearchDeps {
  // Returns the 1536-dim query embedding, or null when the brand has no
  // analyzed/embedded assets (e.g. free tier) so the caller can fall back.
  embedQuery: (query: string) => Promise<number[] | null>;
  matchAssetsByText: (
    embedding: number[],
    opts: { threshold: number; limit: number },
  ) => Promise<MediaTextMatch[]>;
  // Optional lexical fallback (search_assets_ranked) used when the semantic path
  // yields nothing or no query embedding is available. Similarity MUST already
  // be normalized to [0,1] by the implementation.
  lexicalSearch?: (query: string, opts: { limit: number }) => Promise<MediaTextMatch[]>;
  hydrateAssets: (
    ids: string[],
    opts: { kind?: MediaKind; source?: MediaSource },
  ) => Promise<MediaAssetRow[]>;
  mintSignedUrl: (bucket: string, storagePath: string) => Promise<string | null>;
}

// Pure orchestration: embed → semantic match (lexical fallback) → hydrate →
// tag-filter → map + mint. The result preserves match ranking order. Never
// reads or returns media bytes.
// Semantic hits keep their rank and their cosine score; lexical-only hits are
// appended behind them (a keyword hit is a weaker signal than a meaning hit, but
// it must never be dropped). Deduped by id — an asset found both ways keeps its
// semantic score.
export function mergeMatches(
  semantic: MediaTextMatch[],
  lexical: MediaTextMatch[],
  limit: number,
): MediaTextMatch[] {
  const seen = new Set(semantic.map((match) => match.id));
  const extras = lexical.filter((match) => !seen.has(match.id));
  return [...semantic, ...extras].slice(0, limit);
}

export async function runMediaMetadataSearch(
  deps: MediaMetadataSearchDeps,
  input: MediaMetadataSearchInput,
): Promise<MediaMetadataSearchResult> {
  const empty: MediaMetadataSearchResult = { query: input.query, count: 0, items: [] };

  const embedding = await deps.embedQuery(input.query);
  const semantic = embedding
    ? await deps.matchAssetsByText(embedding, { threshold: input.threshold, limit: input.limit })
    : [];

  // HYBRID, not a fallback ladder. Running lexical only when the vector search
  // comes back empty makes any asset without an embedding invisible the moment
  // ONE other asset matches semantically — so a just-uploaded file (analysis is
  // async, and free-tier brands are never analyzed) could not be found by its own
  // name. Union the two, semantic first, and a literal-name search always works.
  const lexical = deps.lexicalSearch
    ? await deps.lexicalSearch(input.query, { limit: input.limit })
    : [];

  const matches = mergeMatches(semantic, lexical, input.limit);

  const ids = matches.map((match) => match.id);
  if (ids.length === 0) return empty;

  const rows = await deps.hydrateAssets(ids, { kind: input.kind, source: input.source });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const similarityById = new Map(matches.map((match) => [match.id, clamp01(match.similarity)]));

  // Preserve the match ranking order; drop ids the filtered hydration removed
  // (kind/source) and assets that fail the tag filter.
  const ordered = ids.flatMap((id) => {
    const row = rowById.get(id);
    if (!row) return [];
    return assetMatchesTags(normalizeTags(row.tags), input.tags) ? [row] : [];
  });

  const items: MediaSearchResultItem[] = await Promise.all(
    ordered.map(async (row) => {
      const signedUrl = await deps.mintSignedUrl(row.bucket, row.storage_path);
      return {
        asset: mapMediaRowToAsset(row, signedUrl),
        similarity: similarityById.get(row.id) ?? 0,
      };
    }),
  );

  return { query: input.query, count: items.length, items };
}
