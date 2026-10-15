import { z } from 'zod';
import {
  templateAuthoringFreshArtboardReceiptSchema,
  templateAuthoringGroupIdentityMapEntrySchema,
  templateAuthoringGroupMemberIdentitySchema,
} from './template-authoring-group';
import { templateLayerPositionSourceSchema, templateMaskSourceGeometrySchema } from './template-source';
import { templateAuthoringSourceKeyframeIdSchema } from './template-authoring-keyframes';
import { templateLayerPreviewResponseSchema } from './template-layer-edits';

const uuid = z.string().uuid();
const nativeCompId = z.number().int().positive();
const compositionTargetFields = { compId: nativeCompId.optional(), artboardId: uuid.optional() };
const hasExactlyOneCompositionTarget = (value: { compId?: number; artboardId?: string }) =>
  (value.compId !== undefined) !== (value.artboardId !== undefined);
const sourceRefSchema = z
  .object({ compId: z.number().int().positive(), layerId: z.number().int().positive() })
  .strict();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
export const templateAuthoringSeedSchema = z.object({
  artifactId: uuid,
  packageChecksum: sha256,
  attachedAtRevision: z.number().int().positive(),
  sourceRevisionId: uuid,
  sourceHtmlSha256: sha256,
  extractedSceneSha256: sha256,
}).strict();
export type TemplateAuthoringSeed = z.infer<typeof templateAuthoringSeedSchema>;
export const templateAuthoringWorkspacePackageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pinned_source'), packageChecksum: sha256 }).strict(),
  z.object({
    kind: z.literal('hyperframes_seed'),
    artifactId: uuid,
    packageChecksum: sha256,
    sourceRevisionId: uuid,
    sourceHtmlSha256: sha256,
    extractedSceneSha256: sha256,
  }).strict(),
]);
export type TemplateAuthoringWorkspacePackage = z.infer<typeof templateAuthoringWorkspacePackageSchema>;
export const templateAuthoringNodeId = (ref: { compId: number; layerId: number }) =>
  `aep:${ref.compId}:${ref.layerId}`;
