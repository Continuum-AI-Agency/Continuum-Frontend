import { z } from 'zod';
import { renameTemplateSourceRequestSchema, templateSlotSchema } from './template-source';
import { templateRevisionLayerEditSchema } from './template-revisions';

export const templateLayerEditSchema = templateRevisionLayerEditSchema;

/** The static transform properties a layer edit may write. `position` is written as `x`/`y`. */
export const TEMPLATE_LAYER_TRANSFORMS = ['position', 'rotation', 'scale', 'opacity'] as const;
export type TemplateLayerTransform = (typeof TEMPLATE_LAYER_TRANSFORMS)[number];
export type TemplateLayerEdit = z.infer<typeof templateLayerEditSchema>;

export const templateLayerPreviewRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedVersionId: z.string().uuid(),
    compId: z.number().int().positive().optional(),
    edits: z.array(templateLayerEditSchema).max(64),
  })
  .strict()
  .refine(
    (r) => new Set(r.edits.map((e) => e.layerId)).size === r.edits.length,
    'A layer may appear only once',
  );
export type TemplateLayerPreviewRequest = z.infer<typeof templateLayerPreviewRequestSchema>;

export const saveTemplateLayerVariantRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedVersionId: z.string().uuid(),
    compId: z.number().int().positive().optional(),
    edits: z.array(templateLayerEditSchema).max(64),
    name: renameTemplateSourceRequestSchema.shape.title,
    exposures: z
      .array(z.object({ slotKey: templateSlotSchema.shape.key, exposed: z.boolean() }).strict())
      .max(512),
  })
  .strict()
  .refine(
    (r) =>
      new Set(r.edits.map((e) => e.layerId)).size === r.edits.length &&
      new Set(r.exposures.map((e) => e.slotKey)).size === r.exposures.length,
    'Duplicate layer or field',
  );
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
    designLayerId: z.number().int().nullable().optional(),
    artboardId: z.number().int().nullable().optional(),
    x: z.number().finite().nullable().optional(),
    y: z.number().finite().nullable().optional(),
    width: z.number().finite().nullable().optional(),
    height: z.number().finite().nullable().optional(),
    geometryReason: z.string().nullable().optional(),
    slotKeys: z.array(z.string()),
    visibilitySlotKeys: z.array(z.string()),
    /** Stack position in its comp; 0 is the top (AE's layer 1). */
    index: z.number().int().nonnegative().optional(),
    rotation: z.number().finite().nullable().optional(),
    scale: z.tuple([z.number().finite(), z.number().finite()]).nullable().optional(),
    opacity: z.number().finite().nullable().optional(),
    /** Why a transform property cannot be written, per property. Absent = editable. */
    transformLocks: z.partialRecord(z.enum(TEMPLATE_LAYER_TRANSFORMS), z.string()).optional(),
    /** The parent layer: its children move with it, and `x`/`y` are in its space. */
    parentId: z.number().int().positive().nullable().optional(),
    parentName: z.string().nullable().optional(),
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
          orderReason: z.string().nullable().optional(),
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
 * The Layers tab loads a source version's unedited file in two parts, each stored once per version:
 * the layer list (every comp) and one comp's composed scene. `assetId` (the route) and `versionId`
 * name the exact source: a revision's `sourceAssetId` and `sourceVersionId`.
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
    parseState: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type TemplateLayerVariantResponse = z.infer<typeof templateLayerVariantResponseSchema>;
export const templateLayerVariantsResponseSchema = z
  .object({
    variants: z.array(z.object({ assetId: z.string().uuid(), name: z.string() }).strict()),
  })
  .strict();
