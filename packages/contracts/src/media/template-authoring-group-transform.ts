import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const uuid = z.string().uuid();
const draftNode = z.string().regex(/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const stableNode = z.union([
  z.string().regex(/^aep:[1-9][0-9]*:[1-9][0-9]*$/i),
  draftNode,
]);
const nativeUid = z.number().int().positive();
const vector2 = z.array(z.number().finite()).length(2);
const vector3 = z.array(z.number().finite()).length(3);

export const templateAuthoringGroupTransformRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_group_transform/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  receipt: z.object({
    mapping: z.object({ draftNodeId: uuid, persistedUid: nativeUid, compId: nativeUid, index: z.literal(0), sourceUid: nativeUid }).strict(),
    members: z.array(z.object({ nodeId: stableNode, persistedUid: nativeUid, parentUid: nativeUid }).strict()).min(2).max(32),
  }).strict(),
  operation: z.object({
    type: z.literal('layer.group.transform'),
    nodeId: draftNode,
    compId: nativeUid,
    transform: z.object({
      position: vector2.optional(),
      scale: vector2.refine((value) => value.every((n) => n > 0 && n <= 10_000), 'scale values must be in (0,10000]').optional(),
      rotation: z.number().finite().refine((n) => Math.abs(n) <= 36_000, 'rotation must be within +/-36000 degrees').optional(),
    }).strict().refine((transform) => Object.keys(transform).length > 0, 'set at least one transform field'),
  }).strict(),
}).strict().superRefine((request, context) => {
  if (request.operation.nodeId !== `draft:${request.receipt.mapping.draftNodeId}`) {
    context.addIssue({ code: 'custom', path: ['operation', 'nodeId'], message: 'operation node must match the prior group receipt draft ID' });
  }
  if (request.operation.compId !== request.receipt.mapping.compId) {
    context.addIssue({ code: 'custom', path: ['operation', 'compId'], message: 'operation composition must match the prior group receipt' });
  }
  const memberUids = new Set<number>();
  request.receipt.members.forEach((member, index) => {
    if (member.parentUid !== request.receipt.mapping.persistedUid) {
      context.addIssue({ code: 'custom', path: ['receipt', 'members', index, 'parentUid'], message: 'member must be parented to the receipt group UID' });
    }
    if (memberUids.has(member.persistedUid)) {
      context.addIssue({ code: 'custom', path: ['receipt', 'members', index, 'persistedUid'], message: 'member native UIDs must be distinct' });
    }
    memberUids.add(member.persistedUid);
  });
});
export type TemplateAuthoringGroupTransformRequest = z.infer<typeof templateAuthoringGroupTransformRequestSchema>;

export const templateAuthoringGroupTransformResponseSchema = z.object({
  filename: z.string().min(1),
  sourceSha256: sha256,
  outputSha256: sha256,
  inlineBase64: z.string().min(1),
  mapping: z.object({ draftNodeId: uuid, persistedUid: nativeUid, compId: nativeUid, index: z.literal(0), sourceUid: nativeUid }).strict(),
  members: z.array(z.object({ nodeId: stableNode, persistedUid: nativeUid, parentUid: nativeUid }).strict()).min(2).max(32),
  readback: z.object({ position: vector3, scale: vector3, rotation: z.number().finite(), index: z.literal(0), memberUids: z.array(nativeUid).min(2).max(32) }).strict(),
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'),
    rustStatus: z.enum(['ready', 'warning']),
    exactPriorReceiptMatched: z.literal(true),
    childAndUnrelatedLayerPayloadsPreserved: z.literal(true),
    unchangedPackageDependencies: z.literal(true),
    rustAndPythonReadback: z.literal(true),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
  }).strict(),
}).strict();
export type TemplateAuthoringGroupTransformResponse = z.infer<typeof templateAuthoringGroupTransformResponseSchema>;
