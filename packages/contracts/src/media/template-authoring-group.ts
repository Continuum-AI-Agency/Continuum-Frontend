import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const uuid = z.string().uuid();
const stableNodeId = z.union([
  z.string().regex(/^aep:[1-9][0-9]*:[1-9][0-9]*$/i),
  z.string().regex(/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
]);

export const templateAuthoringGroupMemberIdentitySchema = z.object({
  nodeId: stableNodeId,
  persistedUid: z.number().int().positive(),
  parentUid: z.number().int().positive(),
}).strict();
export const templateAuthoringGroupIdentityMapEntrySchema = z.object({
  nodeId: z.string().regex(/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  compId: z.number().int().positive(),
  persistedUid: z.number().int().positive(),
  sourceUid: z.number().int().positive().optional(),
  members: z.array(templateAuthoringGroupMemberIdentitySchema).min(2).max(32).optional(),
}).strict().superRefine((entry, context) => {
  if (entry.members && entry.sourceUid === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group members require the exact group source UID', path: ['sourceUid'] });
  }
  if (entry.members && new Set(entry.members.map((member) => member.nodeId)).size !== entry.members.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group member node IDs must be unique', path: ['members'] });
  }
  if (entry.members && new Set(entry.members.map((member) => member.persistedUid)).size !== entry.members.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group member UIDs must be unique', path: ['members'] });
  }
  if (entry.members?.some((member) => member.parentUid !== entry.persistedUid)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group members must point to the exact mapped parent UID', path: ['members'] });
  }
});
export type TemplateAuthoringGroupIdentityMapEntry = z.infer<typeof templateAuthoringGroupIdentityMapEntrySchema>;

export const templateAuthoringGroupCreateOperationSchema = z.object({
  type: z.literal('layer.group'), draftNodeId: uuid, compId: z.number().int().positive(), name: z.string().trim().min(1).max(200),
  memberNodeIds: z.array(stableNodeId).min(2).max(32).refine((ids) => new Set(ids).size === ids.length, 'member node IDs must be unique'),
}).strict();
export type TemplateAuthoringGroupCreateOperation = z.infer<typeof templateAuthoringGroupCreateOperationSchema>;

export const templateAuthoringFreshArtboardReceiptSchema = z.object({
  compId: z.number().int().positive(), sourceCompId: z.null(), name: z.string().min(1),
  width: z.number().int().min(4).max(30_000), height: z.number().int().min(4).max(30_000),
  frameRate: z.number().finite().positive(), durationSec: z.number().finite().positive(),
  layerUidMap: z.array(z.never()),
}).strict();
export type TemplateAuthoringFreshArtboardReceipt = z.infer<typeof templateAuthoringFreshArtboardReceiptSchema>;

export const templateAuthoringGroupCreateRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_group_create/v1'), filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i), sourceSha256: sha256, inlineBase64: z.string().min(1),
  identityMap: z.array(templateAuthoringGroupIdentityMapEntrySchema).max(256),
  freshArtboardReceipt: templateAuthoringFreshArtboardReceiptSchema.optional(),
  operation: templateAuthoringGroupCreateOperationSchema,
}).strict().superRefine((request, context) => {
  const nesting = request.identityMap.some((entry) => entry.members !== undefined);
  if (nesting && (!request.freshArtboardReceipt || request.freshArtboardReceipt.compId !== request.operation.compId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated group nesting requires an exact fresh artboard receipt for the target composition', path: ['freshArtboardReceipt'] });
  }
});
export type TemplateAuthoringGroupCreateRequest = z.infer<typeof templateAuthoringGroupCreateRequestSchema>;


const vector3 = z.array(z.number().finite()).length(3);
const memberReadback = z.object({ uid: z.number().int().positive(), parentUid: z.number().int().positive(), position: vector3, scale: vector3,
  rotation: z.number().finite(), inSec: z.number().finite(), outSec: z.number().finite() }).strict();
export const templateAuthoringGroupReadbackSchema = z.object({ name: z.string(), position: vector3, scale: vector3, rotation: z.number().finite(),
  inSec: z.number().finite(), outSec: z.number().finite(), index: z.literal(0), isNull: z.literal(true), sourceUid: z.number().int().positive(),
  sourceCompositionId: z.null(), members: z.array(memberReadback).min(2).max(32) }).strict();

export const templateAuthoringGroupCreateResponseSchema = z.object({ filename: z.string().min(1), sourceSha256: sha256, outputSha256: sha256, inlineBase64: z.string().min(1),
  mapping: z.object({ draftNodeId: uuid, persistedUid: z.number().int().positive(), compId: z.number().int().positive(), index: z.literal(0), sourceUid: z.number().int().positive() }).strict(),
  members: z.array(z.object({ nodeId: stableNodeId, persistedUid: z.number().int().positive(), parentUid: z.number().int().positive() }).strict()).min(2).max(32),
  readback: templateAuthoringGroupReadbackSchema,
  proof: z.object({ rustAuthority: z.literal('aep2json-rust'), rustStatus: z.enum(['ready', 'warning']), originalLayerCount: z.number().int().nonnegative(), outputLayerCount: z.number().int().nonnegative(), newLayerCount: z.literal(1),
    sourceGraphPreservedOutsideDeclaredParentLinks: z.literal(true), existingSerializedLayerPayloadsPreserved: z.literal(true), memberPayloadsChangedOnlyByParentLink: z.literal(true), unchangedPackageDependencies: z.literal(true), rustAndPythonReadback: z.literal(true),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict() }).strict(),
}).strict();
export type TemplateAuthoringGroupCreateResponse = z.infer<typeof templateAuthoringGroupCreateResponseSchema>;
