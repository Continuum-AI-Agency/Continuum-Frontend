import { z } from 'zod';
import { viralityScoreSchema } from '../virality/score';

/**
 * Contracts for the OpusClip-style clip-generation pipeline. A long-form Library
 * video is transcribed (Google STT v2, word-level timing), split into distinct
 * sections (Gemini 3.1 flash-lite), and the browser (mediabunny) cuts dead space
 * and re-stitches each section into its own clip saved as a `source:"clip"`
 * media asset. Stream-progress frames live in `streaming/clip.ts`.
 */

/** One transcribed word with its time span in the source video (seconds). */
export const clipWordSchema = z
  .object({
    text: z.string(),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })
  .strict();

/** Full word-timed transcript returned by the clip-transcribe edge function. */
export const timestampedTranscriptSchema = z
  .object({
    languageCode: z.string().min(1),
    durationSec: z.number().nonnegative(),
    text: z.string(),
    words: z.array(clipWordSchema),
  })
  .strict();

/** A kept (dead-space-removed) time span within a section, in source seconds. */
export const clipKeepRangeSchema = z
  .object({
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
  })
  .strict();

/** A distinct semantic section detected over the transcript (LLM output). */
export const clipSectionSchema = z
  .object({
    index: z.number().int().min(0),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    title: z.string().min(1),
    summary: z.string(),
    hookLine: z.string().nullable().optional(),
    transcriptExcerpt: z.string(),
  })
  .strict();

/**
 * A section enriched with the deterministic cut plan: the keep-ranges (section
 * span minus silence gaps) the browser splices into one clip. Computed in the
 * backend worker, not by the LLM. `words` are the section's transcript words that
 * fall inside the keep-ranges (source-time), carried so the browser can burn in
 * word-synced captions; it re-maps them onto the cut (dead-space-removed) timeline.
 */
export const clipPlanSectionSchema = z
  .object({
    index: z.number().int().min(0),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    title: z.string().min(1),
    summary: z.string(),
    hookLine: z.string().nullable().optional(),
    transcriptExcerpt: z.string(),
    keepRanges: z.array(clipKeepRangeSchema).min(1),
    words: z.array(clipWordSchema),
  })
  .strict();

export const clipPlanSchema = z
  .object({
    sourceAssetId: z.string().min(1),
    durationSec: z.number().nonnegative(),
    sections: z.array(clipPlanSectionSchema),
  })
  .strict();

/**
 * Future scoring hook. The MVP writes a `pending` stub on every saved clip; a
 * later pass compares the clip against high-hook-rate organic content from the
 * past 7 days (via media embeddings + the organic awareness ranking) and fills
 * `hookPotential` + flips `status` to `scored`.
 */
export const clipScoreComparedAgainstSchema = z
  .object({
    source: z.literal('organic_awareness_top_posts'),
    windowDays: z.number().int().positive(),
    postIds: z.array(z.string()),
    topHookRate: z.number().nullable(),
  })
  .strict();

export const clipScoreSchema = z
  .object({
    status: z.enum(['pending', 'scored']),
    hookPotential: z.number().nullable(),
    comparedAgainst: clipScoreComparedAgainstSchema.nullable(),
    // The richer virality breakdown (components + grade + grounding). Optional so
    // the legacy `pending` stubs — which carry only hookPotential — still parse;
    // set once a clip is actually scored, with hookPotential mirroring
    // virality.overall for backward-compatible readers.
    virality: viralityScoreSchema.optional(),
    computedAt: z.string(),
  })
  .strict();

/** Request body for `POST /api/clips/generate`. The browser extracts the audio,
 *  uploads it to storage, then opens the generation stream with these refs. */
export const clipGenerateRequestSchema = z
  .object({
    brandId: z.string().min(1),
    sourceAssetId: z.string().min(1),
    audioBucket: z.string().min(1),
    audioStoragePath: z.string().min(1),
  })
  .strict();

/** Register a single browser-stitched clip MP4 (already uploaded to storage) as
 *  a `source:"clip"` media asset. Idempotent on (bucket, storage_path). */
