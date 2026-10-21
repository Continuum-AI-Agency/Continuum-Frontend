import { z } from 'zod';
import { templateNativeIngestStatusSchema, templateParseStateSchema } from './template-source';

// `GET /api/ai-studio/templates/:assetId/timing` — one timeline shape for every template family,
// built only from what is already stored: the parse, a Photoshop import's own .psd, a HyperFrames
// revision's scenes, a .blend's outputs. Reading it never re-parses and never writes, because a
// moved `template_sources.parsed_at` drops a published template's render seeds.

/** What the template was authored in (`templateSourceKind`), not the package family it arrived as. */
export const templateTimingOriginSchema = z.enum([
  'after_effects',
  'photoshop',
  'illustrator',
  'figma',
  'hyperframes',
  'blender',
]);
export type TemplateTimingOrigin = z.infer<typeof templateTimingOriginSchema>;

/** Where the timing was read from. */
export const templateTimingSourceSchema = z.enum([
  'parse',
  'design_plan',
  'hyperframes_spec',
  'blend_outputs',
]);
export type TemplateTimingSource = z.infer<typeof templateTimingSourceSchema>;

export const templateTimingCompSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    fps: z.number().positive(),
    durationSec: z.number().nonnegative(),
    workArea: z
      .object({ startSec: z.number().nonnegative(), durationSec: z.number().nonnegative() })
      .strict()
      .nullable(),
    isDelivery: z.boolean(),
  })
  .strict();
export type TemplateTimingComp = z.infer<typeof templateTimingCompSchema>;

/** One key on one channel (`x`, `opacity`, `dropShadow.opacity`, …), in comp seconds. */
export const templateTimingKeySchema = z
  .object({
    channel: z.string().min(1),
    timeSec: z.number(),
    interp: z.enum(['linear', 'hold', 'bezier']),
  })
  .strict();
export type TemplateTimingKey = z.infer<typeof templateTimingKeySchema>;

export const templateTimingTrackSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    compId: z.string().nullable(),
    kind: z.enum(['layer', 'group', 'audio', 'scene', 'output', 'slot']),
    /** The group track it moves with. */
    parentId: z.string().nullable(),
    inSec: z.number(),
    outSec: z.number(),
    keys: z.array(templateTimingKeySchema),
  })
  .strict();
export type TemplateTimingTrack = z.infer<typeof templateTimingTrackSchema>;

export const templateTimingMarkerSchema = z
  .object({
    compId: z.string().nullable(),
    timeSec: z.number(),
    durationSec: z.number().nonnegative(),
    label: z.string(),
  })
  .strict();
export type TemplateTimingMarker = z.infer<typeof templateTimingMarkerSchema>;

export const templateTimingSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    origin: templateTimingOriginSchema,
    source: templateTimingSourceSchema,
    fps: z.number().positive(),
    durationSec: z.number().nonnegative(),
    comps: z.array(templateTimingCompSchema),
    tracks: z.array(templateTimingTrackSchema),
    markers: z.array(templateTimingMarkerSchema),
    /** True when the source carries less than this shape can hold; `notes` say why. */
    partial: z.boolean(),
    notes: z.array(z.string()),
  })
  .strict();
export type TemplateTiming = z.infer<typeof templateTimingSchema>;

export const templateTimingQuerySchema = z
  .object({ brandId: z.string().uuid(), versionId: z.string().uuid().optional() })
  .strict();
export type TemplateTimingQuery = z.infer<typeof templateTimingQuerySchema>;

/** `POST /api/ai-studio/templates/:assetId/parse/retry` — re-read a pending or failed upload. */
export const templateParseRetryRequestSchema = z.object({ brandId: z.string().uuid() }).strict();
export type TemplateParseRetryRequest = z.infer<typeof templateParseRetryRequestSchema>;

/** 202. `pending` while the parse is still running; poll the template for its outcome. */
export const templateParseRetryResponseSchema = z
  .object({ assetId: z.string().uuid(), parseState: templateParseStateSchema,
    nativeIngest: templateNativeIngestStatusSchema.optional() })
  .strict();
export type TemplateParseRetryResponse = z.infer<typeof templateParseRetryResponseSchema>;
