import { z } from 'zod';
import { templateAuthoringFreshArtboardReceiptSchema, templateAuthoringGroupIdentityMapEntrySchema } from './template-authoring-group';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const draftKeyframeId = z.string().regex(/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
/** Stable source identity from the pinned checksum, channel ID, and native array index. */
export const templateAuthoringSourceKeyframeIdSchema = z.string().regex(/^source:[a-f0-9]{64}:aep:[1-9]\d*:[1-9]\d*:ADBE (Position|Scale|Rotate Z|Opacity):\d+$/i);
const channel = z.enum(['position', 'scale', 'rotation', 'opacity']);
const interpolation = z.enum(['LINEAR', 'BEZIER', 'HOLD']);
const ease = z.array(z.object({ speed: z.number().finite(), influence: z.number().min(0.1).max(100) }).strict()).min(1).max(3);
const vector = z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]);
const keyframe = z.object({
  keyframeId: draftKeyframeId,
  timeSec: z.number().finite().min(-10_800).max(100_000),
  value: z.union([z.number().finite().min(-100_000).max(100_000), vector]),
  inInterpolation: interpolation,
  outInterpolation: interpolation,
  inEase: ease.optional(),
  outEase: ease.optional(),
}).strict();

export const templateAuthoringKeyframesOperationSchema = z.object({
  type: z.literal('layer.keyframes.replace'),
  compId: z.number().int().positive(),
  layerUid: z.number().int().positive(),
  channel,
  keyframes: z.array(keyframe).max(2000),
}).strict().superRefine((value, ctx) => {
  const ids = new Set(value.keyframes.map((item) => item.keyframeId));
  if (ids.size !== value.keyframes.length) ctx.addIssue({ code: 'custom', message: 'keyframe IDs must be unique', path: ['keyframes'] });
  for (const [index, item] of value.keyframes.entries()) {
    if ((item.inEase && item.inInterpolation !== 'BEZIER') || (item.outEase && item.outInterpolation !== 'BEZIER')) {
      ctx.addIssue({ code: 'custom', message: 'temporal ease requires BEZIER interpolation', path: ['keyframes', index] });
    }
    if (value.channel === 'position' || value.channel === 'scale') {
      if (!Array.isArray(item.value) || item.value.length !== 3) ctx.addIssue({ code: 'custom', message: `${value.channel} requires a three component value`, path: ['keyframes', index, 'value'] });
    } else if (Array.isArray(item.value)) {
      ctx.addIssue({ code: 'custom', message: `${value.channel} requires a scalar value`, path: ['keyframes', index, 'value'] });
    }
    if (value.channel === 'opacity' && typeof item.value === 'number' && (item.value < 0 || item.value > 100)) {
      ctx.addIssue({ code: 'custom', message: 'opacity must be within 0..100', path: ['keyframes', index, 'value'] });
    }
  }
});
export type TemplateAuthoringKeyframesOperation = z.infer<typeof templateAuthoringKeyframesOperationSchema>;

export const templateAuthoringKeyframesRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_layer_keyframes/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  identityMap: z.array(templateAuthoringGroupIdentityMapEntrySchema).max(256).optional(),
  freshArtboardReceipt: templateAuthoringFreshArtboardReceiptSchema.optional(),
  operation: templateAuthoringKeyframesOperationSchema,
}).strict().superRefine((request, context) => {
  const hasIdentityMap = request.identityMap !== undefined;
  const hasFreshReceipt = request.freshArtboardReceipt !== undefined;
  if (hasIdentityMap !== hasFreshReceipt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated authoring context requires both exact identity map and fresh artboard receipt', path: [hasIdentityMap ? 'freshArtboardReceipt' : 'identityMap'] });
  }
  if (request.freshArtboardReceipt && request.freshArtboardReceipt.compId !== request.operation.compId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'fresh artboard receipt must target the keyframe operation composition', path: ['freshArtboardReceipt', 'compId'] });
  }
  if (request.identityMap?.some((entry) => entry.compId !== request.operation.compId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated identity map entries must target the keyframe operation composition', path: ['identityMap'] });
  }
  if (request.identityMap?.some((entry) => entry.members !== undefined) && !hasFreshReceipt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'nested generated groups require a fresh artboard receipt', path: ['freshArtboardReceipt'] });
  }
});
export type TemplateAuthoringKeyframesRequest = z.infer<typeof templateAuthoringKeyframesRequestSchema>;

const temporalEaseReadback = z.array(z.object({ speed: z.number().finite(), influence: z.number().finite().min(0).max(100) }).strict()).max(3);
const keyframeReceipt = z.object({
  keyframeId: draftKeyframeId,
  nativeFrameIndex: z.number().int().nonnegative(),
  nativeFrame: z.number().int(),
  timeSec: z.number().finite(),
  value: z.union([z.number().finite(), z.array(z.number().finite()).min(1).max(3)]),
  inInterpolation: interpolation,
  outInterpolation: interpolation,
  inEase: temporalEaseReadback,
  outEase: temporalEaseReadback,
}).strict();

