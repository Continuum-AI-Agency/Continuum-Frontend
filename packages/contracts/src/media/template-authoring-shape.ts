import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const point = z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]);
const color = z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]);
const solidFill = z.object({ type: z.literal('solid'), color, opacity: z.number().finite().min(0).max(1) }).strict();
const solidStroke = z.object({ type: z.literal('solid'), color, opacity: z.number().finite().min(0).max(1), width: z.number().finite().positive().max(10_000) }).strict();
const noPaint = z.object({ type: z.literal('none') }).strict();

export const templateAuthoringShapeCreateOperationSchema = z.object({
  type: z.literal('shape.create'),
  draftNodeId: z.string().uuid(),
  compId: z.number().int().positive(),
  shape: z.enum(['rectangle', 'ellipse']),
  name: z.string().trim().min(1).max(200),
  position: point,
  size: z.tuple([z.number().finite().positive().max(100_000), z.number().finite().positive().max(100_000)]),
  inSec: z.number().finite().nonnegative(),
  outSec: z.number().finite().positive(),
  fill: z.union([solidFill, noPaint]),
  stroke: z.union([solidStroke, noPaint]),
}).strict().refine((value) => value.outSec > value.inSec, 'outSec must be after inSec');
export type TemplateAuthoringShapeCreateOperation = z.infer<typeof templateAuthoringShapeCreateOperationSchema>;

export const templateAuthoringShapeCreateRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_shape_create/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  operation: templateAuthoringShapeCreateOperationSchema,
}).strict();
export type TemplateAuthoringShapeCreateRequest = z.infer<typeof templateAuthoringShapeCreateRequestSchema>;

const paintReadback = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('solid'), color: z.array(z.number().finite()).length(3), opacity: z.number().finite() }).strict(),
]);
export const templateAuthoringShapeReadbackSchema = z.object({
  name: z.string(), shape: z.enum(['rectangle', 'ellipse']), position: z.array(z.number().finite()).length(2),
  size: z.array(z.number().finite()).length(2), pathPosition: z.array(z.number().finite()).length(2),
  fill: paintReadback,
  stroke: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }).strict(),
    z.object({ type: z.literal('solid'), color: z.array(z.number().finite()).length(3), opacity: z.number().finite(), width: z.number().finite() }).strict(),
  ]),
  inSec: z.number().finite(), outSec: z.number().finite(), index: z.number().int().nonnegative(),
}).strict();

export const templateAuthoringShapeCreateResponseSchema = z.object({
  filename: z.string().min(1), sourceSha256: sha256, outputSha256: sha256, inlineBase64: z.string().min(1),
  mapping: z.object({ draftNodeId: z.string().uuid(), persistedUid: z.number().int().positive(), compId: z.number().int().positive(), index: z.literal(0) }).strict(),
  readback: templateAuthoringShapeReadbackSchema,
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'), rustStatus: z.enum(['ready', 'warning']),
    originalLayerCount: z.number().int().nonnegative(), outputLayerCount: z.number().int().nonnegative(), newLayerCount: z.literal(1),
    sourceGraphPreserved: z.literal(true), existingSerializedLayerPayloadsPreserved: z.literal(true),
    unchangedPackageDependencies: z.literal(true), rustAndPythonReadback: z.literal(true),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
  }).strict(),
}).strict();
export type TemplateAuthoringShapeCreateResponse = z.infer<typeof templateAuthoringShapeCreateResponseSchema>;
