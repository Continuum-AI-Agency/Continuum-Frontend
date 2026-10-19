import { z } from 'zod';

const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const selection = z
  .object({
    compId: z.number().int().positive(),
    frameIndices: z.array(z.number().int().nonnegative()).min(1).max(16),
    formatId: z.string().trim().min(1).max(200),
  })
  .strict()
  .refine((value) => new Set(value.frameIndices).size === value.frameIndices.length, {
    message: 'Frame indices must be unique',
    path: ['frameIndices'],
  });

export const templateAuthoringNativeRenderRequestSchema = z
  .object({
    expectedDraftRevision: z.number().int().positive(),
    sourceChecksum: sha256,
    commandDigest: sha256,
    packageChecksum: sha256,
    frames: z.array(selection).min(1).max(8),
  })
  .strict()
  .refine(
    (value) => {
      const keys = value.frames.flatMap((entry) =>
        entry.frameIndices.map((frame) => `${entry.compId}:${frame}:${entry.formatId}`),
      );
      return new Set(keys).size === keys.length && keys.length <= 16;
    },
    {
      message: 'Frame selections must be unique and contain at most sixteen frames',
      path: ['frames'],
    },
  );
export type TemplateAuthoringNativeRenderRequest = z.infer<
  typeof templateAuthoringNativeRenderRequestSchema
>;

export const templateAuthoringNativeRenderStateSchema = z.enum([
  'submitted',
  'running',
  'completed',
  'needs_input',
  'failed',
  'stale',
]);

export const templateAuthoringNativeRenderFrameSchema = z
  .object({
    frameId: uuid,
    compId: z.number().int().positive(),
    frameIndex: z.number().int().nonnegative(),
    frameTimeSeconds: z.number().nonnegative(),
    formatId: z.string().min(1),
    mimeType: z.enum(['image/png', 'image/jpeg']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frameRate: z
      .object({ numerator: z.number().int().positive(), denominator: z.number().int().positive() })
      .strict(),
    checksum: sha256,
    stale: z.boolean(),
  })
  .strict();

export const templateAuthoringNativeRenderSchema = z
  .object({
    renderId: uuid,
    artifactId: uuid,
    scope: z.object({ brandId: uuid, assetId: uuid, baseVersionId: uuid }).strict(),
    userId: uuid,
    draftRevision: z.number().int().positive(),
    sourceChecksum: sha256,
    commandDigest: sha256,
    packageChecksum: sha256,
    requestDigest: sha256,
    engine: z.literal('after-effects').nullable(),
    state: templateAuthoringNativeRenderStateSchema,
    errorCode: z.string().min(1).nullable(),
    frames: z.array(templateAuthoringNativeRenderFrameSchema),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type TemplateAuthoringNativeRender = z.infer<typeof templateAuthoringNativeRenderSchema>;

export const templateAuthoringNativeRenderFrameParamsSchema = z
  .object({ renderId: uuid, frameId: uuid })
  .strict();