export const templateAuthoringDraftNodeId = (id: string) => `draft:${id}`;
/** Stable address for an original layer cloned into a draft artboard. A collision is rejected by projection. */
export const templateAuthoringArtboardDraftNodeId = (artboardId: string, sourceNodeId: string) => {
  const input = `${artboardId.toLowerCase()}\u0000${sourceNodeId}`;
  const words = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35].map((seed) => {
    let hash = seed;
    for (let index = 0; index < input.length; index += 1) {
      hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
      hash ^= hash >>> 13;
    }
    return hash >>> 0;
  });
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `draft:${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const draftNodeId = z
  .string()
  .regex(/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const aepNodeId = z.string().regex(/^aep:[1-9]\d*:[1-9]\d*$/);
const nodeId = z.union([draftNodeId, aepNodeId]);
const repositoryFontRefSchema = z
  .object({
    fontId: z.string().uuid(),
    postScriptName: z.string().trim().min(1).max(200),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();
const workspacePackageFontRefSchema = z.object({
  kind: z.literal('workspace_package'),
  packageChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  postScriptName: z.string().trim().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
const fontRefSchema = z.union([repositoryFontRefSchema, workspacePackageFontRefSchema]);
const artworkAssetRefSchema = z.object({
  assetId: uuid,
  versionId: uuid,
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
export const templateAuthoringDraftNodeEditSchema = z
  .object({
    fontRef: fontRefSchema.optional(),
    text: z.string().max(20_000).optional(),
    fontSize: z.number().finite().min(1).max(1000).optional(),
    visible: z.boolean().optional(),
    position: z
      .tuple([
        z.number().finite().min(-100_000).max(100_000),
        z.number().finite().min(-100_000).max(100_000),
      ])
      .optional(),
    rotation: z.number().finite().min(-36_000).max(36_000).optional(),
    scale: z
      .tuple([
        z.number().finite().min(-10_000).max(10_000),
        z.number().finite().min(-10_000).max(10_000),
      ])
      .optional(),
    opacity: z.number().finite().min(0).max(100).optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((value) => value !== undefined), 'Choose a layer change');

/** Native command coordinates remain AE Position pairs; the revision adapter records x/y. */
export const templateAuthoringSourceLayerEditSchema = z.object({
  ...templateAuthoringDraftNodeEditSchema.shape,
  compId: nativeCompId,
  layerId: z.number().int().positive(),
  font: z.string().trim().min(1).max(200).optional(),
}).strict().refine(
  edit => Object.entries(edit).some(([key, value]) => !['compId', 'layerId'].includes(key) && value !== undefined),
  'Choose a layer change',
);
export type TemplateAuthoringSourceLayerEdit = z.infer<typeof templateAuthoringSourceLayerEditSchema>;

export const templateAuthoringScopeSchema = z
  .object({ brandId: uuid, assetId: uuid, baseVersionId: uuid })
  .strict();
export type TemplateAuthoringScope = z.infer<typeof templateAuthoringScopeSchema>;

export const templateAuthoringCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dependency.relink'),
    footageItemId: nativeCompId,
    assetRef: artworkAssetRefSchema,
  }).strict(),
  z
    .object({
      type: z.literal('artwork.create'),
      nodeId: draftNodeId,
      ...compositionTargetFields,
      name: z.string().trim().min(1).max(200),
      position: z.tuple([
        z.number().finite().min(-100_000).max(100_000),
        z.number().finite().min(-100_000).max(100_000),
      ]),
      size: z.tuple([
        z.number().finite().positive().max(100_000),
        z.number().finite().positive().max(100_000),
      ]),
      assetRef: artworkAssetRefSchema,
    })
    .strict().refine(hasExactlyOneCompositionTarget, 'Provide exactly one composition target'),
  z.object({
    type: z.literal('artboard.resize'),
    ...compositionTargetFields,
    width: z.number().int().min(4).max(30_000),
    height: z.number().int().min(4).max(30_000),
  }).strict().refine(hasExactlyOneCompositionTarget, 'Provide exactly one composition target'),
  z.object({
    type: z.literal('artboard.create'),
    artboardId: uuid,
    name: z.string().trim().min(1).max(180),
    width: z.number().int().min(4).max(30_000),
    height: z.number().int().min(4).max(30_000),
    frameRate: z.number().finite().min(1).max(99),
    durationSec: z.number().finite().min(1 / 99).max(10_800),
  }).strict(),
  z.object({
    type: z.literal('artboard.duplicate'),
    artboardId: uuid,
    sourceCompId: nativeCompId.optional(),
    sourceArtboardId: uuid.optional(),
    name: z.string().trim().min(1).max(180),
  }).strict().refine((value) => (value.sourceCompId !== undefined) !== (value.sourceArtboardId !== undefined),
    'Provide exactly one artboard duplication source'),
  z.object({
    type: z.literal('layer.timing'),
    nodeId,
    inSec: z.number().finite().min(-100_000).max(100_000),
    outSec: z.number().finite().min(-100_000).max(100_000),
  }).strict().refine((value) => value.outSec > value.inSec, 'outSec must be after inSec'),
  z.object({
    type: z.literal('layer.keyframes.replace'),
    nodeId,
    channelId: z.string().trim().min(1).max(240),
    channel: z.enum(['position', 'scale', 'rotation', 'opacity']),
    keyframes: z.array(z.object({
      keyframeId: z.union([draftNodeId, templateAuthoringSourceKeyframeIdSchema]),
      timeSec: z.number().finite().min(-10_800).max(100_000),
      value: z.union([
        z.number().finite().min(-100_000).max(100_000),
        z.tuple([
          z.number().finite().min(-100_000).max(100_000),
          z.number().finite().min(-100_000).max(100_000),
          z.number().finite().min(-100_000).max(100_000),
        ]),
      ]),
      inInterpolation: z.enum(['LINEAR', 'BEZIER', 'HOLD']),
      outInterpolation: z.enum(['LINEAR', 'BEZIER', 'HOLD']),
      inEase: z.array(z.object({ speed: z.number().finite(), influence: z.number().finite().min(0.1).max(100) }).strict()).min(1).max(3).optional(),
      outEase: z.array(z.object({ speed: z.number().finite(), influence: z.number().finite().min(0.1).max(100) }).strict()).min(1).max(3).optional(),
    }).strict()).max(2000),
  }).strict().superRefine((value, ctx) => {
    if (new Set(value.keyframes.map((frame) => frame.keyframeId)).size !== value.keyframes.length)
      ctx.addIssue({ code: 'custom', message: 'keyframe IDs must be unique', path: ['keyframes'] });
    for (const [index, frame] of value.keyframes.entries()) {
      if (frame.timeSec < -10_800 || (index > 0 && frame.timeSec <= value.keyframes[index - 1]!.timeSec))
        ctx.addIssue({ code: 'custom', message: 'keyframes must be ordered at unique supported times', path: ['keyframes', index, 'timeSec'] });
      if ((frame.inEase && frame.inInterpolation !== 'BEZIER') || (frame.outEase && frame.outInterpolation !== 'BEZIER'))
        ctx.addIssue({ code: 'custom', message: 'temporal ease requires BEZIER interpolation', path: ['keyframes', index] });
      const vectorChannel = value.channel === 'position' || value.channel === 'scale';
      if (vectorChannel !== Array.isArray(frame.value))
        ctx.addIssue({ code: 'custom', message: `${value.channel} has an invalid value shape`, path: ['keyframes', index, 'value'] });
      if (value.channel === 'opacity' && typeof frame.value === 'number' && (frame.value < 0 || frame.value > 100))
        ctx.addIssue({ code: 'custom', message: 'opacity must be within 0..100', path: ['keyframes', index, 'value'] });
    }
  }),
  z.object({
    type: z.literal('mask.create'),
    draftMaskId: uuid,
    nodeId: nodeId,
    name: z.string().trim().min(1).max(200),
    shape: z.enum(['rectangle', 'ellipse']),
    center: z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]),
    size: z.tuple([z.number().finite().positive().max(100_000), z.number().finite().positive().max(100_000)]),
    mode: z.enum(['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference']),
    opacity: z.number().finite().min(0).max(100),
    feather: z.tuple([z.number().finite().min(0).max(32_000), z.number().finite().min(0).max(32_000)]),
  }).strict(),
  z.object({
    type: z.literal('mask.update'),
    nodeId,
    draftMaskId: uuid,
    patch: z.object({
      name: z.string().trim().min(1).max(200).optional(),
      center: z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]).optional(),
      size: z.tuple([z.number().finite().positive().max(100_000), z.number().finite().positive().max(100_000)]).optional(),
      mode: z.enum(['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference']).optional(),
      opacity: z.number().finite().min(0).max(100).optional(),
      feather: z.tuple([z.number().finite().min(0).max(32_000), z.number().finite().min(0).max(32_000)]).optional(),
    }).strict().refine((patch) => Object.values(patch).some((value) => value !== undefined), 'Choose a mask property change'),
  }).strict(),
  z.object({ type: z.literal('mask.delete'), nodeId, draftMaskId: uuid }).strict(),
  z
    .object({
      type: z.literal('shape.create'),
      nodeId: draftNodeId,
      ...compositionTargetFields,
      shape: z.enum(['rectangle', 'ellipse']),
      name: z.string().trim().min(1).max(200),
      position: z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]),
      size: z.tuple([z.number().finite().positive().max(100_000), z.number().finite().positive().max(100_000)]),
      fill: z.discriminatedUnion('type', [
        z.object({ type: z.literal('none') }).strict(),
        z.object({ type: z.literal('solid'), color: z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]), opacity: z.number().finite().min(0).max(1) }).strict(),
      ]),
      stroke: z.discriminatedUnion('type', [
        z.object({ type: z.literal('none') }).strict(),
        z.object({ type: z.literal('solid'), color: z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]), opacity: z.number().finite().min(0).max(1), width: z.number().finite().positive().max(10_000) }).strict(),
      ]),
    })
    .strict().refine(hasExactlyOneCompositionTarget, 'Provide exactly one composition target'),
  z
    .object({
      type: z.literal('layer.edit'),
      nodeId,
      edit: z.union([templateAuthoringSourceLayerEditSchema, templateAuthoringDraftNodeEditSchema]),
    })
    .strict()
    .refine(
      (v) =>
        v.nodeId.startsWith('aep:')
          ? 'compId' in v.edit &&
            'layerId' in v.edit &&
            v.nodeId === templateAuthoringNodeId(v.edit)
          : !('compId' in v.edit) && !('layerId' in v.edit),
      'AEP edits must match their immutable source reference; draft-node edits cannot invent native IDs',
    ),
  z
    .object({
      type: z.literal('composition.order'),
      ...compositionTargetFields,
      layerIds: z.array(z.number().int().positive()).min(2).max(1000).optional(),
      nodeIds: z.array(nodeId).min(2).max(1000).optional(),
    })
    .strict()
    .refine(hasExactlyOneCompositionTarget, 'Provide exactly one composition target')
    .refine(
      (v) => (v.layerIds === undefined) !== (v.nodeIds === undefined),
      'Provide exactly one order identity list',
    )
    .refine(
      (v) => v.artboardId === undefined || v.layerIds === undefined,
      'Draft artboard order must use draft node IDs',
    )
    .refine(
      (v) => v.layerIds === undefined || new Set(v.layerIds).size === v.layerIds.length,
      'A layer may appear only once',
    )
    .refine(
      (v) => v.nodeIds === undefined || new Set(v.nodeIds).size === v.nodeIds.length,
      'A node may appear only once',
    ),
  z
    .object({
      type: z.literal('exposure.set'),
      slotKey: z.string().trim().min(1).max(200),
      exposed: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('text.create'),
      nodeId: draftNodeId,
      ...compositionTargetFields,
      name: z.string().trim().min(1).max(200),
      text: z.string().min(1).max(20_000),
      fontRef: fontRefSchema,
      fontSize: z.number().finite().min(1).max(1000),
      fillColor: z.tuple([
        z.number().finite().min(0).max(1),
        z.number().finite().min(0).max(1),
        z.number().finite().min(0).max(1),
      ]),
      position: z.tuple([
        z.number().finite().min(-100_000).max(100_000),
        z.number().finite().min(-100_000).max(100_000),
      ]),
    })
    .strict().refine(hasExactlyOneCompositionTarget, 'Provide exactly one composition target'),
  z
    .object({
      type: z.literal('layer.duplicate'),
      nodeId: draftNodeId,
      sourceNodeId: nodeId,
      name: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal('layer.group'),
      nodeId: draftNodeId,
      ...compositionTargetFields,
      name: z.string().trim().min(1).max(200),
      memberNodeIds: z.array(nodeId).min(2).max(32).refine(
        (ids) => new Set(ids).size === ids.length,
        'Group member node IDs must be unique',
      ),
    })
    .strict().refine(hasExactlyOneCompositionTarget, 'Provide exactly one composition target'),
  z.object({
    type: z.literal('layer.group.transform'),
    nodeId: draftNodeId,
    transform: z.object({
      position: z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]).optional(),
      scale: z.tuple([z.number().finite().positive().max(10_000), z.number().finite().positive().max(10_000)]).optional(),
      rotation: z.number().finite().min(-36_000).max(36_000).optional(),
    }).strict().refine((value) => Object.values(value).some((item) => item !== undefined), 'Choose a group transform'),
  }).strict(),
  z.object({ type: z.literal('layer.ungroup'), nodeId: draftNodeId }).strict(),
  z.object({ type: z.literal('layer.delete'), nodeId }).strict(),
]);
export type TemplateAuthoringCommand = z.infer<typeof templateAuthoringCommandSchema>;

export const templateAuthoringCapabilitiesSchema = z
  .object({
    transform: z.boolean(),
    visibility: z.boolean(),
    font: z.boolean(),
    text: z.boolean(),
    order: z.boolean(),
    exposure: z.boolean(),
    creation: z.literal(false),
    duplicate: z.boolean(),
    delete: z.boolean(),
    grouping: z.boolean(),
    masks: z.boolean(),
    artboardMutation: z.boolean(),
    timing: z.boolean().default(false),
    keyframes: z.boolean(),
  })
  .strict();
export type TemplateAuthoringCapabilities = z.infer<typeof templateAuthoringCapabilitiesSchema>;

export const templateAuthoringDiagnosticSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    severity: z.enum(['info', 'warning', 'error']),
    status: z.enum(['ready', 'warning', 'pending', 'blocked']),
    compId: z.number().int().optional(),
    layerId: z.number().int().optional(),
  })
  .strict();
export type TemplateAuthoringDiagnostic = z.infer<typeof templateAuthoringDiagnosticSchema>;

export const templateAuthoringCurrentSourceSchema = z
  .object({
    templateSourceVersionId: uuid.nullable(),
    templateSourceChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable(),
    assetHeadVersionId: uuid.nullable(),
    assetHeadChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable(),
  })
  .strict();
export type TemplateAuthoringCurrentSource = z.infer<typeof templateAuthoringCurrentSourceSchema>;

export const templateAuthoringNodeSchema = z
  .object({
    nodeId,
    sourceRef: sourceRefSchema.nullable(),
    sourceNodeId: nodeId.nullable(),
    sourceCompositionId: z.number().int().nullable(),
    parentNodeId: nodeId.nullable(),
    name: z.string().nullable(),
    textContent: z.string().nullable(),
    fontRef: fontRefSchema.nullable(),
    fillColor: z.tuple([z.number(), z.number(), z.number()]).nullable(),
    kind: z.enum(['text', 'shape', 'composition', 'artwork', 'group']),
    artworkAssetRef: artworkAssetRefSchema.nullable().default(null),
    shape: z.enum(['rectangle', 'ellipse']).nullable(),
    size: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
    pathPosition: z.tuple([z.number().finite(), z.number().finite()]).nullable(),
    fill: z.discriminatedUnion('type', [
      z.object({ type: z.literal('none') }).strict(),
      z.object({
        type: z.literal('solid'),
        color: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
        opacity: z.number().finite(),
      }).strict(),
    ]).nullable(),
    stroke: z.discriminatedUnion('type', [
      z.object({ type: z.literal('none') }).strict(),
      z.object({
        type: z.literal('solid'),
        color: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
        opacity: z.number().finite(),
        width: z.number().finite(),
      }).strict(),
    ]).nullable(),
    inSec: z.number().finite().nullable(),
    outSec: z.number().finite().nullable(),
    timingReason: z.string().nullable().default('authoring_timing_preflight_pending'),
    keyframeChannels: z.array(z.object({
      channelId: z.string().min(1),
      channel: z.enum(['position', 'scale', 'rotation', 'opacity']),
      matchName: z.string().min(1),
      frameRate: z.number().finite().positive().nullable(),
      dimensions: z.number().int().positive().max(3).nullable(),
      separated: z.boolean().nullable(),
      baseValue: z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])]).nullable().optional(),
      reason: z.string().nullable(),
      propertyReason: z.string().nullable().optional(),
      propertyBaseValue: z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])]).nullable().optional(),
      keyframes: z.array(z.object({
        keyframeId: z.string().min(1),
        timeSec: z.number().finite(),
        nativeTimeSec: z.number().finite().optional(),
        value: z.union([z.number().finite(), z.array(z.number().finite()).min(1).max(3)]),
        inInterpolation: z.enum(['LINEAR', 'BEZIER', 'HOLD']),
        outInterpolation: z.enum(['LINEAR', 'BEZIER', 'HOLD']),
        inEase: z.array(z.object({ speed: z.number().finite(), influence: z.number().finite() }).strict()),
        outEase: z.array(z.object({ speed: z.number().finite(), influence: z.number().finite() }).strict()),
        nativeFrameIndex: z.number().int().nonnegative().optional(),
        nativeFrame: z.number().int().optional(),
      }).strict()).default([]),
    }).strict()).default([]),
    positionSource: templateLayerPositionSourceSchema.optional(),
    index: z.number().int().nonnegative(),
    visible: z.boolean(),
    visibilityReason: z.string().nullable(),
    textReason: z.string().nullable(),
    fontReason: z.string().nullable(),
    font: z.string().nullable(),
    fontSize: z.number().nullable(),
    position: z.tuple([z.number(), z.number()]).nullable(),
    rotation: z.number().nullable(),
    scale: z.tuple([z.number(), z.number()]).nullable(),
    opacity: z.number().nullable(),
    transformLocks: z.partialRecord(
      z.enum(['position', 'rotation', 'scale', 'opacity']),
      z.string(),
    ),
    capabilities: templateAuthoringCapabilitiesSchema,
    groupedCapabilities: templateAuthoringCapabilitiesSchema.optional(),
    maskReason: z.string().nullable().default('authoring_mask_preflight_pending'),
    /** Geometry from the pinned parser; its coordinates may be local to a shape path. */
    maskSourceGeometry: templateMaskSourceGeometrySchema.nullable().optional(),
    /** Writer-coordinate compatibility is independent from the parser's verified affine. */
    maskGeometryReason: z.string().nullable().default('authoring_mask_source_geometry_pending'),
    masks: z.array(z.object({
      draftMaskId: uuid,
      name: z.string().min(1),
      shape: z.enum(['rectangle', 'ellipse']),
      center: z.tuple([z.number().finite(), z.number().finite()]),
      size: z.tuple([z.number().finite().positive(), z.number().finite().positive()]),
      mode: z.enum(['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference']),
      opacity: z.number().finite().min(0).max(100),
      feather: z.tuple([z.number().finite().min(0), z.number().finite().min(0)]),
    }).strict()).default([]),
    duplicateReason: z.string().nullable(),
    deleteReason: z.string().nullable(),
    /** Null only when the pinned Rust/Python grouping preflight positively joined this node. */
    groupingReason: z.string().nullable().default('authoring_grouping_eligibility_unavailable'),
    /** Null only after direct-child translation safety is positively checked. Missing means unverified. */
    ungroupTranslationReason: z.string().nullable().optional(),
    /** Unsupported effects/expressions are preserved by the referenced immutable source package. */
    opaqueSourceRef: z
      .object({
        versionId: uuid.nullable(),
        checksum: sha256,
        workspacePackage: templateAuthoringWorkspacePackageSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((node, ctx) => {
    if (node.capabilities.timing && node.timingReason !== null)
      ctx.addIssue({ code: 'custom', message: 'timing capability requires an affirmative native preflight', path: ['timingReason'] });
    if (node.capabilities.keyframes && !node.keyframeChannels.some((channel) => channel.reason === null))
      ctx.addIssue({ code: 'custom', message: 'keyframe capability requires an affirmative channel preflight', path: ['keyframeChannels'] });
    const authoredShapeGeometry = node.maskSourceGeometry?.status === 'authored' &&
      `draft:${node.maskSourceGeometry.draftNodeId}` === node.nodeId && node.kind === 'shape' && node.sourceRef === null &&
      node.maskSourceGeometry.workspaceChecksum.toLowerCase() ===
        (node.opaqueSourceRef.workspacePackage?.packageChecksum ?? node.opaqueSourceRef.checksum).toLowerCase() &&
      node.maskSourceGeometry.bounds.width === node.size?.[0] && node.maskSourceGeometry.bounds.height === node.size?.[1];
    if (node.capabilities.masks && (node.maskReason !== null || node.maskGeometryReason !== null ||
      !(node.maskSourceGeometry?.status === 'verified' &&
        (node.maskSourceGeometry.sourceKind === 'shape-path' || node.maskSourceGeometry.sourceKind === 'footage') || authoredShapeGeometry)))
      ctx.addIssue({ code: 'custom', message: 'mask capability requires affirmative writer preflight and verified source-space geometry', path: ['maskSourceGeometry'] });
    if (node.maskSourceGeometry?.status === 'authored' && !authoredShapeGeometry)
      ctx.addIssue({ code: 'custom', message: 'authored mask geometry must bind to this fresh shape and workspace package', path: ['maskSourceGeometry'] });
  });
export type TemplateAuthoringNode = z.infer<typeof templateAuthoringNodeSchema>;

/** Immutable source-version metadata; command replay does not change this baseline. */
export const templateAuthoringSourceContextSchema = z.object({
  artifactId: uuid,
  versionId: uuid,
  packageChecksum: sha256,
  identityMap: z.array(templateAuthoringGroupIdentityMapEntrySchema),
  freshArtboardReceipts: z.array(templateAuthoringFreshArtboardReceiptSchema),
}).strict().superRefine((context, ctx) => {
  if (new Set(context.identityMap.map((entry) => entry.nodeId)).size !== context.identityMap.length ||
      new Set(context.identityMap.map((entry) => `${entry.compId}:${entry.persistedUid}`)).size !== context.identityMap.length)
    ctx.addIssue({ code: 'custom', path: ['identityMap'], message: 'source authoring identities must be unique' });
  if (new Set(context.freshArtboardReceipts.map((receipt) => receipt.compId)).size !== context.freshArtboardReceipts.length)
    ctx.addIssue({ code: 'custom', path: ['freshArtboardReceipts'], message: 'source artboard receipts must be unique by composition' });
});
export type TemplateAuthoringSourceContext = z.infer<typeof templateAuthoringSourceContextSchema>;

export const templateAuthoringDocumentSchema = z
  .object({
    scope: templateAuthoringScopeSchema,
    sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    sourceHeadVersionId: uuid,
    sourceAuthoringContext: templateAuthoringSourceContextSchema.optional(),
    readiness: z.enum(['ready', 'warning', 'pending', 'blocked']),
    diagnostics: z.array(templateAuthoringDiagnosticSchema),
    exposureKeys: z.array(z.string().min(1)),
    fontChoices: z.array(z.union([
      repositoryFontRefSchema.extend({ scope: z.enum(['brand', 'house']) }).strict(),
      workspacePackageFontRefSchema.extend({ scope: z.literal('workspace_package') }).strict(),
    ])),
    dependencies: z.array(z.object({
      footageItemId: nativeCompId,
      name: z.string().nullable(),
      mediaCode: z.string().nullable(),
      footageFramerate: z.number().finite().nullable(),
      originalFile: z.string().nullable(),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      affectedLayers: z.array(z.object({ compId: nativeCompId, layerUid: nativeCompId }).strict()),
      relinkReason: z.string().nullable(),
    }).strict()).default([]),
    compositions: z.array(
      z
        .object({
          compId: nativeCompId.nullable(),
          artboardId: uuid.nullable().default(null),
          sourceCompId: nativeCompId.nullable().default(null),
          sourceArtboardId: uuid.nullable().default(null),
          name: z.string().nullable(),
          width: z.number().nullable(),
          height: z.number().nullable(),
          frameRate: z.number().nullable(),
          durationSec: z.number().nullable(),
          clock: z.record(z.string(), z.unknown()),
          parentCompIds: z.array(z.number().int()),
          orderReason: z.string().nullable(),
          creationReason: z.string().nullable(),
          shapeCreationReason: z.string().nullable(),
          artboardReason: z.string().nullable().default('authoring_artboard_preflight_pending'),
          nodeIds: z.array(z.string()),
        })
        .strict(),
    ),
    nodes: z.array(templateAuthoringNodeSchema),
    workspacePackage: templateAuthoringWorkspacePackageSchema.optional(),
    opaqueSourceRef: z
      .object({
        versionId: uuid,
        checksum: z.string().regex(/^[a-f0-9]{64}$/i),
        authority: z.literal('pinned-source-package'),
      })
      .strict(),
  })
  .strict()
  .superRefine((document, ctx) => {
    const sourceContext = document.sourceAuthoringContext;
    if (sourceContext && (sourceContext.versionId !== document.scope.baseVersionId ||
        sourceContext.versionId !== document.sourceHeadVersionId ||
        sourceContext.packageChecksum.toLowerCase() !== document.sourceChecksum.toLowerCase() ||
        (document.workspacePackage !== undefined && (document.workspacePackage.kind !== 'pinned_source' ||
          document.workspacePackage.packageChecksum.toLowerCase() !== sourceContext.packageChecksum.toLowerCase()))))
      ctx.addIssue({ code: 'custom', path: ['sourceAuthoringContext'], message: 'source authoring context must match the exact immutable version and package checksum' });
    const workspacePackage = document.workspacePackage ?? {
      kind: 'pinned_source' as const,
      packageChecksum: document.sourceChecksum,
    };
    document.nodes.forEach((node, index) => {
      const geometry = node.maskSourceGeometry;
      if (!geometry) return;
      if (geometry.status === 'authored') {
        if (geometry.workspaceChecksum.toLowerCase() !== workspacePackage.packageChecksum.toLowerCase())
          ctx.addIssue({ code: 'custom', message: 'authored mask geometry package pin must match the workspace package', path: ['nodes', index, 'maskSourceGeometry', 'workspaceChecksum'] });
        if (node.kind !== 'shape' || node.sourceRef !== null || `draft:${geometry.draftNodeId}` !== node.nodeId ||
            geometry.bounds.width !== node.size?.[0] || geometry.bounds.height !== node.size?.[1])
          ctx.addIssue({ code: 'custom', message: 'authored mask geometry must join this fresh shape identity', path: ['nodes', index, 'maskSourceGeometry'] });
      } else {
        if (geometry.packageSha256.toLowerCase() !== workspacePackage.packageChecksum.toLowerCase())
          ctx.addIssue({ code: 'custom', message: 'mask source geometry package pin must match the workspace package', path: ['nodes', index, 'maskSourceGeometry', 'packageSha256'] });
        if (!node.sourceRef || geometry.compId !== node.sourceRef.compId || geometry.layerUid !== node.sourceRef.layerId)
          ctx.addIssue({ code: 'custom', message: 'mask source geometry must join the exact native node identity', path: ['nodes', index, 'maskSourceGeometry'] });
      }
    });
  })
  .transform((document) => ({
    ...document,
    workspacePackage: document.workspacePackage ?? {
      kind: 'pinned_source' as const,
      packageChecksum: document.sourceChecksum,
    },
  }));
export type TemplateAuthoringDocument = z.infer<typeof templateAuthoringDocumentSchema>;

export const templateAuthoringDraftSchema = z
  .object({
    scope: templateAuthoringScopeSchema,
    sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    requiresReconciliation: z.boolean(),
    currentSource: templateAuthoringCurrentSourceSchema,
    revision: z.number().int().positive(),
    seed: templateAuthoringSeedSchema.nullable().default(null),
    commands: z.array(templateAuthoringCommandSchema).max(2048),
    projectedDocument: templateAuthoringDocumentSchema.nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type TemplateAuthoringDraft = z.infer<typeof templateAuthoringDraftSchema>;

export const templateAuthoringDraftPutSchema = z
  .object({
    brandId: uuid,
    baseVersionId: uuid,
    expectedRevision: z.number().int().nonnegative(),
    commands: z.array(templateAuthoringCommandSchema).max(2048),
  })
  .strict();
export type TemplateAuthoringDraftPut = z.infer<typeof templateAuthoringDraftPutSchema>;

export const templateAuthoringWorkspacePreviewResponseSchema = templateLayerPreviewResponseSchema.extend({
  artifactId: uuid,
  packageChecksum: sha256,
  draftRevision: z.number().int().positive(),
}).strict();
export type TemplateAuthoringWorkspacePreviewResponse = z.infer<typeof templateAuthoringWorkspacePreviewResponseSchema>;

/** Checks performed against the exact private package bytes. Pending means no native proof yet. */
export const templateAuthoringVerificationSchema = z
  .object({
    packageIntegrity: z.enum(['pending', 'passed', 'failed']),
    writerReadback: z.enum(['pending', 'passed', 'failed']),
    sourcePreservation: z.enum(['pending', 'passed', 'failed']),
    dependencies: z.enum(['pending', 'passed', 'failed']),
    format: z.enum(['pending', 'passed', 'failed']),
    nativeAfterEffects: z.enum(['pending', 'passed', 'failed']),
    status: z.enum(['pending', 'passed', 'failed']),
  })
  .strict();
export type TemplateAuthoringVerification = z.infer<typeof templateAuthoringVerificationSchema>;

/** Provenance for an authored package staged against an existing template draft. */
export const templateAuthoringPrivateSidecarSchema = z
  .object({
    objectPath: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export const templateAuthoringArtifactProvenanceSchema = z
  .object({
    workspaceSeed: z.object({
      artifactId: uuid,
      packageChecksum: sha256,
      sourceRevisionId: uuid,
      sourceHtmlSha256: sha256,
      extractedSceneSha256: sha256,
      sourceRetention: z.object({
        sourceHtml: templateAuthoringPrivateSidecarSchema,
        extractedSceneJson: templateAuthoringPrivateSidecarSchema,
      }).strict(),
    }).strict().optional(),
    sourceRevisionId: uuid.optional(),
    sourceHtmlSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    extractedSceneSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    targetTemplateAssetId: uuid.optional(),
    baseVersionId: uuid.optional(),
    sourceRetention: z
      .object({
        status: z.enum(['verified', 'unverified']),
        sourceHtml: templateAuthoringPrivateSidecarSchema,
        extractedSceneJson: templateAuthoringPrivateSidecarSchema,
      })
      .strict()
      .optional(),
    nodeMappings: z
      .array(
        z
          .object({
            draftNodeId,
            persistedUid: z.number().int().positive(),
            compId: z.number().int().positive(),
            sourceNodeId: nodeId.nullable().optional(),
            /** Native generated source item; present for a successfully compiled group null. */
            sourceUid: z.number().int().positive().optional(),
            groupMembers: z.array(templateAuthoringGroupMemberIdentitySchema).min(2).max(32).optional(),
          })
          .strict().superRefine((mapping, ctx) => {
            if (!mapping.groupMembers) return;
            if (mapping.sourceUid === undefined)
              ctx.addIssue({ code: 'custom', path: ['sourceUid'], message: 'group membership requires the generated native source UID' });
            if (new Set(mapping.groupMembers.map((member) => member.nodeId)).size !== mapping.groupMembers.length ||
                new Set(mapping.groupMembers.map((member) => member.persistedUid)).size !== mapping.groupMembers.length)
              ctx.addIssue({ code: 'custom', path: ['groupMembers'], message: 'group members must have unique node and native identities' });
            if (mapping.groupMembers.some((member) => member.parentUid !== mapping.persistedUid || member.persistedUid === mapping.persistedUid))
              ctx.addIssue({ code: 'custom', path: ['groupMembers'], message: 'group members must reference the exact generated parent without self-parenting' });
          }),
      )
      .optional(),
    freshArtboardReceipts: z.array(templateAuthoringFreshArtboardReceiptSchema).optional(),
    maskMappings: z.array(z.object({
      draftMaskId: uuid,
      /** Stable authored node that owns the receipt; optional only for older artifacts. */
      nodeId: nodeId.optional(),
      compId: z.number().int().positive(),
      layerUid: z.number().int().positive(),
      maskId: z.number().int().positive(),
      propertyIndex: z.number().int().nonnegative(),
    }).strict()).optional(),
    artboardMappings: z.array(z.object({
      artboardId: uuid,
      operation: z.enum(['artboard.create', 'artboard.duplicate']),
      sourceCompId: nativeCompId.nullable(),
      compId: nativeCompId,
      name: z.string().min(1),
      layerUidMap: z.array(z.object({
        sourceLayerUid: nativeCompId,
        layerUid: nativeCompId,
      }).strict()),
    }).strict()).optional(),
    keyframeMappings: z.array(z.object({
      draftKeyframeId: z.union([draftNodeId, templateAuthoringSourceKeyframeIdSchema]),
      channelId: z.string().min(1),
      nativeFrameIndex: z.number().int().nonnegative(),
      nativeFrame: z.number().int(),
      timeSec: z.number().finite(),
    }).strict()).optional(),
    dependencyMappings: z.array(z.object({
      footageItemId: nativeCompId,
      assetId: uuid,
      versionId: uuid,
      assetSha256: sha256,
      originalFile: z.string().min(1),
      relativeFile: z.string().min(1),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      affectedLayers: z.array(z.object({ compId: nativeCompId, layerUid: nativeCompId }).strict()),
    }).strict()).optional(),
  })
  .strict();
export type TemplateAuthoringArtifactProvenance = z.infer<
  typeof templateAuthoringArtifactProvenanceSchema
>;

export const templateAuthoringSaveTargetSchema = z.enum(['new_variant', 'this_variant']);
export type TemplateAuthoringSaveTarget = z.infer<typeof templateAuthoringSaveTargetSchema>;

export const templateAuthoringArtifactSchema = z
  .object({
    artifactId: uuid,
    scope: templateAuthoringScopeSchema,
    draftRevision: z.number().int().positive(),
    sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    commandDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    packageChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    purpose: z.enum(['workspace_seed', 'compiled_output']).default('compiled_output'),
    filename: z.string().min(1).max(255),
    sizeBytes: z.number().int().positive(),
    state: z.enum(['pending', 'reviewed', 'committing', 'prepared', 'committed', 'invalidated']),
    saveTarget: z.enum(['new_variant', 'this_variant']).nullable().optional(),
    variantName: z.string().nullable().optional(),
    verification: templateAuthoringVerificationSchema,
    provenance: templateAuthoringArtifactProvenanceSchema.optional(),
    createdAt: z.string().datetime(),
    reviewedAt: z.string().datetime().nullable(),
    commit: z
      .object({
        assetId: uuid,
        versionId: uuid,
        templateId: uuid,
        variantId: uuid,
        revisionId: uuid,
        packageChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type TemplateAuthoringArtifact = z.infer<typeof templateAuthoringArtifactSchema>;

export const templateAuthoringCompileRequestSchema = z
  .object({ brandId: uuid, baseVersionId: uuid, expectedRevision: z.number().int().positive() })
  .strict();
export type TemplateAuthoringCompileRequest = z.infer<typeof templateAuthoringCompileRequestSchema>;

export const templateAuthoringArtifactReviewSchema = z
  .object({
    artifactId: uuid,
    expectedDraftRevision: z.number().int().positive(),
    sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
    commandDigest: z.string().regex(/^[a-f0-9]{64}$/i),
    packageChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();
export type TemplateAuthoringArtifactReview = z.infer<typeof templateAuthoringArtifactReviewSchema>;

export const templateAuthoringArtifactCommitSchema = templateAuthoringArtifactReviewSchema
  .extend({
    saveTo: templateAuthoringSaveTargetSchema,
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((value) => value.saveTo !== 'new_variant' || Boolean(value.name), {
    message: 'Name the new variant',
    path: ['name'],
  });
export type TemplateAuthoringArtifactCommit = z.infer<typeof templateAuthoringArtifactCommitSchema>;