export const registerClipRequestSchema = z
  .object({
    brandId: z.string().min(1),
    sourceAssetId: z.string().min(1),
    bucket: z.string().min(1),
    storagePath: z.string().min(1),
    fileName: z.string().min(1),
    mimeType: z.literal('video/mp4'),
    sizeBytes: z.number().int().nonnegative(),
    durationSec: z.number().positive(),
    section: clipPlanSectionSchema,
    transcriptExcerpt: z.string().optional(),
    captionCues: z
      .array(
        z
          .object({
            id: z.string().min(1),
            startSec: z.number().nonnegative(),
            endSec: z.number().positive(),
            words: z.array(clipWordSchema).min(1),
          })
          .strict(),
      )
      .optional(),
    captionStyle: z.record(z.string(), z.unknown()).optional(),
    score: clipScoreSchema,
  })
  .strict();

export const registerClipResponseSchema = z
  .object({
    ok: z.literal(true),
    status: z.enum(['ready', 'exists']),
    assetId: z.string(),
  })
  .strict();

export const registerClipErrorSchema = z
  .object({
    ok: z.literal(false),
    status: z.literal('error'),
    message: z.string(),
  })
  .strict();

/** Ask the `clip-asset` edge fn to mint a service-role signed upload URL so the
 *  browser can PUT the extracted audio (`target:"audio"`) or a stitched clip MP4
 *  (`target:"clip"`) straight to storage — no base64 through nginx/Vercel. */
export const clipSignUploadRequestSchema = z
  .object({
    brandId: z.string().min(1),
    sourceAssetId: z.string().min(1),
    target: z.enum(['audio', 'clip']),
    sectionIndex: z.number().int().min(0).optional(),
    fileName: z.string().min(1).optional(),
  })
  .strict();

/** What a sign request returns: feed `path` + `token` to `uploadToSignedUrl`. */
export const clipUploadTicketSchema = z
  .object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    token: z.string().min(1),
  })
  .strict();

export const clipDeleteAudioRequestSchema = z
  .object({
    brandId: z.string().min(1),
    audioBucket: z.string().min(1),
    audioStoragePath: z.string().min(1),
  })
  .strict();

export const clipDeleteAudioResponseSchema = z
  .object({
    ok: z.literal(true),
    status: z.literal('deleted'),
  })
  .strict();

export type ClipWord = z.infer<typeof clipWordSchema>;
export type TimestampedTranscript = z.infer<typeof timestampedTranscriptSchema>;
export type ClipKeepRange = z.infer<typeof clipKeepRangeSchema>;
export type ClipSection = z.infer<typeof clipSectionSchema>;
export type ClipPlanSection = z.infer<typeof clipPlanSectionSchema>;
export type ClipPlan = z.infer<typeof clipPlanSchema>;
export type ClipScore = z.infer<typeof clipScoreSchema>;
export type ClipGenerateRequest = z.infer<typeof clipGenerateRequestSchema>;

export const captionTranscribeRequestSchema = z
  .object({
    brandId: z.string().min(1),
    audioBucket: z.string().min(1),
    audioStoragePath: z.string().min(1),
  })
  .strict();
export type CaptionTranscribeRequest = z.infer<typeof captionTranscribeRequestSchema>;

export const captionTranscribeResponseSchema = timestampedTranscriptSchema;
export type CaptionTranscribeResponse = z.infer<typeof captionTranscribeResponseSchema>;
export type RegisterClipRequest = z.infer<typeof registerClipRequestSchema>;
export type RegisterClipResponse = z.infer<typeof registerClipResponseSchema>;
export type RegisterClipError = z.infer<typeof registerClipErrorSchema>;
export type ClipSignUploadRequest = z.infer<typeof clipSignUploadRequestSchema>;
export type ClipUploadTicket = z.infer<typeof clipUploadTicketSchema>;
export type ClipDeleteAudioRequest = z.infer<typeof clipDeleteAudioRequestSchema>;
export type ClipDeleteAudioResponse = z.infer<typeof clipDeleteAudioResponseSchema>;
