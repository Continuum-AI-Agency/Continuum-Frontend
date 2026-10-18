import { z } from 'zod';
import { templateAuthoringFreshArtboardReceiptSchema } from './template-authoring-group';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const draftNode = z.string().regex(/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const aepNode = z.string().regex(/^aep:[1-9][0-9]*:[1-9][0-9]*$/);
const nodeId = z.union([draftNode, aepNode]);
const generatedGroupMemberIdentitySchema = z.object({
  nodeId,
  persistedUid: z.number().int().positive(),
  parentUid: z.number().int().positive(),
}).strict();

export const templateAuthoringIdentityMapEntrySchema = z.object({
  nodeId: draftNode,
  compId: z.number().int().positive(),
  persistedUid: z.number().int().positive(),
  /** Present only for a generated group and copied from its prior native receipt. */
  sourceUid: z.number().int().positive().optional(),
  /** Exact direct-child receipt for same-replay generated groups, used by nested ungroup. */
  members: z.array(generatedGroupMemberIdentitySchema).min(2).max(32).optional(),
}).strict().superRefine((entry, context) => {
  if (entry.members && entry.sourceUid === undefined)
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group members require the exact group source UID', path: ['sourceUid'] });
  if (entry.members?.some((member) => member.parentUid !== entry.persistedUid))
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group members must point to the exact mapped parent UID', path: ['members'] });
  if (entry.members && new Set(entry.members.map((member) => member.persistedUid)).size !== entry.members.length)
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group member UIDs must be unique', path: ['members'] });
});
export type TemplateAuthoringIdentityMapEntry = z.infer<typeof templateAuthoringIdentityMapEntrySchema>;

export const templateAuthoringLayerDuplicateOperationSchema = z.object({
  type: z.literal('layer.duplicate'),
  nodeId: draftNode,
  sourceNodeId: nodeId,
  name: z.string().trim().min(1).max(200).optional(),
}).strict();
export const templateAuthoringLayerDeleteOperationSchema = z.object({
  type: z.literal('layer.delete'),
  nodeId,
}).strict();
export const templateAuthoringLayerUngroupOperationSchema = z.object({
  type: z.literal('layer.ungroup'),
  nodeId: draftNode,
}).strict();
export const templateAuthoringLayerMutationOperationSchema = z.discriminatedUnion('type', [
  templateAuthoringLayerDuplicateOperationSchema,
  templateAuthoringLayerDeleteOperationSchema,
  templateAuthoringLayerUngroupOperationSchema,
]);
export type TemplateAuthoringLayerMutationOperation = z.infer<typeof templateAuthoringLayerMutationOperationSchema>;

export const templateAuthoringLayerMutationRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_layer_mutation/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  /** Receipts from earlier compiler steps, checked against this exact package before use. */
  identityMap: z.array(templateAuthoringIdentityMapEntrySchema).max(256).default([]),
  freshArtboardReceipt: templateAuthoringFreshArtboardReceiptSchema.optional(),
  operation: templateAuthoringLayerMutationOperationSchema,
}).strict().superRefine((request, context) => {
  if (request.operation.type !== 'layer.ungroup') return;
  const trusted = request.identityMap.find((entry) => entry.nodeId === request.operation.nodeId && entry.sourceUid !== undefined);
  if (!trusted) context.addIssue({ code: z.ZodIssueCode.custom, path: ['identityMap'], message: 'Ungroup requires the earlier generated group receipt including sourceUid.' });
  if (request.identityMap.some((entry) => entry.members !== undefined) &&
    (!request.freshArtboardReceipt || request.identityMap.some((entry) => entry.members !== undefined && entry.compId !== request.freshArtboardReceipt!.compId))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['freshArtboardReceipt'], message: 'Nested generated group ungroup requires the exact fresh artboard receipt for the same composition.' });
  }
});
export type TemplateAuthoringLayerMutationRequest = z.infer<typeof templateAuthoringLayerMutationRequestSchema>;

