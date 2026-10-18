import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const point = z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]);
const size = z.tuple([z.number().finite().positive().max(100_000), z.number().finite().positive().max(100_000)]);
const feather = z.tuple([z.number().finite().min(0).max(32_000), z.number().finite().min(0).max(32_000)]);

export const templateAuthoringMaskCreateOperationSchema = z.object({
  type: z.literal('mask.create'),
  draftMaskId: z.string().uuid(),
  compId: z.number().int().positive(),
  layerUid: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  shape: z.enum(['rectangle', 'ellipse']),
  /** Center and dimensions are measured in the target layer's source pixel space. */
  center: point,
  size,
  mode: z.enum(['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference']),
  opacity: z.number().finite().min(0).max(100),
  feather,
}).strict();
export type TemplateAuthoringMaskCreateOperation = z.infer<typeof templateAuthoringMaskCreateOperationSchema>;

export const templateAuthoringMaskCreateRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_mask_create/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  operation: templateAuthoringMaskCreateOperationSchema,
}).strict();
export type TemplateAuthoringMaskCreateRequest = z.infer<typeof templateAuthoringMaskCreateRequestSchema>;

const pathPoints = z.array(z.tuple([z.number().finite(), z.number().finite()])).length(4);
const localToComp = z.object({
  matrix: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  corners: pathPoints,
  verifiedWithPyAep: z.literal(true),
}).strict();
const sourceGeometry = z.object({
  sourceKind: z.enum(['shape-path', 'footage']),
  bounds: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive() }).strict(),
  anchor: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  localToComp,
}).strict();
export const templateAuthoringMaskReadbackSchema = z.object({
  maskId: z.number().int().positive(), name: z.string(), vertices: pathPoints, inTangents: pathPoints, outTangents: pathPoints,
  closed: z.literal(true), mode: z.enum(['none', 'add', 'subtract', 'intersect', 'lighten', 'darken', 'difference']),
  opacity: z.number().finite().min(0).max(100), feather: z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()]),
  keyframes: z.object({ path: z.literal(0), opacity: z.literal(0), feather: z.literal(0) }).strict(),
  layerInSec: z.number().finite().nonnegative(), layerOutSec: z.number().finite().positive(),
  layerWidth: z.number().int().positive(), layerHeight: z.number().int().positive(),
  compVertices: pathPoints,
}).strict();

export const templateAuthoringMaskCreateResponseSchema = z.object({
  filename: z.string().min(1), sourceSha256: sha256, outputSha256: sha256, inlineBase64: z.string().min(1),
  mapping: z.object({ draftMaskId: z.string().uuid(), compId: z.number().int().positive(), layerUid: z.number().int().positive(), maskId: z.number().int().positive(), propertyIndex: z.number().int().nonnegative() }).strict(),
  readback: templateAuthoringMaskReadbackSchema,
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'), rustStatus: z.enum(['ready', 'warning']), layerIdentityAndTimingPreserved: z.literal(true),
    allUnrelatedLayerPayloadsPreserved: z.literal(true), existingMaskPayloadsPreserved: z.literal(true),
    allOriginalTargetLayerLeafChunksPreserved: z.literal(true), dependenciesAndEssentialPropertiesPreserved: z.literal(true),
    pythonSaveReopen: z.literal(true), nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
    sourceGeometry,
  }).strict(),
}).strict();
export type TemplateAuthoringMaskCreateResponse = z.infer<typeof templateAuthoringMaskCreateResponseSchema>;
