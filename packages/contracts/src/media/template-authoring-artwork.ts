import { z } from 'zod';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const safeImageName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(png|jpe?g)$/i).refine((name) => !name.includes('..'));
const point = z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]);

export const templateAuthoringArtworkCreateOperationSchema = z.object({
  type: z.literal('artwork.create'),
  draftNodeId: z.string().uuid(),
  compId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  /** Composition-space center of the layer transform. */
  position: point,
  /** Requested displayed width and height, independent of source pixel dimensions. */
  size: z.tuple([z.number().finite().positive().max(100_000), z.number().finite().positive().max(100_000)]),
  inSec: z.number().finite().nonnegative(),
  outSec: z.number().finite().positive(),
}).strict().refine((value) => value.outSec > value.inSec, 'outSec must be after inSec');
export type TemplateAuthoringArtworkCreateOperation = z.infer<typeof templateAuthoringArtworkCreateOperationSchema>;

export const templateAuthoringArtworkAssetSchema = z.object({ filename: safeImageName, sha256, inlineBase64: z.string().min(1) }).strict();
export type TemplateAuthoringArtworkAsset = z.infer<typeof templateAuthoringArtworkAssetSchema>;

export const templateAuthoringArtworkCreateRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_artwork_create/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256,
  inlineBase64: z.string().min(1),
  asset: templateAuthoringArtworkAssetSchema,
  operation: templateAuthoringArtworkCreateOperationSchema,
}).strict();
export type TemplateAuthoringArtworkCreateRequest = z.infer<typeof templateAuthoringArtworkCreateRequestSchema>;

export const templateAuthoringArtworkReadbackSchema = z.object({
  name: z.string(), position: z.array(z.number().finite()).length(2), scale: z.array(z.number().finite()).length(3),
  size: z.array(z.number().finite()).length(2), inSec: z.number().finite(), outSec: z.number().finite(),
  index: z.literal(0), sourceUid: z.number().int().positive(), footageWidth: z.number().int().positive(),
  footageHeight: z.number().int().positive(), format: z.enum(['PNG', 'JPEG']), dependencyPath: z.string().min(1), dependencySha256: sha256,
}).strict();

export const templateAuthoringArtworkCreateResponseSchema = z.object({
  filename: z.string().min(1), sourceSha256: sha256, outputSha256: sha256, inlineBase64: z.string().min(1),
  mapping: z.object({ draftNodeId: z.string().uuid(), persistedUid: z.number().int().positive(), compId: z.number().int().positive(), index: z.literal(0), footageItemId: z.number().int().positive() }).strict(),
  readback: templateAuthoringArtworkReadbackSchema,
  proof: z.object({
    rustAuthority: z.literal('aep2json-rust'), rustStatus: z.enum(['ready', 'warning']),
    originalLayerCount: z.number().int().nonnegative(), outputLayerCount: z.number().int().nonnegative(), newLayerCount: z.literal(1),
    sourceGraphPreserved: z.literal(true), existingSerializedLayerPayloadsPreserved: z.literal(true),
    unchangedPackageDependencies: z.literal(true), suppliedAssetHashVerified: z.literal(true), rustAndPythonReadback: z.literal(true),
    nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
  }).strict(),
}).strict();
export type TemplateAuthoringArtworkCreateResponse = z.infer<typeof templateAuthoringArtworkCreateResponseSchema>;
