// Canonical media-library asset + analysis shapes shared by Frontend (viewer,
// upload, search) and Backend/edge (analyze_media pipeline, agent tools).
// DB rows are snake_case; these boundary shapes are camelCase and the API layer
// maps between them.

import { z } from "zod";

export const mediaKindSchema = z.enum(["image", "video"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const mediaSourceSchema = z.enum(["upload", "ai_generated", "backfill"]);
export type MediaSource = z.infer<typeof mediaSourceSchema>;

// stored: persisted, not yet analyzed. analyzing: pipeline running.
// ready: analysis complete. error: pipeline failed. skipped_free: analysis
// withheld because the brand is not on a paid tier.
export const mediaStatusSchema = z.enum([
  "stored",
  "analyzing",
  "ready",
  "error",
  "skipped_free",
]);
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

// Structured output the Gemini vision call must return for analyze_media.
export const mediaAnalysisResultSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    tags: z.array(z.string().min(1)).default([]),
    detectedObjects: z.array(detectedObjectSchema).default([]),
    adCreativeAnalysis: adCreativeAnalysisSchema.nullable().optional(),
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
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    detectedObjects: z.array(detectedObjectSchema).default([]),
    adCreativeAnalysis: adCreativeAnalysisSchema.nullable().optional(),
    embeddingModel: z.string().nullable().optional(),
    hasImageEmbedding: z.boolean().default(false),
    createdAt: z.string(),
    updatedAt: z.string(),
    signedUrl: z.string().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
  })
  .strict();
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const mediaCollectionKindSchema = z.enum(["manual", "smart"]);
export type MediaCollectionKind = z.infer<typeof mediaCollectionKindSchema>;

export const mediaCollectionSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    name: z.string().min(1),
    kind: mediaCollectionKindSchema,
    smartQuery: z.record(z.string(), z.unknown()).nullable().optional(),
    coverAssetId: z.string().nullable().optional(),
    itemCount: z.number().int().nonnegative().default(0),
    createdBy: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type MediaCollection = z.infer<typeof mediaCollectionSchema>;
