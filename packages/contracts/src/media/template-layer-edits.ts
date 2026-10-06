import { z } from 'zod';
import { renameTemplateSourceRequestSchema, templateSlotSchema } from './template-source';

const pairSchema = (limit: number) =>
  z.tuple([z.number().finite().min(-limit).max(limit), z.number().finite().min(-limit).max(limit)]);

/** The static transform a layer editor may write. Units are AE's: comp px, degrees, percent. */
export const TEMPLATE_LAYER_TRANSFORMS = ['position', 'rotation', 'scale', 'opacity'] as const;
export type TemplateLayerTransform = (typeof TEMPLATE_LAYER_TRANSFORMS)[number];

export const templateLayerEditSchema = z
  .object({
    compId: z.number().int().positive(),
    layerId: z.number().int().positive(),
    fontSize: z.number().finite().min(1).max(1000).optional(),
    font: z.string().trim().min(1).max(200).optional(),
    visible: z.boolean().optional(),
    position: pairSchema(100_000).optional(),
    rotation: z.number().finite().min(-36_000).max(36_000).optional(),
    scale: pairSchema(10_000).optional(),
    opacity: z.number().finite().min(0).max(100).optional(),
  })
  .strict()
  .refine(
    (e) =>
      e.fontSize !== undefined ||
      e.font !== undefined ||
      e.visible !== undefined ||
      TEMPLATE_LAYER_TRANSFORMS.some((key) => e[key] !== undefined),
    'Choose a layer change',
  );
export type TemplateLayerEdit = z.infer<typeof templateLayerEditSchema>;

/** One comp re-stacked: every layer of it exactly once, top first. */
export const templateLayerOrderSchema = z
  .object({
    compId: z.number().int().positive(),
    layerIds: z.array(z.number().int().positive()).min(2).max(1000),
  })
  .strict()
  .refine((o) => new Set(o.layerIds).size === o.layerIds.length, 'A layer may appear only once');
export type TemplateLayerOrder = z.infer<typeof templateLayerOrderSchema>;

const distinctTargets = (r: { edits: TemplateLayerEdit[]; orders: TemplateLayerOrder[] }) =>
  new Set(r.edits.map((e) => e.layerId)).size === r.edits.length &&
  new Set(r.orders.map((o) => o.compId)).size === r.orders.length;

export const templateLayerPreviewRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedVersionId: z.string().uuid(),
    compId: z.number().int().positive().optional(),
    edits: z.array(templateLayerEditSchema).max(64),
    orders: z.array(templateLayerOrderSchema).max(16).default([]),
  })
  .strict()
  .refine(distinctTargets, 'A layer or composition may appear only once');
export type TemplateLayerPreviewRequest = z.infer<typeof templateLayerPreviewRequestSchema>;

/**
 * `new_variant` forks a new template from the open one. `this_variant` writes the open template's
 * next revision, and is refused on a golden source: the original upload is never rewritten here.
 */
export const templateLayerSaveTargetSchema = z.enum(['new_variant', 'this_variant']);
export type TemplateLayerSaveTarget = z.infer<typeof templateLayerSaveTargetSchema>;

export const saveTemplateLayerVariantRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedVersionId: z.string().uuid(),
    compId: z.number().int().positive().optional(),
    edits: z.array(templateLayerEditSchema).max(64),
    orders: z.array(templateLayerOrderSchema).max(16).default([]),
    saveTo: templateLayerSaveTargetSchema.default('new_variant'),
    name: renameTemplateSourceRequestSchema.shape.title.optional(),
    exposures: z
      .array(z.object({ slotKey: templateSlotSchema.shape.key, exposed: z.boolean() }).strict())
      .max(512),
  })
  .strict()
  .refine(
    (r) =>
      distinctTargets(r) && new Set(r.exposures.map((e) => e.slotKey)).size === r.exposures.length,
    'Duplicate layer, composition or field',
  )
  .refine((r) => r.saveTo === 'this_variant' || r.name !== undefined, {
    message: 'Name your variant',
    path: ['name'],
  });
export type SaveTemplateLayerVariantRequest = z.infer<typeof saveTemplateLayerVariantRequestSchema>;

