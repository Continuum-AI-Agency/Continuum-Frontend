// A layered Photoshop or Illustrator file → an editable After Effects template.
//
// The Backend reads what only it can read cheaply (ag-psd: text engine data, visibility, smart
// objects, artboards) and sends the forge a plan; the forge imports the file the way After
// Effects' own "Import As Composition" does and writes the project around it. The map that comes
// back is the same `hyperframes-map.json` every authored package carries.

import { z } from 'zod';
import { hyperframesAepChannelSchema, hyperframesAepKeySchema } from './scene';

export const designImportSourceSchema = z.enum(['photoshop', 'illustrator']);
export type DesignImportSource = z.infer<typeof designImportSourceSchema>;

const boxSchema = z
  .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
  .strict();

/** One style run of a text layer: characters [start, end) in UTF-16 units of `value`. */
export const designTextRunSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    postScriptName: z.string().min(1).nullable(),
    fontSizePx: z.number().positive(),
    lineHeightPx: z.number().positive(),
    letterSpacingPx: z.number(),
    color: z.string().regex(/^#[0-9a-f]{6}$/),
  })
  .strict();
export type DesignTextRun = z.infer<typeof designTextRunSchema>;

/** A Photoshop text layer, already in document pixels (the layer transform applied). */
export const designTextSpecSchema = z
  .object({
    value: z.string(),
    postScriptName: z.string().min(1).nullable(),
    fontFamily: z.string().min(1),
    fontWeight: z.number().int().min(100).max(1000),
    italic: z.boolean(),
    fontSizePx: z.number().positive(),
    lineHeightPx: z.number().positive(),
    letterSpacingPx: z.number(),
    align: z.enum(['left', 'center', 'right', 'justify']),
    color: z.string().regex(/^#[0-9a-f]{6}$/),
    uppercase: z.boolean(),
    box: boxSchema,
    /** Present when the layer mixes styles; the fields above are then its dominant run. */
    runs: z.array(designTextRunSchema).optional(),
  })
  .strict();
export type DesignTextSpec = z.infer<typeof designTextSpecSchema>;

export const designLeafKindSchema = z.enum(['text', 'smart', 'pixel', 'shape']);

const hexSchema = z.string().regex(/^#[0-9a-f]{6}$/);
const designKeysSchema = z.partialRecord(
  hyperframesAepChannelSchema,
  z.array(hyperframesAepKeySchema).min(2),
);

/** The Photoshop layer styles After Effects draws natively (its own Layer Styles, 1:1). */
export const designLayerStyleKindSchema = z.enum([
  'dropShadow',
  'innerShadow',
  'outerGlow',
  'innerGlow',
  'satin',
  'colorOverlay',
  'stroke',
]);
export const designLayerStyleChannelSchema = z.enum([
  'opacity',
  'size',
  'distance',
  'angle',
  'spread',
]);

/**
 * One layer style as the file sets it, in document pixels and degrees. `keys` animate it (a
 * Photoshop style track or Frame Animation): absolute values — `opacity` 0..1, `spread` 0..1 —
 * never relative, because a layer's pixels never carry its styles.
 */
export const designLayerStyleSchema = z
  .object({
    kind: designLayerStyleKindSchema,
    color: hexSchema.nullable(),
    opacity: z.number().min(0).max(1),
    /** Blur / glow size, stroke width. */
    size: z.number().nonnegative().nullable(),
    /** Shadow / satin offset. */
    distance: z.number().nullable(),
    /** The light's direction. */
    angle: z.number().nullable(),
    /** Photoshop's choke (shadows) or spread, 0..1. */
    spread: z.number().min(0).max(1).nullable(),
    /** A stroke's side of the edge. */
    position: z.enum(['outside', 'inside', 'center']).nullable(),
    keys: z
      .partialRecord(designLayerStyleChannelSchema, z.array(hyperframesAepKeySchema).min(2))
      .optional(),
  })
  .strict();
export type DesignLayerStyle = z.infer<typeof designLayerStyleSchema>;

/**
 * One drawable layer, in paint order, with everything its groups did to it already resolved:
 * visibility and opacity multiplied down from every enclosing group, and group masks and a
 * clipping base baked into its pixels. Groups themselves are gone — a design import flattens
 * them, so every layer can be a field of the delivery comp.
 */
export const designLeafSchema = z
  .object({
    /** Photoshop layer id (`lyid`); `<id>.png` in the pixels zip. */
    id: z.number().int(),
    name: z.string(),
    kind: designLeafKindSchema,
    /** The layer's own box in document pixels. */
    box: boxSchema,
    hidden: z.boolean(),
    /** Layer × fill × every enclosing group's opacity, 0..1. */
    opacity: z.number().min(0).max(1),
    /** ag-psd's blend name (`normal`, `multiply`, …). */
    blendMode: z.string().min(1),
    /** The artboard it sits on, or null for a document without artboards. */
    artboardId: z.number().int().nullable(),
    /** A PNG of it is in the pixels zip (every non-text leaf with pixels). */
    pixels: z.boolean(),
    text: designTextSpecSchema.nullable(),
    /**
     * Photoshop timeline motion, relative to the layer as the file shows it (its record is the
     * state at the file's current time): `x`/`y` px offsets, `scaleX`/`scaleY` multipliers,
     * `rotation` degrees added, `opacity` 0..1 multiplied by `opacity` above. Absent = a still.
     */
    keys: designKeysSchema.optional(),
    /** When the layer is on the timeline; absent = the whole comp. */
    inSec: z.number().nonnegative().optional(),
    outSec: z.number().positive().optional(),
    /** The moving group it belongs to (a `groups[].id`): After Effects parents it to that group. */
    parentId: z.number().int().optional(),
    styles: z.array(designLayerStyleSchema).optional(),
  })
  .strict();
export type DesignLeaf = z.infer<typeof designLeafSchema>;

/**
 * A Photoshop group that moves: its layers are parented to it, so its motion carries them.
 * `x`/`y` offsets and `scaleX`/`scaleY`/`rotation` relative to the group as the file shows it;
 * `opacity` absolute, multiplied onto every layer inside.
 */
export const designGroupSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    artboardId: z.number().int().nullable(),
    /** The moving group it sits in, if any. */
    parentId: z.number().int().nullable(),
    keys: designKeysSchema,
  })
  .strict();
