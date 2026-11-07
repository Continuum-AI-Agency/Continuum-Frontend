import { z } from 'zod';
import { sceneRenderRequestSchema } from './blend-scene';
import { templateOperationCoverageSchema, templateOperationInputSchema, templateOperationOriginSchema } from './template-operation-events';
import { hyperframesRevisionSchema } from './hyperframes-native-revisions';
import { templateRevisionRefSchema } from './template-revision-pin';

export * from './template-revision-pin';

import { designArrangementSchema } from '../hyperframes-aep/design-import';
import { templateSourceKindSchema, templateSourceSummarySchema } from './template-source';
import { templateSourceSlotEditSchema } from './template-source-slot';

const unit = z.number().finite().min(0).max(1);
/** An RGB colour in 0..1, as After Effects stores it. */
export const rgbSchema = z.tuple([unit, unit, unit]);

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
    /** The layer's own fill (a text's fill or a shape's solid Fill), RGB in 0..1. */
    fillColor: rgbSchema.optional(),
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
        'fillColor',
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

/**
 * Every chromatic colour the forge can write moves to its nearest palette entry (OKLab); white,
 * black and the greys stay, which is what keeps text legible. A snapshot field like the others, so
 * a later revision of the variant replays it — a brand colour's nearest entry is itself.
 */
export const templateRevisionRecolorSchema = z
  .object({
    palette: z
      .array(z.string().regex(/^#[0-9a-f]{6}$/i))
      .min(1)
      .max(12),
    /** Below this chroma (max − min channel, 0..1) a colour is a neutral and stays. Forge default: 0.008. */
    minChroma: z.number().min(0).max(1).optional(),
  })
  .strict();
export type TemplateRevisionRecolor = z.infer<typeof templateRevisionRecolorSchema>;

export const templateRevisionEditsSchema = z
  .object({
    arrangement: revisionArrangementSchema.optional(),
    layers: z.array(templateRevisionLayerEditSchema).max(64).default([]),
    slots: z.array(templateSourceSlotEditSchema).max(500).default([]),
    orders: z.array(templateLayerOrderSchema).max(16).default([]),
    recolor: templateRevisionRecolorSchema.optional(),
    blender: z.object({
      values: sceneRenderRequestSchema.shape.values,
      outputId: z.string().min(1),
      overrides: sceneRenderRequestSchema.shape.overrides,
    }).strict().optional(),
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
    Object.entries(edits.blender?.values ?? {}).forEach(([field, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && !value.versionId)
        ctx.addIssue({ code: 'custom', path: ['blender', 'values', field], message: 'Choose an exact Library media version' });
    });
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

/** A layer edit's identity: a design layer by artboard, an After Effects layer by comp. */
export function templateRevisionLayerKey(layer: TemplateRevisionLayerEdit): string {
  return layer.designLayerId !== undefined
    ? `design:${layer.artboardId ?? ''}:${layer.designLayerId}`
    : `${layer.compId}:${layer.layerId}`;
}

/** One edited field; an absent `from` / `to` means that revision leaves the field as the file has it. */
export interface TemplateRevisionFieldChange {
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface TemplateRevisionEditsDiff {
  layers: Array<{
    key: string;
    compId: number;
    layerId: number;
    changes: TemplateRevisionFieldChange[];
  }>;
  slots: Array<{ slotKey: string; changes: TemplateRevisionFieldChange[] }>;
  orders: Array<{ compId: number; from?: number[]; to?: number[] }>;
  recolor?: { from?: TemplateRevisionRecolor; to?: TemplateRevisionRecolor };
  arrangement?: { from?: unknown; to?: unknown };
  blender?: { from?: unknown; to?: unknown };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const both = <T>(from: T | undefined, to: T | undefined) => ({
  ...(from !== undefined ? { from } : {}),
  ...(to !== undefined ? { to } : {}),
});

function fieldChanges(
  from: Record<string, unknown> | undefined,
  to: Record<string, unknown> | undefined,
  identity: readonly string[],
): TemplateRevisionFieldChange[] {
  const fields = new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})]);
  return [...fields]
    .filter((field) => !identity.includes(field) && !same(from?.[field], to?.[field]))
    .sort()
    .map((field) => ({ field, ...both(from?.[field], to?.[field]) }));
}

function byKey<T, K extends string | number>(items: T[], key: (item: T) => K): Map<K, T> {
  return new Map(items.map((item) => [key(item), item]));
}

/**
 * What one revision edits differently from another. A revision's edits are its whole snapshot over
 * the source file, not a delta on its parent, so any two revisions of one source compare directly.
 */
export function diffTemplateRevisionEdits(
  fromEdits: TemplateRevisionEdits,
  toEdits: TemplateRevisionEdits,
): TemplateRevisionEditsDiff {
  // Parsed so both sides carry one key order and their defaults.
  const from = templateRevisionEditsSchema.parse(fromEdits);
  const to = templateRevisionEditsSchema.parse(toEdits);
  const layersFrom = byKey(from.layers, templateRevisionLayerKey);
  const layersTo = byKey(to.layers, templateRevisionLayerKey);
  const slotsFrom = byKey(from.slots, (slot) => slot.slotKey);
  const slotsTo = byKey(to.slots, (slot) => slot.slotKey);
  const ordersFrom = byKey(from.orders, (order) => order.compId);
  const ordersTo = byKey(to.orders, (order) => order.compId);
  const layers = [...new Set([...layersFrom.keys(), ...layersTo.keys()])].sort().flatMap((key) => {
    const before = layersFrom.get(key);
    const after = layersTo.get(key);
    const layer = (after ?? before)!;
    const changes = fieldChanges(before, after, [
      'compId',
      'layerId',
      'designLayerId',
      'artboardId',
    ]);
    return changes.length ? [{ key, compId: layer.compId, layerId: layer.layerId, changes }] : [];
  });
  const slots = [...new Set([...slotsFrom.keys(), ...slotsTo.keys()])].sort().flatMap((slotKey) => {
    const changes = fieldChanges(slotsFrom.get(slotKey), slotsTo.get(slotKey), ['slotKey']);
    return changes.length ? [{ slotKey, changes }] : [];
  });
  const orders = [...new Set([...ordersFrom.keys(), ...ordersTo.keys()])]
    .sort((a, b) => a - b)
    .flatMap((compId) => {
      const before = ordersFrom.get(compId)?.layerIds;
      const after = ordersTo.get(compId)?.layerIds;
      return same(before, after) ? [] : [{ compId, ...both(before, after) }];
    });
  return {
    layers,
    slots,
    orders,
    ...(same(from.recolor, to.recolor) ? {} : { recolor: both(from.recolor, to.recolor) }),
    ...(same(from.blender, to.blender) ? {} : { blender: both(from.blender, to.blender) }),
    ...(same(from.arrangement, to.arrangement)
      ? {}
      : { arrangement: both(from.arrangement, to.arrangement) }),
  };
}

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
  /** Only a variant with a published revision can be the one a family opens on. */
  'template_variant_unpublished',
  'template_revision_head_conflict',
  'template_revision_multi_source_edit_unsupported',
  'template_revision_multi_source_publish_unsupported',
  'template_revision_sources_invalid',
  /** The forge would leave part of the file in the old colours, so it changed none of them. */
  'template_recolor_refused',
  /** The forge answered without applying the recolour: it predates it. Deploy the forge first. */
  'template_forge_recolor_unsupported',
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
    /** Present for a saved native source/scene; legacy revision wire shapes stay unchanged. */
    native: hyperframesRevisionSchema.optional(),
  })
  .strict();
