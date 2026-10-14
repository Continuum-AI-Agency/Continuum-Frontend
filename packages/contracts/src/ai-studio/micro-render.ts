import { z } from 'zod';
import { apiRenderVariableKindSchema, encodeSettingsSchema } from './api-renders';

/**
 * The Backend → Experimental Renderer (micro-render on Cloud Run) wire: one comp of one Forge job
 * per request, answered with the encoded file or a refusal by name.
 *
 * The renderer is private (`--no-allow-unauthenticated`); the Backend calls it with a Google ID
 * token from the lease lane's consume route, exactly as it calls the Render service. Every URL is
 * a short-lived signed https URL the Backend minted; the renderer holds no credential.
 *
 * Answers:
 * - `200` — {@link microRenderResultSchema}: every output uploaded to its signed URL and validated
 *   against the delivery timeline and each other (measurements from a full decode).
 * - `409` — {@link microRenderTimelineMismatchSchema}: files made but the timing contract failed; the
 *   job fails with `RENDER_TIMELINE_MISMATCH`, nothing is delivered, the files are kept.
 * - `422` — {@link microRenderRefusalSchema}: the renderer cannot reproduce this comp. Terminal;
 *   the Backend hands the job to After Effects and records `refused` on it.
 * - any other 4xx — a malformed request: terminal, a Backend bug.
 * - 5xx or no answer — transient: the lease lane retries.
 */
export const MICRO_RENDER_SCHEMA = 'micro-render/forge-render/1' as const;

/** A layer a binding drives, from the template parse (`layerIds` / `instances`). */
const microRenderLayerSchema = z
  .object({ comp: z.string().min(1), layerId: z.number().int().nonnegative() })
  .strict();

/**
 * One Forge variable as it reaches the renderer. Media kinds carry the signed URL of the bytes
 * to swap in; every other kind carries its value. The renderer refuses a kind it cannot apply
 * (`binding:<kind>`) rather than render the template's own value in its place.
 */
export const microRenderBindingSchema = z
  .object({
    key: z.string().min(1),
    kind: apiRenderVariableKindSchema,
    value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
    url: z.string().url().nullable(),
    layers: z.array(microRenderLayerSchema).min(1),
  })
  .strict();
export type MicroRenderBinding = z.infer<typeof microRenderBindingSchema>;

/** A rational rate, frames per second = num / den (never a rounded decimal). */
const rationalSchema = z
  .object({ num: z.number().int().positive(), den: z.number().int().positive() })
  .strict();

/**
 * The delivery timing contract (Claighmor, 2026-10-14, after the InYogo MP4 751 / MXF 749 split): every
 * video export of one render consumes this one timeline. For N frames at rate num/den:
 * - each export decodes to exactly N video frames, at that exact rational rate;
 * - presentation timestamps run 0, 1, ..., N - 1 in ticks of den/num seconds (first 0, last N - 1);
 * - the video duration is N ticks = N × den / num seconds;
 * - the source frames are the comp's [first, last] inclusive (aerender's `-s first -e last`), and
 *   `frames` is resolved once from them by the shared rule — never re-derived from a rounded label.
 * An interlaced profile (XDCAM 1080i59.94) carries the field rate 2 × num / den and top field first.
 * Container duration and audio priming/padding are measured separately and never replace this check.
 */
export const microDeliveryTimelineSchema = z
  .object({
    rate: rationalSchema,
    frames: z.number().int().positive(),
    source: z
      .object({
        rate: rationalSchema,
        first: z.number().int().nonnegative(),
        last: z.number().int().nonnegative(),
      })
      .strict(),
    /** The documented convention every planner, encoder and validator shares. */
    convention: z.literal('aerender-inclusive/cfr-v1'),
  })
  .strict();
export type MicroDeliveryTimeline = z.infer<typeof microDeliveryTimelineSchema>;

/** Broadcast profiles the renderer encodes; anything else is refused at preflight. */
export const MICRO_DELIVERY_PROFILES = ['web-h264', 'xdcam-hd422-1080i5994'] as const;

export const microRenderOutputRequestSchema = z
  .object({
    file: z.enum(['mp4', 'mov', 'mxf', 'webm', 'gif', 'png', 'jpg']),
    profile: z.enum(MICRO_DELIVERY_PROFILES).optional(),
    /** A signed PUT URL the renderer uploads the file to (no credential in the renderer). */
    upload: z.object({ url: z.string().url(), contentType: z.string().min(1) }).strict(),
  })
  .strict();

