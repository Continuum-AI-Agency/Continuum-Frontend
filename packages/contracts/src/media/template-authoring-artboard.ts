import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const dimensions = z.number().int().min(4).max(30_000);
const uuid = z.string().uuid();

export const templateAuthoringArtboardCreateOperationSchema = z.object({
  type: z.literal('artboard.create'),
  name: z.string().trim().min(1).max(180),
  width: dimensions,
  height: dimensions,
  frameRate: z.number().finite().min(1).max(99),
  durationSec: z.number().finite().min(1 / 99).max(10_800),
}).strict();
export type TemplateAuthoringArtboardCreateOperation = z.infer<typeof templateAuthoringArtboardCreateOperationSchema>;

export const templateAuthoringArtboardDuplicateOperationSchema = z.object({
  type: z.literal('artboard.duplicate'),
  sourceCompId: z.number().int().positive(),
  name: z.string().trim().min(1).max(180),
}).strict();
export type TemplateAuthoringArtboardDuplicateOperation = z.infer<typeof templateAuthoringArtboardDuplicateOperationSchema>;

const authoredArtboardRequest = z.object({
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
});
export const templateAuthoringArtboardCreateRequestSchema = authoredArtboardRequest.extend({
  schema: z.literal('forge_template_authoring_artboard_create/v1'),
  operation: templateAuthoringArtboardCreateOperationSchema,
}).strict();
export type TemplateAuthoringArtboardCreateRequest = z.infer<typeof templateAuthoringArtboardCreateRequestSchema>;

export const templateAuthoringArtboardDuplicateRequestSchema = authoredArtboardRequest.extend({
  schema: z.literal('forge_template_authoring_artboard_duplicate/v1'),
  operation: templateAuthoringArtboardDuplicateOperationSchema,
}).strict();
export type TemplateAuthoringArtboardDuplicateRequest = z.infer<typeof templateAuthoringArtboardDuplicateRequestSchema>;

const authoredArtboardLayerMap = z.array(z.object({
  sourceLayerUid: z.number().int().positive(),
  layerUid: z.number().int().positive(),
}).strict());
const authoredArtboardProof = z.object({
  rustAuthority: z.literal('aep2json-rust'),
  rustStatus: z.enum(['ready', 'warning']),
  singleNewComposition: z.literal(true),
  existingCompositionAndLayerPayloadsPreserved: z.literal(true),
  existingLayerPayloadsPreserved: z.literal(true),
  duplicateLayerChunksVerified: z.boolean(),
  dependenciesAndEssentialPropertiesPreserved: z.literal(true),
  allocatedNativeUidCount: z.number().int().positive(),
  completeNativeIdReferenceMapVerified: z.boolean(),
  nativeIdsFreshlyAllocated: z.literal(true),
  unchangedPackageDependencies: z.literal(true),
  pythonSaveReopen: z.literal(true),
  nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
}).strict();
const authoredArtboardShape = z.object({
  compId: z.number().int().positive(),
  sourceCompId: z.number().int().positive().nullable(),
  name: z.string().min(1),
  width: dimensions,
  height: dimensions,
  frameRate: z.number().finite().positive(),
  durationSec: z.number().finite().positive(),
  layerUidMap: authoredArtboardLayerMap,
}).strict();
const authoredArtboardReadback = authoredArtboardShape.extend({
  layerCount: z.number().int().nonnegative(),
}).strict();
export const templateAuthoringArtboardCreateResponseSchema = z.object({
  filename: z.string().min(1), sourceSha256: sha256, outputSha256: sha256, inlineBase64: z.string().min(1),
  operation: z.literal('artboard.create'),
  mapping: authoredArtboardShape.refine((value) => value.sourceCompId === null && value.layerUidMap.length === 0),
  readback: authoredArtboardReadback.refine((value) => value.sourceCompId === null && value.layerUidMap.length === 0),
  proof: authoredArtboardProof.refine((value) => !value.duplicateLayerChunksVerified && !value.completeNativeIdReferenceMapVerified),
}).strict();
export type TemplateAuthoringArtboardCreateResponse = z.infer<typeof templateAuthoringArtboardCreateResponseSchema>;

export const templateAuthoringArtboardDuplicateResponseSchema = z.object({
  filename: z.string().min(1), sourceSha256: sha256, outputSha256: sha256, inlineBase64: z.string().min(1),
  operation: z.literal('artboard.duplicate'),
  mapping: authoredArtboardShape.refine((value) => value.sourceCompId !== null),
  readback: authoredArtboardReadback.refine((value) => value.sourceCompId !== null),
  proof: authoredArtboardProof.refine((value) => value.duplicateLayerChunksVerified && value.completeNativeIdReferenceMapVerified),
}).strict();
export type TemplateAuthoringArtboardDuplicateResponse = z.infer<typeof templateAuthoringArtboardDuplicateResponseSchema>;

export const templateAuthoringArtboardResizeOperationSchema = z.object({
  type: z.literal('artboard.resize'),
  compId: z.number().int().positive(),
  width: dimensions,
  height: dimensions,
}).strict();
export type TemplateAuthoringArtboardResizeOperation = z.infer<typeof templateAuthoringArtboardResizeOperationSchema>;

export const templateAuthoringArtboardResizeRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_artboard_resize/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  operation: templateAuthoringArtboardResizeOperationSchema,
}).strict();
export type TemplateAuthoringArtboardResizeRequest = z.infer<typeof templateAuthoringArtboardResizeRequestSchema>;

const dimensionsReadback = z.object({ width: dimensions, height: dimensions }).strict();
export const templateAuthoringArtboardResizeResponseSchema = z.object({
  filename: z.string().min(1),
  sourceSha256: sha256,
  outputSha256: sha256,
  inlineBase64: z.string().min(1),
  mapping: z.object({ compId: z.number().int().positive(), width: dimensions, height: dimensions }).strict(),
  readback: z.object({
    compId: z.number().int().positive(),
    previous: dimensionsReadback,
    width: dimensions,
    height: dimensions,
    frameRate: z.number().finite().positive(),
    durationSec: z.number().finite().positive(),
    layerCount: z.number().int().nonnegative(),
  }).strict(),
  affectedCompositionRefs: z.array(z.object({
    compId: z.number().int().positive(),
    layerUid: z.number().int().positive(),
    sourceCompositionId: z.number().int().positive(),
  }).strict()),
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'),
    rustStatus: z.enum(['ready', 'warning']),
    exactTargetDimensionsOnly: z.literal(true),
    existingLayerPayloadsPreserved: z.literal(true),
    otherCompositionFieldsPreserved: z.literal(true),
    dependenciesAndEssentialPropertiesPreserved: z.literal(true),
    pythonSaveReopen: z.literal(true),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
  }).strict(),
}).strict();
export type TemplateAuthoringArtboardResizeResponse = z.infer<typeof templateAuthoringArtboardResizeResponseSchema>;