export type TemplateRevision = z.infer<typeof templateRevisionSchema>;

/** What a variant is FOR, beyond its name. `brand_aligned`: made by "Apply my design system". */
export const templateVariantTagSchema = z.enum(['brand_aligned']);
export type TemplateVariantTag = z.infer<typeof templateVariantTagSchema>;

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
    tags: z.array(templateVariantTagSchema).default([]),
    sourceKind: templateSourceKindSchema,
    revisions: z.array(templateRevisionSchema),
  })
  .strict();
export type TemplateRevisionVariant = z.infer<typeof templateRevisionVariantSchema>;
export const templateRevisionVariantsResponseSchema = z
  .object({ items: z.array(templateRevisionVariantSchema) })
  .strict();

/**
 * The variant a family opens on — its gallery card and the Render tab. No row means the Original.
 * Its own read rather than a field on the strict variant shape: an unpromoted Frontend rejects
 * unknown keys, so one default would fail every catalog read for the brand.
 */
export const templateVariantDefaultSchema = z
  .object({ templateId: z.string().uuid(), variantId: z.string().uuid() })
  .strict();
export type TemplateVariantDefault = z.infer<typeof templateVariantDefaultSchema>;
export const templateVariantDefaultsResponseSchema = z
  .object({ items: z.array(templateVariantDefaultSchema) })
  .strict();
/** Making the Original the default clears the family's pointer. */
export const setTemplateVariantDefaultRequestSchema = z
  .object({ brandId: z.string().uuid() })
  .strict();
export type SetTemplateVariantDefaultRequest = z.infer<
  typeof setTemplateVariantDefaultRequestSchema
>;

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
    operations: z.array(templateOperationInputSchema).max(500).optional(),
    operationCoverage: templateOperationCoverageSchema.optional(),
    origin: templateOperationOriginSchema.optional(),
    /** Only a new variant is tagged: a tag says what the variant was made for. */
    tags: z.array(templateVariantTagSchema).max(4).optional(),
  })
  .strict()
  .refine(
    (request) => Boolean(request.variantId) !== Boolean(request.name),
    'Name a new variant or choose an existing one',
  )
  .refine((request) => !request.tags?.length || Boolean(request.name), 'Tag a new variant only');
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
