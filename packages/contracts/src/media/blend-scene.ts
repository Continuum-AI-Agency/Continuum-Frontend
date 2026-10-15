// A Blender scene template: what the forge reads out of a .blend, and what a render puts back in.
//
// Three producers meet here and none of them shares a language: the forge's Rust parser
// (`blend-library`) writes the parse, the Backend reads it and builds jobs, and the Rust render
// service (`continuum-scene`) reads the job and patches the same .blend before Blender renders
// it. The Rust side mirrors these shapes with serde (`deny_unknown_fields`), and both sides
// parse the same checked-in examples in `__fixtures__/`, so a field renamed on one side fails a
// test on the other instead of failing a render.

import { z } from 'zod';
import { templateParseSchema } from './template-source';

/** A Blender ID name is at most 255 bytes in 5.x (63 before); the two-letter code is separate. */
const idNameSchema = z.string().min(1).max(256);

/** `OB`, `IM`, `MA`, `WO`, `LA`, `GR`, `SC` … — the code Blender stores ahead of every ID name. */
const idCodeSchema = z.string().regex(/^[A-Z]{2}$/);

const targetBase = { idCode: idCodeSchema, idName: idNameSchema };

/**
 * Where one input lives inside the .blend.
 *
 * A closed set, not a free RNA path: the patcher writes bytes at an SDNA offset, so every
 * address it accepts is one it was written to handle. A new kind of input is a code change on
 * both Rust sides and here, seen in review — never a string that one side invents.
 */
export const blendTargetSchema = z.discriminatedUnion('path', [
  /** The body of a text object. `idName` is the OBJECT, not its curve datablock. */
  z.object({ ...targetBase, path: z.literal('text.body') }).strict(),
  /** The file an image datablock loads; patching it also drops any packed copy. */
  z.object({ ...targetBase, path: z.literal('image.file') }).strict(),
  /** An unlinked input socket on a node in the ID's own node tree, by socket identifier. */
  z
    .object({
      ...targetBase,
      path: z.literal('socket'),
      node: z.string().min(1).max(64),
      socket: z.string().min(1).max(64),
    })
    .strict(),
  /** The output value of a Value node. */
  z.object({ ...targetBase, path: z.literal('value'), node: z.string().min(1).max(64) }).strict(),
  z.object({ ...targetBase, path: z.literal('hide_render') }).strict(),
  z.object({ ...targetBase, path: z.literal('light.color') }).strict(),
  z.object({ ...targetBase, path: z.literal('light.energy') }).strict(),
  /** A custom property on the ID. IDProperty names are char[64]. */
  z.object({ ...targetBase, path: z.literal('prop'), prop: z.string().min(1).max(63) }).strict(),
  /**
   * An object's own location / rotation / scale, as stored (rotation in radians, Euler only).
   * Never offered for a channel an animation or driver owns: its value would not reach the render.
   */
  z.object({ ...targetBase, path: z.literal('transform.location') }).strict(),
  z.object({ ...targetBase, path: z.literal('transform.rotation') }).strict(),
  z.object({ ...targetBase, path: z.literal('transform.scale') }).strict(),
  /**
   * Camera framing. `idName` is the camera OBJECT — the name outputs carry — and the patcher
   * follows it to its camera data: `lens` (mm) for a perspective camera, `ortho_scale` for an
   * orthographic one.
   */
  z.object({ ...targetBase, path: z.literal('camera.lens') }).strict(),
  z.object({ ...targetBase, path: z.literal('camera.ortho_scale') }).strict(),
]);
export type BlendTarget = z.infer<typeof blendTargetSchema>;

export const blendFieldKindSchema = z.enum([
  'text',
  'number',
  'boolean',
  'image',
  'color',
  'vector3',
]);
export type BlendFieldKind = z.infer<typeof blendFieldKindSchema>;

/** sRGB, as a person and a colour picker read it. Linear conversion happens only in Rust. */
export const blendHexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** x, y, z — a location, a scale, or a rotation in radians as Blender stores it. */
export const blendVector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type BlendVector3 = z.infer<typeof blendVector3Schema>;

const defaultFitsKind = (
  kind: BlendFieldKind,
  value: string | number | boolean | BlendVector3 | null,
): boolean => {
  if (value === null) return kind === 'image';
  if (Array.isArray(value)) return kind === 'vector3';
  switch (kind) {
    case 'text':
    case 'image':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'color':
      return typeof value === 'string' && blendHexColorSchema.safeParse(value).success;
    case 'vector3':
      return false;
  }
};

