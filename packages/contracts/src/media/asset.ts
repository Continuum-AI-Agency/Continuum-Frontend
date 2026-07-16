// Canonical media-library asset + analysis shapes shared by Frontend (viewer,
// upload, search) and Backend/edge (analyze_media pipeline, agent tools).
// DB rows are snake_case; these boundary shapes are camelCase and the API layer
// maps between them.

import { z } from 'zod';
import { assetIntegrityStateSchema } from './creative-operations';

// 'file' covers non-renderable source files (After Effects projects, RAW
// bundles) stored for the future rendering backend; the grid shows a generic
// file card and no analysis pipeline runs for them.
export const mediaKindSchema = z.enum(['image', 'video', 'file']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

// Human review workflow over an asset — independent of the processing
// `status`. 'none' means the asset has never entered review.
export const mediaReviewStatusSchema = z.enum([
  'none',
  'draft',
  'in_review',
  'needs_changes',
  'approved',
]);
export type MediaReviewStatus = z.infer<typeof mediaReviewStatusSchema>;

// Where a library asset originated. Each value is a delineated "source" folder in
// the unified library/grabber; physically the bytes may live in different storage
// buckets (the asset's `bucket` column), but they composite into one registry.
//   upload:       user-uploaded into media-library.
//   ai_generated: produced by AI Studio / organic generation.
//   backfill:     migrated rows (no live writer).
//   canvas:       created in the AI Studio canvas (auto-registered in place).
//   inspiration:  re-hosted competitor ad creatives (competitor-ad-spy).
//   hyperframe:   HyperFrames composition cover images + client-rendered MP4s.
//   chat_upload:  files users dropped into a chat surface (chat-uploads bucket).
//   clip:         a section cut from a long-form video (OpusClip-style pipeline).
//   reel:         a client-stitched reel MP4 (Veo scenes → single publishable video).
//   meta_ad:      an ad creative pulled back OUT of Meta into the Library, so a
//                 creative that only ever existed as an ad can still be annotated,
//                 versioned and reviewed like any other asset (Creative DNA).
export const mediaSourceSchema = z.enum([
  'upload',
  'ai_generated',
  'backfill',
  'canvas',
  'inspiration',
  'hyperframe',
  'chat_upload',
  'clip',
  'reel',
  'meta_ad',
  'figma',
]);
export type MediaSource = z.infer<typeof mediaSourceSchema>;

// stored: persisted, not yet analyzed. analyzing: pipeline running.
// ready: analysis complete. error: pipeline failed. skipped_free: analysis
// withheld because the brand is not on a paid tier.
export const mediaStatusSchema = z.enum(['stored', 'analyzing', 'ready', 'error', 'skipped_free']);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

// Normalized 0..1 bounding box (origin top-left). The edge pipeline converts
// Gemini's 0..1000 [ymin,xmin,ymax,xmax] boxes into this render-friendly form.
export const boundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict();
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

export const detectedObjectSchema = z
  .object({
    label: z.string().min(1),
    confidence: z.number().min(0).max(1).nullable().optional(),
    box: boundingBoxSchema.nullable().optional(),
  })
  .strict();
export type DetectedObject = z.infer<typeof detectedObjectSchema>;

export const adCreativeAnalysisSchema = z
  .object({
    isAd: z.boolean().default(false),
    format: z.string().nullable().optional(),
    headline: z.string().nullable().optional(),
    primaryText: z.string().nullable().optional(),
    callToAction: z.string().nullable().optional(),
    valueProps: z.array(z.string()).default([]),
    brandElements: z.array(z.string()).default([]),
    textOverlay: z.string().nullable().optional(),
  })
  .strict();
export type AdCreativeAnalysis = z.infer<typeof adCreativeAnalysisSchema>;

// One timecoded line of a video's spoken track. Milliseconds (not seconds) so a
// player can seek without a lossy unit conversion.
export const transcriptSegmentSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    text: z.string().min(1),
  })
  .strict();
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const videoCreativeInsightsSchema = z
  .object({
    summary: z.string(),
    hook: z
      .object({
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
        text: z.string().nullable(),
        archetype: z.string().nullable(),
        strengths: z.array(z.string()).default([]),
        risks: z.array(z.string()).default([]),
      })
      .strict(),
    chapters: z
      .array(
        z
          .object({
            startMs: z.number().int().nonnegative(),
            endMs: z.number().int().positive(),
            title: z.string().min(1),
            summary: z.string().nullable(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type VideoCreativeInsights = z.infer<typeof videoCreativeInsightsSchema>;

// Structured output the Gemini vision call must return for analyze_media.
// transcript/transcriptSegments are populated on the video path only; a silent
// clip yields an empty transcript (`''` / `[]`), which is a valid analysis —
// not a failure. Images leave both undefined.
export const mediaAnalysisResultSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    detectedObjects: z.array(detectedObjectSchema).default([]),
    adCreativeAnalysis: adCreativeAnalysisSchema.nullable().optional(),
    transcript: z.string().nullable().optional(),
    transcriptSegments: z.array(transcriptSegmentSchema).nullable().optional(),
    videoInsights: videoCreativeInsightsSchema.nullable().optional(),
  })
  .strict();
export type MediaAnalysisResult = z.infer<typeof mediaAnalysisResultSchema>;

// Boundary shape returned to the Frontend. signedUrl/thumbnailUrl are transient
// (minted per-request, never persisted). hasImageEmbedding signals whether the
// Backend multimodal-embedding follow-step has run (gates "Find similar").
export const mediaAssetSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    createdBy: z.string().nullable().optional(),
    kind: mediaKindSchema,
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
    source: mediaSourceSchema,
    originRef: z.record(z.string(), z.unknown()).nullable().optional(),
    status: mediaStatusSchema,
    reviewStatus: mediaReviewStatusSchema.default('none'),
    headVersionId: z.string().nullable().optional(),
    integrityState: assetIntegrityStateSchema.optional(),
    checksum: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    detectedObjects: z.array(detectedObjectSchema).default([]),
    adCreativeAnalysis: adCreativeAnalysisSchema.nullable().optional(),
    // Video only, and nullable/optional so pre-v1.5 rows (and every image) parse.
    // `transcript: ''` means "analyzed, no speech"; `null` means "never transcribed".
    transcript: z.string().nullable().optional(),
    transcriptSegments: z.array(transcriptSegmentSchema).nullable().optional(),
    transcriptSource: z.string().nullable().optional(),
    videoInsights: videoCreativeInsightsSchema.nullable().optional(),
    embeddingModel: z.string().nullable().optional(),
    hasImageEmbedding: z.boolean().default(false),
    createdAt: z.string(),
    updatedAt: z.string(),
    signedUrl: z.string().nullable().optional(),
    // Persisted poster path inside the asset's OWN bucket (never a URL). Null
    // means no poster exists and the reader falls back to the full asset.
    thumbnailPath: z.string().nullable().optional(),
    // Transient signed URL for `thumbnailPath`, minted per-request like signedUrl.
    thumbnailUrl: z.string().nullable().optional(),
    // Present only on the cover row of a saved multi-slide group (e.g. a competitor
    // carousel): the ordered, signed slides so the Library renders one grouped tile
    // the viewer can page through instead of N loose cards. Transient (signed
    // per-request), never persisted on the row itself.
    carousel: z
      .object({
        slideCount: z.number().int().positive(),
        slides: z.array(
          z.object({
            slideIndex: z.number().int().nonnegative(),
            kind: mediaKindSchema,
            signedUrl: z.string().nullable(),
          }),
        ),
      })
      .nullable()
      .optional(),
  })
  .strict();
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const mediaCollectionKindSchema = z.enum(['manual', 'smart']);
export type MediaCollectionKind = z.infer<typeof mediaCollectionKindSchema>;

export const mediaCollectionSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    name: z.string().min(1),
    kind: mediaCollectionKindSchema,
    // For kind="smart": filter resolved by the library assets route. Supported
    // keys: { source: MediaSource, kind: MediaKind }.
    smartQuery: z.record(z.string(), z.unknown()).nullable().optional(),
    coverAssetId: z.string().nullable().optional(),
    itemCount: z.number().int().nonnegative().default(0),
    createdBy: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type MediaCollection = z.infer<typeof mediaCollectionSchema>;
