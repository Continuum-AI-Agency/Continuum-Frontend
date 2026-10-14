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
 * - `200` — the encoded file as the body (`content-type` names it), with `x-micro-frames`,
 *   `x-micro-render-ms`, `x-micro-encode-ms` and `x-micro-engine` (the binary's sha256).
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
    /** MP4 for a moving comp; JPEG or PNG for a still (one frame, encoded as the fleet does); any other
     * file is refused as `encode:<ext>`. */
    file: z.enum(['mp4', 'mov', 'mxf', 'webm', 'gif', 'png', 'jpg']),
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