export const blendFieldSchema = z
  .object({
    /** Stable across re-parses of the same file: `slug(idName).<role>`, or the `forge` mark. */
    key: z.string().min(1).max(128),
    name: z.string().min(1),
    kind: blendFieldKindSchema,
    target: blendTargetSchema,
    /**
     * The value the file holds now. An image's default is its stored path (`//` = relative to
     * the .blend), or null when the picture exists only packed or generated inside the file.
     */
    default: z.union([z.string(), z.number(), z.boolean(), blendVector3Schema]).nullable(),
    /** Whether a render request may set it. Hidden fields are read, listed, and refused. */
    exposed: z.boolean(),
    /** `marked` when the author tagged it with a `forge` / `forge_*` custom property. */
    origin: z.enum(['marked', 'discovered']),
  })
  .strict()
  .refine((field) => defaultFitsKind(field.kind, field.default), {
    message: 'default does not match kind',
    path: ['default'],
  });
export type BlendField = z.infer<typeof blendFieldSchema>;

/** One renderable view: a scene seen through one of its cameras. */
export const blendOutputSchema = z
  .object({
    /** `<scene>/<camera>`. */
    id: z.string().min(1),
    label: z.string().min(1),
    scene: idNameSchema,
    camera: idNameSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    ratio: z.string().regex(/^\d+:\d+$/),
    mediaType: z.enum(['image', 'video']),
    frameStart: z.number().int(),
    frameEnd: z.number().int(),
    fps: z.number().positive(),
    /** The engine the author chose. V1 always renders Cycles; a different one is a warning. */
    engine: z.string(),
    /** Cycles samples when the file stores them; null means Cycles' own (slow) default. */
    samples: z.number().int().positive().nullable(),
  })
  .strict();
export type BlendOutput = z.infer<typeof blendOutputSchema>;

/** A file the .blend points at but does not carry — absent on the render box. */
export const blendExternalSchema = z
  .object({
    kind: z.enum(['image', 'font', 'library']),
    idName: idNameSchema,
    path: z.string(),
  })
  .strict();
export type BlendExternal = z.infer<typeof blendExternalSchema>;

/**
 * The forge's parse of a .blend, stored in `media.template_sources.parse`.
 *
 * Extends the AE-shaped parse so every reader that only needs `parser`, `sourceFamily` and
 * `ratios` keeps working; those readers strip `fields`/`outputs`, so anything that renders a
 * blend template must read the row through THIS schema.
 */
export const blendParseSchema = templateParseSchema.extend({
  sourceFamily: z.literal('blender'),
  fields: z.array(blendFieldSchema),
  outputs: z.array(blendOutputSchema),
  externals: z.array(blendExternalSchema).default([]),
});
export type BlendParse = z.infer<typeof blendParseSchema>;

// ─── Render: Backend API ───────────────────────────────────────────────────────────────

export const MAX_FRAMES = 600;
const MAX_PIXELS_SIDE = 4096;
const MIN_PIXELS_SIDE = 16;

const pinnedAssetSchema = z
  .object({ assetId: z.string().uuid(), versionId: z.string().uuid().optional() })
  .strict();

export const sceneRenderRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    /** The template version the caller read; a newer head answers 409 instead of guessing. */
    versionId: z.string().uuid(),
    outputId: z.string().min(1),
    /** Field key → value. Colours are `#RRGGBB`; images are Library pins; vectors `[x, y, z]`. */
    values: z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), pinnedAssetSchema, blendVector3Schema]),
      )
      .default({}),
    /**
     * `all` lets the request set fields the template does not expose — the Forge editor, which
     * is an author tool. Absent means `exposed`: a render form sets only what was offered.
     */
    scope: z.enum(['exposed', 'all']).optional(),
    overrides: z
      .object({
        width: z.number().int().min(MIN_PIXELS_SIDE).max(MAX_PIXELS_SIDE).optional(),
        height: z.number().int().min(MIN_PIXELS_SIDE).max(MAX_PIXELS_SIDE).optional(),
        frameStart: z.number().int().optional(),
        frameEnd: z.number().int().optional(),
        /**
         * The parser's `mediaType` is a hint: a still scene often keeps Blender's default frame
         * range. `image` renders `frameStart` alone, whatever the range says.
         */
        mediaType: z.enum(['image', 'video']).optional(),
      })
      .strict()
      .optional(),
    /** Retry key: the same requestId answers the same job. */
    requestId: z.string().uuid().optional(),
  })
  .strict();
export type SceneRenderRequest = z.infer<typeof sceneRenderRequestSchema>;

export const sceneTemplateViewSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    /** `blend:<assetId>` — never a number, so no AE-fleet path can mistake it for a NocoBase id. */
    templateKey: z.string().regex(/^blend:/),
    parseState: z.string(),
    fields: z.array(blendFieldSchema),
    outputs: z.array(blendOutputSchema),
    externals: z.array(blendExternalSchema),
  })
  .strict();
export type SceneTemplateView = z.infer<typeof sceneTemplateViewSchema>;

export const sceneRenderStatusSchema = z
  .object({
    jobId: z.string().uuid(),
    state: z.string(),
    error: z.string().nullable(),
    outputs: z.array(pinnedAssetSchema.required()),
  })
  .strict();
