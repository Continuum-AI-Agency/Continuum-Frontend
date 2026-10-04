import { z } from 'zod';
import { templateRevisionLayerEditSchema } from './template-revisions';

export const templateLayerEditSchema = templateRevisionLayerEditSchema;
export type TemplateLayerEdit = z.infer<typeof templateLayerEditSchema>;

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
