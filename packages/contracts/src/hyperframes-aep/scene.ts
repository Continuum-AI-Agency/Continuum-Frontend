import { z } from 'zod';
import { shaderStackV1Schema } from '../ai-studio/shader-stack';

/**
 * A HyperFrames composition unpacked into what an After Effects project needs: measured layout
 * boxes, resolved copy and fonts, keyed motion, and which layers are variables. Continuum Render
 * produces it from the live page; template-forge `POST /v1/aep/author` writes it as an .aep with
 * py_aep and re-parses its own output before answering. Nothing here is AE-specific enough to
 * need the binary format — the writer owns that.
 */

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * Forge keys a slot `<kind>__<slug(layer name)>` (template-forge `py/aep_geometry.py` `_slug`), so
 * a variable id already in that slug form survives into the Forge slot key unchanged.
 */
export const hyperframesAepVariableIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** The segment LEAVING a key, CSS/GSAP cubic-bezier convention (x in 0..1, y may overshoot). */
export const hyperframesAepBezierSchema = z
  .object({
    x1: z.number().min(0).max(1),
    y1: z.number(),
    x2: z.number().min(0).max(1),
    y2: z.number(),
  })
  .strict();

export const hyperframesAepKeySchema = z
  .object({
    t: z.number().nonnegative(),
    v: z.number(),
    interp: z.enum(['linear', 'bezier', 'hold']),
    bezier: hyperframesAepBezierSchema.optional(),
  })
  .strict()
  .refine((key) => key.interp !== 'bezier' || key.bezier !== undefined, {
    message: 'a bezier key carries its control points',
    path: ['bezier'],
  });
export type HyperframesAepKey = z.infer<typeof hyperframesAepKeySchema>;

/**
 * Keyable channels, all relative to the layer's resting state: `x`/`y` are px offsets from the
 * box, `scaleX`/`scaleY` multipliers, `rotation` degrees, `opacity` 0..1, the filter channels in
 * CSS filter units (blur px, brightness/contrast/saturate multipliers, hueRotate degrees), and
 * `skewX`/`skewY` shear angles in degrees (horizontal / vertical, a Photoshop smart object's skew).
 */
export const hyperframesAepChannelSchema = z.enum([
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'blur',
  'brightness',
  'contrast',
  'saturate',
  'hueRotate',
  'skewX',
  'skewY',
]);
export type HyperframesAepChannel = z.infer<typeof hyperframesAepChannelSchema>;

const rectSchema = z
  .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
  .strict();

const blendModeSchema = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

