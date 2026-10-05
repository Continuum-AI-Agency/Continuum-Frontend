import { z } from 'zod';
import { renameTemplateSourceRequestSchema, templateSlotSchema } from './template-source';

export const templateLayerEditSchema = z
  .object({
    compId: z.number().int().positive(),
    layerId: z.number().int().positive(),
    fontSize: z.number().finite().min(1).max(1000).optional(),
    font: z.string().trim().min(1).max(200).optional(),
    visible: z.boolean().optional(),
  })
  .strict()
  .refine(
    (e) => e.fontSize !== undefined || e.font !== undefined || e.visible !== undefined,
    'Choose a layer change',
  );
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
    slotKeys: z.array(z.string()),
    visibilitySlotKeys: z.array(z.string()),
  })
  .strict();
export type TemplateEditableLayer = z.infer<typeof templateEditableLayerSchema>;
export const templateLayerPreviewResponseSchema = z
  .object({
    compId: z.number().int().positive(),
    comps: z.array(z.object({ id: z.number().int().positive(), name: z.string() }).strict()),
    layers: z.array(templateEditableLayerSchema),
    svg: z.string().min(1),
    warnings: z.array(z.string()),
  })
  .strict();
export type TemplateLayerPreviewResponse = z.infer<typeof templateLayerPreviewResponseSchema>;
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