export const templateAuthoringKeyframesResponseSchema = z.object({
  filename: z.string().min(1),
  sourceSha256: sha256,
  outputSha256: sha256,
  inlineBase64: z.string().min(1),
  mapping: z.array(z.object({ draftKeyframeId, channelId: z.string().min(1), nativeFrameIndex: z.number().int().nonnegative(), nativeFrame: z.number().int(), timeSec: z.number().finite() }).strict()).max(2000),
  readback: z.object({ compId: z.number().int().positive(), layerUid: z.number().int().positive(), channelId: z.string().min(1), channel, frameRate: z.number().positive(), keyframes: z.array(keyframeReceipt).max(2000) }).strict(),
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'),
    rustStatus: z.enum(['ready', 'warning']),
    pythonSaveReopen: z.literal(true),
    targetChannelChunkExact: z.literal(true),
    unchangedTargetTopLevelChunkCount: z.number().int().nonnegative(),
    unchangedTransformSiblingChunkCount: z.number().int().nonnegative(),
    targetPropertyChunkPathBefore: z.array(z.number().int().nonnegative()).min(3),
    targetPropertyChunkPathAfter: z.array(z.number().int().nonnegative()).min(3),
    unchangedUnrelatedLayerCount: z.number().int().nonnegative(),
    dependenciesAndEssentialPropertiesPreserved: z.literal(true),
    generatedGroupReceiptVerified: z.boolean(),
    generatedChildReceiptVerified: z.boolean().optional(),
    generatedGroupOpacityLocked: z.literal(true).optional(),
    generatedGroupTransformChannels: z.tuple([z.literal('position'), z.literal('scale'), z.literal('rotation')]).optional(),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
  }).strict().superRefine((proof, context) => {
    if (proof.generatedChildReceiptVerified === true && (proof.generatedGroupReceiptVerified !== true ||
        proof.generatedGroupOpacityLocked !== undefined || proof.generatedGroupTransformChannels !== undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated-child proof requires its parent receipt and excludes group-only locks', path: ['generatedChildReceiptVerified'] });
    }
    if ((proof.generatedGroupOpacityLocked !== undefined || proof.generatedGroupTransformChannels !== undefined) &&
        proof.generatedGroupReceiptVerified !== true) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated-group boundary proof requires a verified generated-group receipt', path: ['generatedGroupReceiptVerified'] });
    }
    if ((proof.generatedGroupOpacityLocked === true) !== (proof.generatedGroupTransformChannels !== undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated-group opacity lock and transform channel list must be paired', path: ['generatedGroupOpacityLocked'] });
    }
  }),
}).strict();
export type TemplateAuthoringKeyframesResponse = z.infer<typeof templateAuthoringKeyframesResponseSchema>;

const keyframeChannelReasons = z.object({ position: z.string().min(1).nullable(), scale: z.string().min(1).nullable(),
  rotation: z.string().min(1).nullable(), opacity: z.string().min(1).nullable() }).strict();
const nativeTrackKeyframe = z.object({
  nativeFrameIndex: z.number().int().nonnegative(),
  nativeFrame: z.number().int(),
  /** Native fixed-point-clock seconds are preserved alongside Rust frame-clock seconds. */
  nativeTimeSec: z.number().finite().optional(),
  timeSec: z.number().finite(),
  value: z.union([z.number().finite(), z.array(z.number().finite()).min(1).max(3)]),
  inInterpolation: interpolation,
  outInterpolation: interpolation,
  inEase: temporalEaseReadback,
  outEase: temporalEaseReadback,
}).strict();
const nativeChannelInventory = z.object({
  channelId: z.string().min(1),
  matchName: z.string().min(1),
  frameRate: z.number().positive(),
  dimensions: z.number().int().positive().nullable(),
  separated: z.boolean().nullable(),
  /** Current static native value for an eligible unkeyed channel; keeps vector Z exact. */
  baseValue: z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])]).nullable().optional(),
  /** Property preflight/value stay separate from a parent-only structural editing lock. */
  propertyReason: z.string().nullable().optional(),
  propertyBaseValue: z.union([z.number().finite(), z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])]).nullable().optional(),
  keyframes: z.array(nativeTrackKeyframe),
}).strict();

/** Missing is pending; null for a channel means its exact native writer preflight passed. */
export const templateAuthoringKeyframesReasonSchema = keyframeChannelReasons.optional();
/** Missing inventory is pending; rows contain native frame positions, never fabricated keyframe UIDs. */
export const templateAuthoringKeyframesInventorySchema = z.object({
  keyframeReasons: keyframeChannelReasons,
  keyframeChannels: z.object({ position: nativeChannelInventory.optional(), scale: nativeChannelInventory.optional(),
    rotation: nativeChannelInventory.optional(), opacity: nativeChannelInventory.optional() }).strict(),
}).strict().optional();