export type DesignGroup = z.infer<typeof designGroupSchema>;

/**
 * A Photoshop timeline audio clip. Photoshop links the sound (it is not inside the .psd): the
 * import finds a Library file of the same name. The clip's source starts at `startSec` on the
 * timeline and plays `inSec`..`outSec` of timeline time.
 */
export const designAudioClipSchema = z
  .object({
    fileName: z.string().min(1),
    startSec: z.number(),
    inSec: z.number().nonnegative(),
    outSec: z.number().positive(),
    /** 0..1 of full level. */
    volume: z.number().min(0),
  })
  .strict();
export type DesignAudioClip = z.infer<typeof designAudioClipSchema>;

export const designArtboardSchema = boxSchema
  .extend({ id: z.number().int(), name: z.string().min(1) })
  .strict();
export type DesignArtboard = z.infer<typeof designArtboardSchema>;

export const designPlanSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** A Photoshop timeline's length. Absent = a still, written as a one-frame comp. */
    durationSec: z.number().positive().optional(),
    /** Groups that move; their layers name them as `parentId`. */
    groups: z.array(designGroupSchema).optional(),
    audio: z.array(designAudioClipSchema).optional(),
    /** Bottom of the stack first. */
    leaves: z.array(designLeafSchema),
    artboards: z.array(designArtboardSchema),
    /** What the plan could not carry, named — never dropped silently. */
    unmapped: z.array(z.object({ elementId: z.string(), feature: z.string() }).strict()),
  })
  .strict();
export type DesignPlan = z.infer<typeof designPlanSchema>;

/** `POST /v1/aep/import-design` on template-forge. */
export const forgeDesignImportRequestSchema = z
  .object({
    version: z.literal(1),
    source: designImportSourceSchema,
    title: z.string().min(1),
    /** The source itself — Illustrator only; a Photoshop import travels as `psd`. */
    file: z
      .object({ url: z.url(), fileName: z.string().min(1) })
      .strict()
      .nullable(),
    fonts: z.array(
      z
        .object({
          family: z.string().min(1),
          fontWeight: z.number().int().min(100).max(1000),
          italic: z.boolean(),
          url: z.url(),
        })
        .strict(),
    ),
    /**
     * Photoshop only: the leaves in paint order, and a zip of every non-text leaf's own pixels
     * (`<layer id>.png`, masks and clipping applied, at its box) — each layer's footage AND its
     * default, so a field left alone renders exactly what the designer drew.
     */
    design: z.object({ plan: designPlanSchema, pixelsUrl: z.url() }).strict().nullable(),
    /** The plan's audio clips the Library holds, each with a URL the forge fetches once. */
    audio: z.array(designAudioClipSchema.extend({ url: z.url() }).strict()).optional(),
    /** A signed PUT target for the zip: a PSD package reaches 250 MB, too big to carry as base64. */
    upload: z
      .object({ url: z.url(), headers: z.record(z.string(), z.string()).optional() })
      .strict(),
  })
  .strict();
export type ForgeDesignImportRequest = z.infer<typeof forgeDesignImportRequestSchema>;

/** `POST /api/ai-studio/templates/:assetId/import-design` — a Library PSD/AI as a Forge template. */
export const designImportRequestSchema = z.object({ brandId: z.uuid() }).strict();
export type DesignImportRequest = z.infer<typeof designImportRequestSchema>;

export const designImportResponseSchema = z
  .object({
    /** The Library asset holding the authored package — the Forge template's source. */
    assetId: z.string().min(1),
    parseState: z.string().min(1),
    status: z.enum(['created', 'exists']),
  })
  .strict();
export type DesignImportResponse = z.infer<typeof designImportResponseSchema>;
