import { z } from 'zod';
import { templateRevisionRefSchema } from './template-revision-pin';

export * from './template-revision-pin';

import { designArrangementSchema } from '../hyperframes-aep/design-import';
import { templateSourceKindSchema, templateSourceSummarySchema } from './template-source';
import { templateSourceSlotEditSchema } from './template-source-slot';

const transformPairSchema = (limit: number) =>
  z.tuple([z.number().finite().min(-limit).max(limit), z.number().finite().min(-limit).max(limit)]);

/**
 * One layer's changes. `x`/`y` are the layer's AE Position, on any layer; rotation (degrees),
 * scale (percent per axis) and opacity (percent) are its static transform values.
 */
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
    rotation: z.number().finite().min(-36_000).max(36_000).optional(),
    scale: transformPairSchema(10_000).optional(),
    opacity: z.number().finite().min(0).max(100).optional(),
  })
  .strict()
  .refine(
    (edit) =>
      [
        'font',
        'fontSize',
        'text',
        'visible',
        'x',
        'y',
        'width',
        'height',
        'rotation',
        'scale',
        'opacity',
      ].some((key) => key in edit),
    'Choose a layer change',
  );
export type TemplateRevisionLayerEdit = z.infer<typeof templateRevisionLayerEditSchema>;

/** One comp re-stacked: every layer of it exactly once, top first. */
export const templateLayerOrderSchema = z
  .object({
    compId: z.number().int().positive(),
    layerIds: z.array(z.number().int().positive()).min(2).max(1000),
  })
  .strict()
  .refine((order) => new Set(order.layerIds).size === order.layerIds.length, {
    message: 'A layer may appear only once',
  });
export type TemplateLayerOrder = z.infer<typeof templateLayerOrderSchema>;

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
    orders: z.array(templateLayerOrderSchema).max(16).default([]),
  })
  .strict()
  .superRefine((edits, ctx) => {
    const keys = edits.layers.map((layer) => `${layer.compId}:${layer.layerId}`);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate layer edit' });
    if (new Set(edits.orders.map((order) => order.compId)).size !== edits.orders.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate composition order' });
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

/**
 * Every refusal the revision registry can answer with. The Frontend keys its copy on this union,
 * so a new Backend code without words is a type error rather than a raw code on screen.
 */
export const templateRevisionErrorCodeSchema = z.enum([
  'template_revision_target_required',
  /** No revision is published to this template key and render workspace. */
  'template_revision_unpublished',
  /** Several revisions claim one target. The publication unique key makes this unreachable today. */
  'template_revision_selection_required',
  'template_revision_output_required',
  'template_revision_not_found',
  'template_revision_source_missing',
  /** The exact file is still there, but its bytes no longer match what was published. */
  'template_revision_source_changed',
  'template_variant_archived',
  'template_revision_head_conflict',
  'template_revision_multi_source_edit_unsupported',
  'template_revision_multi_source_publish_unsupported',
  'template_revision_sources_invalid',
]);
export type TemplateRevisionErrorCode = z.infer<typeof templateRevisionErrorCodeSchema>;

/**
 * One AEP package of a multi-source revision: the worker attachment the template's graph points
 * those outputs at, and the exact Library version holding its bytes. A template whose outputs run
 * different packages is described by all of them; no single file is its "master".
 */
export const templateRevisionSourceSchema = z
  .object({
    fileId: z.number().int().positive(),
    outputs: z.array(z.string().min(1)).min(1),
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
export type TemplateRevisionSource = z.infer<typeof templateRevisionSourceSchema>;

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
    /** Present only when the outputs run different packages; `sourceAssetId` is then one of them. */
    sources: z.array(templateRevisionSourceSchema).min(2).optional(),
    createdAt: z.string(),
    /** An auth user id: any Postgres uuid. Seeded users (the local fixture) are not RFC v4. */
    createdBy: z.guid().nullable(),
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
    sourceKind: templateSourceKindSchema,
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