const filtersSchema = z
  .object({
    blur: z.number().nonnegative().optional(),
    brightness: z.number().nonnegative().optional(),
    contrast: z.number().nonnegative().optional(),
    saturate: z.number().nonnegative().optional(),
    hueRotate: z.number().optional(),
    dropShadow: z
      .object({
        x: z.number(),
        y: z.number(),
        blur: z.number().nonnegative(),
        color: hexColorSchema,
        alpha: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Comp-space outline the layer is clipped to (clip-path / overflow:hidden on an ancestor). */
const clipSchema = z.object({ points: z.array(z.tuple([z.number(), z.number()])).min(3) }).strict();

const layerBase = {
  /** `data-hf-id` of the source element — the thread from a Forge slot back to the HTML. */
  id: z.string().min(1),
  name: z.string().min(1),
  sceneId: z.string().min(1).nullable(),
  inSec: z.number().nonnegative(),
  outSec: z.number().positive(),
  /** Untransformed layout box in comp pixels; motion lives in `keys`. */
  box: rectSchema,
  opacity: z.number().min(0).max(1),
  rotationDeg: z.number(),
  blendMode: blendModeSchema,
  clip: clipSchema.nullable(),
  filters: filtersSchema.nullable(),
  keys: z.partialRecord(hyperframesAepChannelSchema, z.array(hyperframesAepKeySchema).min(2)),
  variable: hyperframesAepVariableIdSchema.nullable(),
};

export const hyperframesAepTextLayerSchema = z
  .object({
    ...layerBase,
    kind: z.literal('text'),
    text: z
      .object({
        value: z.string(),
        fontFamily: z.string().min(1),
        fontWeight: z.number().int().min(100).max(1000),
        italic: z.boolean(),
        fontSizePx: z.number().positive(),
        lineHeightPx: z.number().positive(),
        letterSpacingPx: z.number(),
        align: z.enum(['left', 'center', 'right', 'justify']),
        color: hexColorSchema,
        uppercase: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const hyperframesAepMediaLayerSchema = z
  .object({
    ...layerBase,
    kind: z.literal('media'),
    media: z
      .object({
        assetId: z.string().min(1),
        mediaKind: z.enum(['image', 'video']),
        fit: z.enum(['cover', 'contain', 'fill', 'none']),
        /** object-position as fractions of the free space, 0.5/0.5 = centred. */
        focus: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
        mediaStartSec: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();

const gradientSchema = z
  .object({
    type: z.enum(['linear', 'radial']),
    /** Linear: CSS angle, 0deg = toward the top, clockwise. */
    angleDeg: z.number(),
    /** Radial: centre as fractions of the box, radius as a fraction of the box width. */
    center: z.tuple([z.number(), z.number()]),
    radius: z.number().positive(),
    /** Radial: CSS ellipses have their own vertical radius, a fraction of the box height. */
    radiusY: z.number().positive().optional(),
    stops: z
      .array(
        z
          .object({
            offset: z.number().min(0).max(1),
            color: hexColorSchema,
            alpha: z.number().min(0).max(1),
          })
          .strict(),
      )
      .min(2),
  })
  .strict();

export const hyperframesAepShapeLayerSchema = z
  .object({
    ...layerBase,
    kind: z.literal('shape'),
    shape: z
      .object({
        fill: z.union([hexColorSchema, gradientSchema]).nullable(),
        fillOpacity: z.number().min(0).max(1),
        radiusPx: z.number().nonnegative(),
        stroke: z
          .object({
            color: hexColorSchema,
            widthPx: z.number().positive(),
            opacity: z.number().min(0).max(1),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();

export const hyperframesAepSvgLayerSchema = z
  .object({
    ...layerBase,
    kind: z.literal('svg'),
    svg: z.object({ markup: z.string().min(1) }).strict(),
  })
  .strict();

export const hyperframesAepLayerSchema = z.discriminatedUnion('kind', [
  hyperframesAepTextLayerSchema,
  hyperframesAepMediaLayerSchema,
  hyperframesAepShapeLayerSchema,
  hyperframesAepSvgLayerSchema,
]);
export type HyperframesAepLayer = z.infer<typeof hyperframesAepLayerSchema>;

/** Something the page does that the writer has no AE equivalent for yet — named, never dropped silently. */
const gapSchema = z.object({ elementId: z.string().min(1), feature: z.string().min(1) }).strict();

export const hyperframesAepSceneSchema = z
  .object({
    version: z.literal(1),
    source: z.enum(['hyperframes', 'figma', 'canva']),
    title: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().positive(),
    durationSec: z.number().positive(),
    /** Become comp markers, so a designer can find each scene of the flat comp. */
    scenes: z.array(
      z
        .object({
          id: z.string().min(1),
          role: z.string().min(1),
          layout: z.string().min(1),
          startSec: z.number().nonnegative(),
          durationSec: z.number().positive(),
        })
        .strict(),
    ),
    assets: z.array(
      z
        .object({
          id: z.string().min(1),
          url: z.url(),
          kind: z.enum(['image', 'video', 'audio']),
          fileName: z.string().min(1),
        })
        .strict(),
    ),
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
    /** Paint order: the first layer is the bottom of the stack. */
    layers: z.array(hyperframesAepLayerSchema),
    audio: z.array(
      z
        .object({
          assetId: z.string().min(1),
          startSec: z.number().nonnegative(),
          volume: z.number().min(0).max(1),
        })
        .strict(),
    ),
    shaderStack: shaderStackV1Schema.nullable(),
    unmapped: z.array(gapSchema),
    /** Structure the export simplified on purpose (per-word animation on one text layer). */
    flattened: z.array(gapSchema),
  })
  .strict();
export type HyperframesAepScene = z.infer<typeof hyperframesAepSceneSchema>;

/**
 * `hyperframes-map.json`, written beside the .aep: every variable the project publishes and the
 * element it came from, so a Forge slot traces back to the HTML and the export can be graded
 * against the parse Forge makes of it.
 */
export const hyperframesAepMapSchema = z
  .object({
    version: z.literal(1),
    source: z.enum(['hyperframes', 'figma', 'canva', 'photoshop', 'illustrator']),
    aepFileName: z.string().min(1),
    compName: z.string().min(1),
    /** Every delivery comp, when a design import wrote one per artboard. */
    comps: z
      .array(
        z
          .object({ name: z.string().min(1), width: z.number().int(), height: z.number().int() })
          .strict(),
      )
      .optional(),
    variables: z.array(
      z
        .object({
          id: hyperframesAepVariableIdSchema,
          kind: z.enum(['text', 'image', 'video', 'color', 'number', 'boolean']),
          /** Essential Graphics controller type: text, media replacement, color, slider or checkbox. */
          controller: z.enum(['text', 'media', 'color', 'slider', 'checkbox']),
          layerName: z.string().min(1),
          hfElementId: z.string().min(1).nullable(),
          sceneId: z.string().min(1).nullable(),
          defaultValue: z.union([z.string(), z.boolean()]).nullable(),
          /**
           * Whether the variable starts as a field someone fills. Absent means yes. A design import
           * publishes EVERY layer and switches on only text and smart objects; the rest wait.
           */
          defaultOn: z.boolean().optional(),
        })
        .strict(),
    ),
    unmapped: z.array(gapSchema),
    flattened: z.array(gapSchema),
  })
  .strict();
export type HyperframesAepMap = z.infer<typeof hyperframesAepMapSchema>;

/** `POST /api/ai-studio/hyperframes-agent/revisions/:revisionId/aep` — a revision as a Forge template. */
export const hyperframesAepExportRequestSchema = z
  .object({
    brandId: z.uuid(),
    /** Revisions do not store the shader stack the film was rendered with; the caller does. */
    shaderStack: shaderStackV1Schema.nullable().optional(),
  })
  .strict();
export type HyperframesAepExportRequest = z.infer<typeof hyperframesAepExportRequestSchema>;

export const hyperframesAepExportResponseSchema = z
  .object({
    /** The Library asset holding the package — the Forge template's source. */
    assetId: z.string().min(1),
    map: hyperframesAepMapSchema,
    parseState: z.string().min(1),
    checksum: z.string().length(64),
  })
  .strict();
export type HyperframesAepExportResponse = z.infer<typeof hyperframesAepExportResponseSchema>;