export const templateAuthoringLayerMutationResponseSchema = z.object({
  filename: z.string().min(1),
  sourceSha256: sha256,
  outputSha256: sha256,
  inlineBase64: z.string().min(1),
  mapping: z.object({
    nodeId: draftNode,
    persistedUid: z.number().int().positive(),
    compId: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    sourceNodeId: nodeId,
  }).strict().optional(),
  removed: z.object({
    nodeId,
    persistedUid: z.number().int().positive(),
    compId: z.number().int().positive(),
    removedIndex: z.number().int().nonnegative(),
  }).strict().optional(),
  ungrouped: z.object({
    nodeId: draftNode,
    persistedUid: z.number().int().positive(),
    compId: z.number().int().positive(),
    removedIndex: z.number().int().nonnegative(),
    sourceUid: z.number().int().positive(),
  }).strict().optional(),
  ungroupedMembers: z.array(z.object({
    nodeId: aepNode,
    persistedUid: z.number().int().positive(),
    compId: z.number().int().positive(),
    parentUid: z.null(),
  }).strict()).optional(),
  readback: z.object({
    operation: z.enum(['layer.duplicate', 'layer.delete', 'layer.ungroup']),
    originalLayerCount: z.number().int().nonnegative(),
    outputLayerCount: z.number().int().nonnegative(),
    unchangedLayerPayloadCount: z.number().int().nonnegative().optional(),
    duplicatePayloadPreserved: z.boolean().optional(),
    groupRemoved: z.literal(true).optional(),
    removedSourceUid: z.number().int().positive().optional(),
    ungroupedChildCount: z.number().int().nonnegative().optional(),
    memberPayloadsChangedOnlyByParentAndStaticTransform: z.literal(true).optional(),
    memberPayloadsChangedOnlyByParentAndStaticPosition: z.literal(true).optional(),
    animationTranslation: z.object({
      kind: z.literal('constant_translation'),
      offset: z.tuple([z.number().finite(), z.number().finite()]),
      children: z.array(z.object({
        uid: z.number().int().positive(),
        positionKeys: z.array(z.object({
          frame: z.number().int(),
          time: z.number().finite(),
          value: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
        }).strict()).max(2000),
      }).strict()).min(2).max(32),
      positionKeyMetadataPreserved: z.literal(true),
      nonPositionTransformPayloadsPreserved: z.literal(true),
    }).strict().optional(),
    groupWasNull: z.literal(true).optional(),
    groupWasGuideLayer: z.boolean().optional(),
    groupOpacityDefault: z.literal(0).optional(),
    groupSourceKind: z.literal('SolidSource').optional(),
    children: z.array(z.object({
      uid: z.number().int().positive(),
      parentUid: z.null(),
      position: z.array(z.number().finite()).length(3),
      compId: z.number().int().positive(),
      changedPositionLeafPaths: z.array(z.string()),
      changedTransformLeafPaths: z.array(z.string()).optional(),
    }).strict()).optional(),
    changedItemPayloadIds: z.array(z.number().int().nonnegative()).optional(),
    allowedAggregateItemIds: z.array(z.number().int().nonnegative()).optional(),
  }).strict(),
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'),
    rustStatus: z.enum(['ready', 'warning']),
    unchangedPackageDependencies: z.literal(true),
    pythonSaveReopen: z.literal(true),
    sourceGraphPreservedOutsideOperation: z.literal(true),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
  }).strict(),
}).strict().superRefine((response, context) => {
  const { readback } = response;
  const translation = readback.animationTranslation;
  if (readback.operation === 'layer.ungroup' && readback.memberPayloadsChangedOnlyByParentAndStaticTransform !== true && !translation)
    context.addIssue({ code: 'custom', path: ['readback'], message: 'ungroup requires exact static-transform or animated-translation preservation proof' });
  if (translation) {
    if (readback.operation !== 'layer.ungroup' || readback.memberPayloadsChangedOnlyByParentAndStaticTransform || readback.memberPayloadsChangedOnlyByParentAndStaticPosition)
      context.addIssue({ code: 'custom', path: ['readback', 'animationTranslation'], message: 'animated translation must use its own ungroup preservation proof' });
    if (!response.ungrouped || readback.groupRemoved !== true || readback.removedSourceUid !== response.ungrouped.sourceUid ||
        readback.originalLayerCount !== readback.outputLayerCount + 1 ||
        response.ungroupedMembers?.some((member) => member.compId !== response.ungrouped!.compId) ||
        readback.children?.some((child) => child.compId !== response.ungrouped!.compId))
      context.addIssue({ code: 'custom', path: ['readback', 'animationTranslation'], message: 'animated translation requires a consistent group, source and composition removal receipt' });
    const uids = translation.children.map((child) => child.uid);
    const members = response.ungroupedMembers?.map((child) => child.persistedUid) ?? [];
    const children = readback.children?.map((child) => child.uid) ?? [];
    const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
    if (new Set(uids).size !== uids.length || readback.ungroupedChildCount !== uids.length ||
        JSON.stringify(sorted(uids)) !== JSON.stringify(sorted(members)) || JSON.stringify(sorted(uids)) !== JSON.stringify(sorted(children)))
      context.addIssue({ code: 'custom', path: ['readback', 'animationTranslation', 'children'], message: 'animated translation proof must identify exactly the ungrouped direct children' });
    for (const child of translation.children) {
      if (child.positionKeys.some((key, index) => index > 0 &&
          (key.frame <= child.positionKeys[index - 1]!.frame || key.time <= child.positionKeys[index - 1]!.time)))
        context.addIssue({ code: 'custom', path: ['readback', 'animationTranslation', 'children'], message: 'position keys must retain unique ordered native frames and times' });
    }
  }
});
export type TemplateAuthoringLayerMutationResponse = z.infer<typeof templateAuthoringLayerMutationResponseSchema>;
