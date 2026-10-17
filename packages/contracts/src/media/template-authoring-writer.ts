import { z } from 'zod';

export * from './template-authoring-mutation';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const safeFontName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(ttf|otf)$/i);
const point = z.tuple([z.number().finite().min(-100_000).max(100_000), z.number().finite().min(-100_000).max(100_000)]);

export const templateAuthoringTextCreateOperationSchema = z
  .object({
    type: z.literal('text.create'),
    draftNodeId: z.string().uuid(),
    compId: z.number().int().positive(),
    /** Zero-based top-to-bottom insertion point. */
    insertionIndex: z.literal(0),
    name: z.string().trim().min(1).max(200),
    text: z.string().min(1).max(20_000),
    style: z
      .object({
        fontPostScriptName: z.string().trim().min(1).max(200),
        fontSize: z.number().finite().min(1).max(1000),
        fillColor: z.tuple([z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1)]),
      })
      .strict(),
    position: point,
    inSec: z.number().finite().nonnegative(),
    outSec: z.number().finite().positive(),
  })
  .strict()
  .refine((value) => value.outSec > value.inSec, 'outSec must be after inSec');
export type TemplateAuthoringTextCreateOperation = z.infer<typeof templateAuthoringTextCreateOperationSchema>;

export const templateAuthoringTextFontSchema = z
  .object({
    filename: safeFontName,
    postScriptName: z.string().trim().min(1).max(200),
    sha256,
    inlineBase64: z.string().min(1),
  })
  .strict();
export type TemplateAuthoringTextFont = z.infer<typeof templateAuthoringTextFontSchema>;

export const templateAuthoringTextCreateRequestSchema = z
  .object({
    schema: z.literal('forge_template_authoring_text_create/v1'),
    filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
    sourceSha256: sha256,
    inlineBase64: z.string().min(1),
    font: templateAuthoringTextFontSchema,
    operation: templateAuthoringTextCreateOperationSchema,
  })
  .strict();
export type TemplateAuthoringTextCreateRequest = z.infer<typeof templateAuthoringTextCreateRequestSchema>;

export const templateAuthoringTextReadbackSchema = z
  .object({
    name: z.string(),
    text: z.string(),
    fontPostScriptName: z.string(),
    fontSize: z.number().finite(),
    fillColor: z.array(z.number().finite()).length(3),
    position: z.array(z.number().finite()).length(2),
    inSec: z.number().finite(),
    outSec: z.number().finite(),
    index: z.number().int().nonnegative(),
  })
  .strict();

export const templateAuthoringTextCreateResponseSchema = z
  .object({
    filename: z.string().min(1),
    sourceSha256: sha256,
    outputSha256: sha256,
    inlineBase64: z.string().min(1),
    mapping: z
      .object({ draftNodeId: z.string().uuid(), persistedUid: z.number().int().positive(), compId: z.number().int().positive() })
      .strict(),
    readback: templateAuthoringTextReadbackSchema,
    proof: z
      .object({
        rustAuthority: z.literal('aep2json-rust'),
        rustStatus: z.enum(['ready', 'warning']),
        originalCompositionCount: z.number().int().nonnegative(),
        outputCompositionCount: z.number().int().nonnegative(),
        originalEssentialPropertyCount: z.number().int().nonnegative(),
        outputEssentialPropertyCount: z.number().int().nonnegative(),
        originalLayerCount: z.number().int().nonnegative(),
        outputLayerCount: z.number().int().nonnegative(),
        newLayerCount: z.literal(1),
        sourceGraphPreserved: z.literal(true),
        existingSerializedLayerPayloadsPreserved: z.literal(true),
        unchangedPackageDependencies: z.literal(true),
        pythonMeasuredNewLayer: z.literal(true),
        nativeAfterEffects: z.object({ status: z.literal('unverified'), reason: z.string().min(1) }).strict(),
      })
      .strict(),
  })
  .strict();
export type TemplateAuthoringTextCreateResponse = z.infer<typeof templateAuthoringTextCreateResponseSchema>;
