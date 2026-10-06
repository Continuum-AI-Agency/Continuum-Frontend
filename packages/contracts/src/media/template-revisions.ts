import { z } from 'zod';
import { templateRevisionRefSchema } from './template-revision-pin';

export * from './template-revision-pin';

import { designArrangementSchema } from '../hyperframes-aep/design-import';
import { templateSourceSummarySchema } from './template-source';
import { templateSourceSlotEditSchema } from './template-source-slot';

export const templateRevisionLayerEditSchema = z
  .object({
    compId: z.number().int().positive(),
    layerId: z.number().int().positive(),
    designLayerId: z.number().int().optional(),
    artboardId: z.number().int().nullable().optional(),
    font: z.string().trim().min(1).max(200).optional(),
    fontSize: z.number().finite().min(1).max(1000).optional(),
    text: z.string().max(20_000).optional(),
    visible: z.boolean().optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().finite().positive().max(100_000).optional(),
    height: z.number().finite().positive().max(100_000).optional(),
  })
  .strict()
  .refine(
    (edit) =>
      ['font', 'fontSize', 'text', 'visible', 'x', 'y', 'width', 'height'].some(
        (key) => key in edit,
      ),
    'Choose a layer change',
  );
export type TemplateRevisionLayerEdit = z.infer<typeof templateRevisionLayerEditSchema>;

/**
 * Arrangements saved before artboards were recorded carry no `artboardId`; the registry backfill
 * copied nine of them into immutable revisions, and one such row failed every catalog read for its
 * brand. They re-stack the canvas, which is what null means.
 */
const revisionArrangementSchema = designArrangementSchema.extend({
  artboardId: z.number().int().nullable().default(null),
});

export const templateRevisionEditsSchema = z
  .object({
    arrangement: revisionArrangementSchema.optional(),
    layers: z.array(templateRevisionLayerEditSchema).max(64).default([]),
    slots: z.array(templateSourceSlotEditSchema).max(500).default([]),
  })
  .strict()
  .superRefine((edits, ctx) => {
    const keys = edits.layers.map((layer) => `${layer.compId}:${layer.layerId}`);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate layer edit' });
    if (new Set(edits.slots.map((slot) => slot.slotKey)).size !== edits.slots.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate field edit' });
    edits.slots.forEach((slot, index) => {
      if (
        slot.defaultValue &&
        typeof slot.defaultValue === 'object' &&
        !slot.defaultValue.versionId
      )
        ctx.addIssue({
          code: 'custom',
          path: ['slots', index, 'defaultValue'],
          message: 'Choose an exact Library media version',
        });
    });
  });
export type TemplateRevisionEdits = z.infer<typeof templateRevisionEditsSchema>;

export const templateRevisionPublicationSchema = z
  .object({
    templateKey: z.string().min(1),
    bindingId: z.string().uuid(),
    workspace: z.string().min(1),
    renderTemplateId: z.number().int().positive().optional(),
    contractHash: z.string().nullable().default(null),
  })
  .strict();
export type TemplateRevisionPublication = z.infer<typeof templateRevisionPublicationSchema>;

export const templateRevisionSchema = z
  .object({
    templateId: z.string().uuid(),
    variantId: z.string().uuid(),
    id: z.string().uuid(),
    number: z.number().int().positive(),
    parentRevisionId: z.string().uuid().nullable(),
    sourceAssetId: z.string().uuid(),
    sourceVersionId: z.string().uuid(),
    checksum: z.string().regex(/^(sha256:)?[0-9a-f]{64}$/i),
    edits: templateRevisionEditsSchema,
    source: templateSourceSummarySchema,
    dependencies: z
      .object({
        fonts: z.array(
          z
            .object({
              filename: z.string().min(1),
              postScriptName: z.string().min(1),
              checksum: z.string().regex(/^(sha256:)?[0-9a-f]{64}$/i),
            })
            .strict(),
        ),
        media: z.array(
          z.object({ assetId: z.string().uuid(), versionId: z.string().uuid() }).strict(),
        ),
      })
      .strict()
      .nullable()
      .default(null),
    publications: z.array(templateRevisionPublicationSchema),
    createdAt: z.string(),
    createdBy: z.string().uuid().nullable(),
    nativeCommitId: z.string().nullable().default(null),
  })
  .strict();
export type TemplateRevision = z.infer<typeof templateRevisionSchema>;

export const templateRevisionVariantSchema = z
  .object({
    templateId: z.string().uuid(),
    variantId: z.string().uuid(),
    name: z.string().min(1).max(120),
    original: z.boolean(),
    parentRevisionId: z.string().uuid().nullable(),
    draftHeadRevisionId: z.string().uuid(),
    publishedHeadRevisionId: z.string().uuid().nullable(),
    archivedAt: z.string().nullable(),
    sourceKind: z.enum(['photoshop', 'illustrator', 'after_effects', 'other']),
    revisions: z.array(templateRevisionSchema),
  })
  .strict();
export type TemplateRevisionVariant = z.infer<typeof templateRevisionVariantSchema>;
export const templateRevisionVariantsResponseSchema = z
  .object({ items: z.array(templateRevisionVariantSchema) })
  .strict();

export const templateRevisionPreviewRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    parentRevisionId: z.string().uuid(),
    edits: templateRevisionEditsSchema,
    compId: z.number().int().positive().optional(),
  })
  .strict();
export type TemplateRevisionPreviewRequest = z.infer<typeof templateRevisionPreviewRequestSchema>;

export const saveTemplateRevisionRequestSchema = templateRevisionPreviewRequestSchema
  .extend({
    variantId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    expectedHeadRevisionId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
    uploadAssetId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (request) => Boolean(request.variantId) !== Boolean(request.name),
    'Name a new variant or choose an existing one',
  );
export type SaveTemplateRevisionRequest = z.infer<typeof saveTemplateRevisionRequestSchema>;

export const changeRenderSetTemplateRevisionRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    templateRevision: templateRevisionRefSchema,
    templateKey: z.string().min(1),
    bindingId: z.string().uuid(),
  })
  .strict();
export type ChangeRenderSetTemplateRevisionRequest = z.infer<
  typeof changeRenderSetTemplateRevisionRequestSchema
>;
