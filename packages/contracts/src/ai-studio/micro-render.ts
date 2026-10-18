import { z } from 'zod';
import { apiRenderVariableKindSchema, encodeSettingsSchema } from './api-renders';
import {
  MICRO_DELIVERY_PROFILES,
  MICRO_OUTPUT_FILES,
  MICRO_STILL_FILES,
  microDeliveryTimelineSchema,
  microMeasuredOutputSchema,
  microMediaToolSchema,
} from './delivery-timing';

export {
  MICRO_DELIVERY_PROFILES,
  MICRO_OUTPUT_FILES,
  MICRO_STILL_FILES,
  type MicroDeliveryTimeline,
  type MicroMeasuredOutput,
  type MicroOutputTiming,
  microDeliveryTimelineSchema,
  microMeasuredOutputSchema,
  microMeasuredVideoSchema,
  microMediaToolSchema,
  microOutputTimingSchema,
  microRationalSchema,
} from './delivery-timing';

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
    /**
     * The AE property the value is set on, as the fleet's own graph names it on the bound layer:
     * its path segments verbatim (`Effects->Fill->ADBE Fill-0002` →
     * `["Effects", "Fill", "ADBE Fill-0002"]`; the middle segment is the effect's display name).
     * The fleet walks it with `layerByID(id).property(segment)…` and sets the value there.
     * Non-null exactly for a `color` binding.
     */
    property: z.array(z.string().min(1)).min(1).nullable(),
  })
  .strict();
export type MicroRenderBinding = z.infer<typeof microRenderBindingSchema>;

export const microRenderOutputRequestSchema = z
  .object({
    file: z.enum(MICRO_OUTPUT_FILES),
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
  .strict()
  .refine(
    (request) =>
      (request.timeline !== undefined) ===
      request.outputs.some(
        (output) => !(MICRO_STILL_FILES as readonly string[]).includes(output.file),
      ),
    { message: 'timeline is required exactly when an output is a video file', path: ['timeline'] },
  )
  .refine(
    (request) =>
      request.bindings.every(
        (binding) => (binding.kind === 'color') === (binding.property !== null),
      ),
    { message: 'property is set exactly on a color binding', path: ['bindings'] },
  );
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

/** 200: every output rendered, uploaded and validated against the timeline (and each other). */
export const microRenderResultSchema = z
  .object({
    timeline: microDeliveryTimelineSchema.nullable(),
    outputs: z.array(microMeasuredOutputSchema).min(1),
    validation: z.literal('passed'),
    /** The encoder that produced and verified the files: pinned build and its sha256. */
    encoder: microMediaToolSchema,
    /** The prober that measured them (ffprobe), recorded beside the encoder. */
    probe: microMediaToolSchema,
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
    encoder: microMediaToolSchema,
    probe: microMediaToolSchema,
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
