import { z } from 'zod';

export const creativeTargetSchema = z
  .object({
    format: z.enum(['image', 'carousel', 'video']),
    aspectRatio: z.enum(['1:1', '4:5', '9:16', '16:9']),
    subject: z.enum(['person', 'product', 'scene']).default('person'),
    style: z.string().trim().min(1).max(160).optional(),
    placement: z.string().trim().min(1).max(160).optional(),
    cardCount: z.number().int().min(2).max(10).optional(),
  })
  .strict();
export type CreativeTarget = z.infer<typeof creativeTargetSchema>;

export const creativeComponentSchema = z
  .object({
    kind: z.enum([
      'character',
      'scene',
      'product',
      'format',
      'style',
      'template',
      'layout',
      'shot_role',
    ]),
    id: z.string().min(1),
    revision: z.number().int().positive().optional(),
  })
  .strict();
export type CreativeComponent = z.infer<typeof creativeComponentSchema>;
export const creativeComponentEvidenceSchema = z
  .object({
    component: creativeComponentSchema,
    adAccountId: z.string(),
    adsetId: z.string(),
    objective: z.string(),
    kpiField: z.string(),
    currency: z.string(),
    windowDays: z.number().int(),
    spend: z.number().nonnegative(),
    impressions: z.number().nonnegative(),
    results: z.number().nonnegative(),
    ads: z.number().int().nonnegative(),
    costPerResult: z.number().nullable(),
    evidenceAsOf: z.string().nullable(),
    lastEvidenceDate: z.string().nullable(),
    flags: z.array(z.string()),
    eligible: z.boolean(),
  })
  .strict();
export type CreativeComponentEvidence = z.infer<typeof creativeComponentEvidenceSchema>;

const segment = z
  .object({
    value: z.string(),
    spend: z.number().nonnegative(),
    leads: z.number().nonnegative(),
    conversations: z.number().nonnegative(),
    results: z.record(z.string(), z.number().nonnegative()).optional(),
  })
  .strict();
export const optimizerGenerationContextSchema = z
  .object({
    recommendationId: z.string().uuid().nullable(),
    portfolioId: z.string().uuid().nullable(),
    brandId: z.string().uuid(),
    adsetId: z.string(),
    adId: z.string().nullable(),
    kind: z.string().nullable(),
    reason: z.string().nullable(),
    capturedAt: z.string().datetime(),
    audience: z
      .object({
        portfolioId: z.string().uuid(),
        brandId: z.string().uuid(),
        objective: z.string(),
        currency: z.string(),
        since: z.string(),
        adAccountId: z.string().optional(),
        kpiField: z.string().optional(),
        evidenceAsOf: z.string().nullable().optional(),
        lastEvidenceDate: z.string().nullable().optional(),
        adsetIds: z.array(z.string()),
        age: z.array(segment),
        gender: z.array(segment),
        targeting: z
          .object({
            places: z.array(z.string()),
            locales: z.array(z.number()),
            interests: z.array(z.string()),
            ageMin: z.number().nullable(),
            ageMax: z.number().nullable(),
          })
          .strict(),
      })
      .strict()
      .nullable(),
    digest: z.string(),
    digestRefreshedAt: z.string().nullable(),
    groundedOn: z.array(z.string()),
    componentEvidence: creativeComponentEvidenceSchema.array().optional(),
  })
  .strict();
export type OptimizerGenerationContext = z.infer<typeof optimizerGenerationContextSchema>;

export const creativeOutputManifestSchema = z
  .object({
    format: z.enum(['image', 'carousel', 'video']),
    assets: z
      .array(
        z
          .object({
            assetId: z.string().uuid(),
            versionId: z.string().uuid(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            order: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.format !== 'carousel' && value.assets.length !== 1) ||
      (value.format === 'carousel' && value.assets.length < 2) ||
      value.assets.some((asset, index) => asset.order !== index) ||
      new Set(value.assets.map((asset) => asset.assetId)).size !== value.assets.length
    )
      ctx.addIssue({
        code: 'custom',
        message: 'One image/video or an ordered carousel of distinct assets is required.',
      });
  });
export type CreativeOutputManifest = z.infer<typeof creativeOutputManifestSchema>;

export const creativeGenerationReviewSchema = z
  .object({ elementIds: z.array(z.string().uuid()).min(1) })
  .strict();
export function readCreativeOutputManifests(
  result: Record<string, unknown> | null | undefined,
): CreativeOutputManifest[] {
  const parsed = creativeOutputManifestSchema.array().safeParse(result?.creativeManifests);
  return parsed.success ? parsed.data : [];
}