export type SceneRenderStatus = z.infer<typeof sceneRenderStatusSchema>;

/** The editor's render history for one template, newest first. */
export const sceneRenderHistorySchema = z
  .object({
    renders: z.array(
      sceneRenderStatusSchema.extend({
        outputId: z.string().min(1),
        createdAt: z.string(),
        /** What the job was asked to make: a still of a video output is an image. */
        mediaType: z.enum(['image', 'video']),
      }),
    ),
  })
  .strict();
export type SceneRenderHistory = z.infer<typeof sceneRenderHistorySchema>;

/**
 * A preview while editing: always a still (a video output previews its first frame), drawn at
 * draft size and samples unless `quality` is `full`. Nothing is written to the Library.
 */
export const scenePreviewRequestSchema = sceneRenderRequestSchema
  .pick({ brandId: true, versionId: true, outputId: true, values: true, scope: true })
  .extend({ quality: z.enum(['draft', 'full']).optional() })
  .strict();
export type ScenePreviewRequest = z.infer<typeof scenePreviewRequestSchema>;

export const scenePreviewSchema = z
  .object({
    /** Short-lived signed GET of the PNG. */
    url: z.string().url(),
    expiresAt: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frame: z.number().int(),
    /** The same template, output and values were drawn before: no render ran. */
    cached: z.boolean(),
  })
  .strict();
export type ScenePreview = z.infer<typeof scenePreviewSchema>;

// ─── Render: Backend → continuum-scene ─────────────────────────────────────────────────

/** A bare file name: the render service writes it into its own temp dir. */
const safeFileNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);

export const sceneRenderValueSchema = z.discriminatedUnion('kind', [
  z
    .object({ target: blendTargetSchema, kind: z.literal('text'), value: z.string().max(10_000) })
    .strict(),
  z
    .object({ target: blendTargetSchema, kind: z.literal('number'), value: z.number().finite() })
    .strict(),
  z.object({ target: blendTargetSchema, kind: z.literal('boolean'), value: z.boolean() }).strict(),
  z
    .object({ target: blendTargetSchema, kind: z.literal('color'), value: blendHexColorSchema })
    .strict(),
  z
    .object({ target: blendTargetSchema, kind: z.literal('vector3'), value: blendVector3Schema })
    .strict(),
  z
    .object({
      target: blendTargetSchema,
      kind: z.literal('image'),
      /** Signed GET; the service downloads it beside the template. */
      assetUrl: z.string().url(),
      fileName: safeFileNameSchema,
    })
    .strict(),
]);
export type SceneRenderValue = z.infer<typeof sceneRenderValueSchema>;

export const sceneRenderJobSchema = z
  .object({
    template: z
      .object({ url: z.string().url(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
    values: z.array(sceneRenderValueSchema).max(200),
    output: z
      .object({
        scene: idNameSchema,
        camera: idNameSchema,
        width: z.number().int().min(MIN_PIXELS_SIDE).max(MAX_PIXELS_SIDE),
        height: z.number().int().min(MIN_PIXELS_SIDE).max(MAX_PIXELS_SIDE),
        frameStart: z.number().int(),
        frameEnd: z.number().int(),
        fps: z.number().positive(),
        mediaType: z.enum(['image', 'video']),
        /** Lowers the file's Cycles samples for a draft; never raises them. */
        samples: z.number().int().min(1).max(128).optional(),
      })
      .strict()
      .refine((o) => o.frameEnd >= o.frameStart && o.frameEnd - o.frameStart < MAX_FRAMES, {
        message: `frame range must be 1..${MAX_FRAMES} frames`,
      })
      .refine((o) => o.mediaType === 'video' || o.frameStart === o.frameEnd, {
        message: 'an image output renders exactly one frame',
      }),
    /** Signed PUT for the one file this job produces. */
    upload: z
      .object({ putUrl: z.string().url(), contentType: z.enum(['image/png', 'video/mp4']) })
      .strict(),
  })
  .strict()
  .refine(
    (job) => (job.output.mediaType === 'image') === (job.upload.contentType === 'image/png'),
    { message: 'an image output uploads image/png, a video output video/mp4' },
  );
export type SceneRenderJob = z.infer<typeof sceneRenderJobSchema>;

export const sceneRenderResultSchema = z
  .object({
    output: z
      .object({
        contentType: z.enum(['image/png', 'video/mp4']),
        bytes: z.number().int().positive(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        frames: z.number().int().positive(),
        durationSec: z.number().positive().nullable(),
      })
      .strict(),
    blenderVersion: z.string().min(1),
    /** Milliseconds per stage: download, patch, render, encode, upload, total. */
    timings: z.record(z.string(), z.number().nonnegative()),
    warnings: z.array(z.string()),
  })
  .strict();
export type SceneRenderResult = z.infer<typeof sceneRenderResultSchema>;