export const microRenderRequestSchema = z
  .object({
    schema: z.literal(MICRO_RENDER_SCHEMA),
    /** The `media.ad_render_jobs` id: names the run in the renderer's logs. */
    job: z.string().uuid(),
    source: z
      .object({
        url: z.string().url(),
        /** The Forge content hash of the promoted AEP, when the job is pinned to one. */
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/i)
          .nullable(),
        /** A bare project, or a ZIP carrying the project and its footage. */
        family: z.enum(['after_effects', 'after_effects_package']),
        filename: z.string().min(1),
        /** Stable per source version: lets a warm instance reuse a download it already holds. */
        cacheKey: z.string().min(1),
      })
      .strict(),
    /** The comp to render, by name — what the fleet's render queue item names. */
    comp: z.string().min(1),
    bindings: z.array(microRenderBindingSchema),
    fonts: z
      .array(z.object({ postscriptName: z.string().min(1), url: z.string().url() }).strict())
      .default([]),
    /** This comp's settings: the template default merged with its per-comp override. */
    encode: encodeSettingsSchema.default({}),
    /**
     * The canonical delivery timeline, planned ONCE and persisted with the job: every video output of
     * this request is encoded from it and verified against it (the delivery timing contract, see
     * {@link microDeliveryTimelineSchema}). Required for video outputs; absent for a still.
     */
    timeline: microDeliveryTimelineSchema.optional(),
    /**
     * Every file this render delivers, produced in ONE call from one frame schedule so they cannot
     * disagree: MP4 for a moving comp (plus MXF for a broadcast profile), JPEG or PNG for a still.
     * Each is uploaded to its signed URL; anything not reproducible is refused as `encode:<ext>`.
     */
    outputs: z.array(microRenderOutputRequestSchema).min(1),
  })
  .strict();
export type MicroRenderRequest = z.infer<typeof microRenderRequestSchema>;

export const microRenderRefusalSchema = z
  .object({
    /** The feature the renderer cannot reproduce, by name (`text:raster:arithmetic-underived`). */
    refused: z.string().min(1),
    /** Where: a layer, a frame, a binding key. */
    at: z.string().nullable().default(null),
  })
  .strict();
export type MicroRenderRefusal = z.infer<typeof microRenderRefusalSchema>;

/** One output's measured video timing, from a FULL decode of the uploaded file (never a container string). */
export const microMeasuredVideoSchema = z
  .object({
    frames: z.number().int().nonnegative(),
    rate: rationalSchema,
    timeBase: rationalSchema,
    firstPts: z.number().int(),
    lastPts: z.number().int(),
    /** N × den / num as an exact decimal string ("25.058366…" is never rounded into a check). */
    durationSeconds: z.string(),
    /** sha256 over the complete decoded presentation-timestamp sequence. */
    ptsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    fieldOrder: z.enum(['progressive', 'tff', 'bff']),
    decodeClean: z.boolean(),
  })
  .strict();

export const microMeasuredOutputSchema = z
  .object({
    file: z.string(),
    profile: z.enum(MICRO_DELIVERY_PROFILES).nullable(),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    uploaded: z.boolean(),
    video: microMeasuredVideoSchema.nullable(),
    /** Audio is reported beside, never instead of, the video timeline check. */
    audio: z
      .object({
        tracks: z.number().int().nonnegative(),
        channelsPerTrack: z.array(z.number().int()),
        sampleRate: z.number().int(),
        bitDepth: z.number().int().nullable(),
        codec: z.string(),
        trackSha256: z.array(z.string()),
        durationSeconds: z.string(),
      })
      .strict()
      .nullable(),
    containerDurationSeconds: z.string().nullable(),
  })
  .strict();
export type MicroMeasuredOutput = z.infer<typeof microMeasuredOutputSchema>;

/** 200: every output rendered, uploaded and validated against the timeline (and each other). */
export const microRenderResultSchema = z
  .object({
    timeline: microDeliveryTimelineSchema.nullable(),
    outputs: z.array(microMeasuredOutputSchema).min(1),
    validation: z.literal('passed'),
    /** The encoder that produced and verified the files: pinned build and its sha256. */
    encoder: z.object({ name: z.string(), version: z.string(), sha256: z.string() }).strict(),
    renderMs: z.number().int().nonnegative(),
    encodeMs: z.number().int().nonnegative(),
  })
  .strict();
export type MicroRenderResult = z.infer<typeof microRenderResultSchema>;

/**
 * 409: the outputs were made but at least one fails the timing contract. Terminal and NOT a refusal:
 * the job fails with this code, nothing is delivered, the uploaded files are preserved for diagnosis.
 */
export const MICRO_TIMELINE_MISMATCH = 'RENDER_TIMELINE_MISMATCH' as const;
export const microRenderTimelineMismatchSchema = z
  .object({
    error: z.literal(MICRO_TIMELINE_MISMATCH),
    expected: microDeliveryTimelineSchema,
    outputs: z.array(microMeasuredOutputSchema),
    /** Each failed check, with expected and measured values, in plain words. */
    failures: z
      .array(
        z
          .object({
            check: z.string(),
            file: z.string().nullable(),
            expected: z.string(),
            measured: z.string(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type MicroRenderTimelineMismatch = z.infer<typeof microRenderTimelineMismatchSchema>;