export const templateEditableLayerSchema = z
  .object({
    compId: z.number().int().positive(),
    comp: z.string(),
    layerId: z.number().int().positive(),
    name: z.string(),
    kind: z.enum(['text', 'composition', 'artwork']),
    visible: z.boolean(),
    visibilityReason: z.string().nullable(),
    textReason: z.string().nullable(),
    text: z.string().nullable(),
    font: z.string().nullable(),
    fontSize: z.number().finite().nullable(),
    slotKeys: z.array(z.string()),
    visibilitySlotKeys: z.array(z.string()),
    /** Stack position in its comp; 0 is the top (AE's layer 1). */
    index: z.number().int().nonnegative(),
    position: z.tuple([z.number(), z.number()]).nullable(),
    rotation: z.number().nullable(),
    scale: z.tuple([z.number(), z.number()]).nullable(),
    opacity: z.number().nullable(),
    /** Why a transform property cannot be written, per property. Absent = editable. */
    transformLocks: z.partialRecord(z.enum(TEMPLATE_LAYER_TRANSFORMS), z.string()),
    /** Position is in this parent's space when set. */
    parentName: z.string().nullable(),
    /** The parent layer, so a viewer can move a parent's children with it. */
    parentId: z.number().int().positive().nullable(),
  })
  .strict();
export type TemplateEditableLayer = z.infer<typeof templateEditableLayerSchema>;
export const templateLayerPreviewResponseSchema = z
  .object({
    compId: z.number().int().positive(),
    comps: z.array(
      z
        .object({
          id: z.number().int().positive(),
          name: z.string(),
          /** Why this comp's layers cannot be re-stacked. Null = they can. */
          orderReason: z.string().nullable(),
        })
        .strict(),
    ),
    layers: z.array(templateEditableLayerSchema),
    svg: z.string().min(1),
    warnings: z.array(z.string()),
  })
  .strict();
export type TemplateLayerPreviewResponse = z.infer<typeof templateLayerPreviewResponseSchema>;

/**
 * The Layers tab loads the unedited file in two parts, each stored once per source version: the
 * layer list (every comp) and one comp's composed scene. An edited preview still answers both.
 */
export const templateLayerViewQuerySchema = z
  .object({
    brandId: z.string().uuid(),
    versionId: z.string().uuid(),
    /** Scene only: the comp to draw. Omitted: the template's default (delivery) comp. */
    compId: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type TemplateLayerViewQuery = z.infer<typeof templateLayerViewQuerySchema>;

/** `GET /api/ai-studio/templates/:assetId/layers` */
export const templateLayerInventorySchema = templateLayerPreviewResponseSchema.omit({ svg: true });
export type TemplateLayerInventory = z.infer<typeof templateLayerInventorySchema>;

/** `GET /api/ai-studio/templates/:assetId/layer-scene` */
export const templateLayerSceneSchema = templateLayerPreviewResponseSchema.pick({
  compId: true,
  svg: true,
  warnings: true,
});
export type TemplateLayerScene = z.infer<typeof templateLayerSceneSchema>;
export const templateLayerPackageResponseSchema = templateLayerPreviewResponseSchema.extend({
  filename: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  inlineBase64: z.string().min(1),
});
export const templateLayerVariantResponseSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    parseState: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type TemplateLayerVariantResponse = z.infer<typeof templateLayerVariantResponseSchema>;

/** Golden = the original upload, never rewritten by layer edits. A variant names its parent. */
export const templateLineageSchema = z
  .object({
    role: z.enum(['golden', 'variant']),
    parent: z.object({ assetId: z.string().uuid(), name: z.string() }).strict().nullable(),
  })
  .strict();
export type TemplateLineage = z.infer<typeof templateLineageSchema>;

/** The layer list as the tab reads it: plus where the template came from, read fresh. */
export const templateLayerInventoryResponseSchema = templateLayerInventorySchema
  .extend({
    lineage: templateLineageSchema,
    /** Imported from a Photoshop or Illustrator file, so it can carry arrangements. */
    designImport: z.boolean(),
  })
  .strict();
export type TemplateLayerInventoryResponse = z.infer<typeof templateLayerInventoryResponseSchema>;
export const templateLayerVariantsResponseSchema = z
  .object({
    lineage: templateLineageSchema,
    variants: z.array(z.object({ assetId: z.string().uuid(), name: z.string() }).strict()),
  })
  .strict();
export type TemplateLayerVariantsResponse = z.infer<typeof templateLayerVariantsResponseSchema>;
