// A Forge design: a static layout document a web component package carries as its entry
// (`framework: 'design'`). Figma imports write it; the shared player in `@continuum/forge-web-runtime`
// draws it as DOM. It is data, not code, so an import or an agent writes it and nothing is compiled
// from a stranger's source. Motion is HyperFrames' subject, not this one: a design has no timeline.

import { z } from 'zod';

/** The entry a design package names in `forge-component.json`. */
export const FORGE_DESIGN_ENTRY = 'design.json';

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** A file the package carries beside `design.json`; the package schema checks it exists. */
const designPathSchema = z.string().min(1).max(240);

/** A render column's name: the layer a row fills. Unique across the design. */
export const forgeDesignFieldSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const layerBase = {
  id: z.string().min(1).max(200),
  name: z.string().max(200),
  /** Only text fields are render columns today; an image field is recorded for image swap. */
  field: forgeDesignFieldSchema.nullable().default(null),
  /** Unrotated box in design pixels; rotation turns it about its centre, clockwise. */
  box: z
    .object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() })
    .strict(),
  rotationDeg: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  blendMode: z
    .enum([
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
    ])
    .default('normal'),
  /** Design-space outline the layer is cut to: a clipping frame or a mask. */
  clip: z.array(z.tuple([z.number(), z.number()])).min(3).nullable().default(null),
  blur: z.number().nonnegative().optional(),
  shadow: z
    .object({
      x: z.number(),
      y: z.number(),
      blur: z.number().nonnegative(),
      color: hexColorSchema,
      alpha: z.number().min(0).max(1),
    })
    .strict()
    .optional(),
};

export const forgeDesignLayerSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...layerBase,
      kind: z.literal('text'),
      text: z
        .object({
          value: z.string().max(10000),
          fontFamily: z.string().min(1).max(200),
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
    .strict(),
  z
    .object({
      ...layerBase,
      kind: z.literal('image'),
      image: z
        .object({
          path: designPathSchema,
          fit: z.enum(['cover', 'contain', 'fill', 'none']),
          /** object-position as fractions of the free space, 0.5/0.5 = centred. */
          focus: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...layerBase,
      kind: z.literal('shape'),
      shape: z
        .object({
          fill: hexColorSchema.nullable(),
          fillOpacity: z.number().min(0).max(1),
          radiusPx: z.number().nonnegative(),
          /** Centred on the outline, as Figma's default stroke. */
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
    .strict(),
  z
    .object({
      ...layerBase,
      kind: z.literal('svg'),
      svg: z.object({ path: designPathSchema }).strict(),
    })
    .strict(),
]);
export type ForgeDesignLayer = z.infer<typeof forgeDesignLayerSchema>;

export const forgeDesignSchema = z
  .object({
    version: z.literal(1),
    fonts: z
      .array(
        z
          .object({
            family: z.string().min(1).max(200),
            weight: z.number().int().min(100).max(1000),
            italic: z.boolean(),
            path: designPathSchema,
          })
          .strict(),
      )
      .max(100)
      .default([]),
    /** Paint order: the first layer is the bottom of the stack. */
    layers: z.array(forgeDesignLayerSchema).max(2000),
    /** What the source had that the design does not draw, named so the Forge can show it. */
    unmapped: z
      .array(z.object({ layerId: z.string().min(1), feature: z.string().min(1) }).strict())
      .max(2000)
      .default([]),
  })
  .strict()
  .superRefine((design, ctx) => {
    const ids = new Set<string>();
    const fields = new Set<string>();
    design.layers.forEach((layer, index) => {
      if (ids.has(layer.id))
        ctx.addIssue({ code: 'custom', path: ['layers', index, 'id'], message: 'Duplicate layer id' });
      ids.add(layer.id);
      if (layer.field === null) return;
      if (fields.has(layer.field))
        ctx.addIssue({
          code: 'custom',
          path: ['layers', index, 'field'],
          message: 'Duplicate field',
        });
      fields.add(layer.field);
    });
  });
export type ForgeDesign = z.infer<typeof forgeDesignSchema>;

/** Every package file a design draws from, so the package can be checked to carry each one. */
export function forgeDesignPaths(design: ForgeDesign): string[] {
  return [
    ...design.fonts.map((font) => font.path),
    ...design.layers.flatMap((layer) =>
      layer.kind === 'image' ? [layer.image.path] : layer.kind === 'svg' ? [layer.svg.path] : [],
    ),
  ];
}
