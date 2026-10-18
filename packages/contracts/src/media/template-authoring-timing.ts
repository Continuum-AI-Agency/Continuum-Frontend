import { z } from 'zod';
import { templateAuthoringFreshArtboardReceiptSchema, templateAuthoringGroupIdentityMapEntrySchema } from './template-authoring-group';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const seconds = z.number().finite();
const boundedSeconds = seconds.min(-100_000).max(100_000);

export const templateAuthoringTimingOperationSchema = z.object({
  type: z.literal('layer.timing'),
  compId: z.number().int().positive(),
  layerUid: z.number().int().positive(),
  inSec: boundedSeconds,
  outSec: boundedSeconds,
}).strict().refine((value) => value.outSec > value.inSec, 'outSec must be after inSec');
export type TemplateAuthoringTimingOperation = z.infer<typeof templateAuthoringTimingOperationSchema>;

export const templateAuthoringTimingRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_layer_timing/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  identityMap: z.array(templateAuthoringGroupIdentityMapEntrySchema).max(256).optional(),
  freshArtboardReceipt: templateAuthoringFreshArtboardReceiptSchema.optional(),
  operation: templateAuthoringTimingOperationSchema,
}).strict().superRefine((request, context) => {
  const hasIdentityMap = request.identityMap !== undefined;
  const hasFreshReceipt = request.freshArtboardReceipt !== undefined;
  if (hasIdentityMap !== hasFreshReceipt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated authoring context requires both exact identity map and fresh artboard receipt', path: [hasIdentityMap ? 'freshArtboardReceipt' : 'identityMap'] });
  }
  if (request.freshArtboardReceipt && request.freshArtboardReceipt.compId !== request.operation.compId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'fresh artboard receipt must target the timing operation composition', path: ['freshArtboardReceipt', 'compId'] });
  }
  if (request.identityMap?.some((entry) => entry.compId !== request.operation.compId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'generated identity map entries must target the timing operation composition', path: ['identityMap'] });
  }
  if (request.identityMap?.some((entry) => entry.members !== undefined) && !hasFreshReceipt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'nested generated groups require a fresh artboard receipt', path: ['freshArtboardReceipt'] });
  }
});
export type TemplateAuthoringTimingRequest = z.infer<typeof templateAuthoringTimingRequestSchema>;

const timingPair = z.object({ inSec: seconds, outSec: seconds }).strict().refine((value) => value.outSec > value.inSec, 'outSec must be after inSec');
export const templateAuthoringTimingResponseSchema = z.object({
  filename: z.string().min(1),
  sourceSha256: sha256,
  outputSha256: sha256,
  inlineBase64: z.string().min(1),
  mapping: z.object({ compId: z.number().int().positive(), layerUid: z.number().int().positive() }).strict(),
  readback: z.object({
    compId: z.number().int().positive(),
    layerUid: z.number().int().positive(),
    previous: timingPair,
    inSec: seconds,
    outSec: seconds,
  }).strict().refine((value) => value.outSec > value.inSec, 'readback outSec must be after inSec'),
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'),
    rustStatus: z.enum(['ready', 'warning']),
    exactLdtaByteOffsets: z.array(z.number().int().nonnegative()),
    targetNonTimingChunksPreserved: z.literal(true),
    layerIdentitiesAndOrderPreserved: z.literal(true),
    dependenciesAndEssentialPropertiesPreserved: z.literal(true),
    pythonSaveReopen: z.literal(true),
    generatedGroupReceiptVerified: z.boolean(),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
  }).strict(),
}).strict();
export type TemplateAuthoringTimingResponse = z.infer<typeof templateAuthoringTimingResponseSchema>;

/** Missing or undefined is pending; null is proven editable; a string is the exact writer refusal. */
export const templateAuthoringTimingReasonSchema = z.string().min(1).nullable().optional();
