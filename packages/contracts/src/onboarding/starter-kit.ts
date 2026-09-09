import { z } from 'zod';
import { onboardingInspirationSelectionSchema } from './inspirations';

export const STARTER_ELEMENT_ROLES = ['product', 'character', 'style', 'setting'] as const;
export const STARTER_CREATIVE_SLOTS = [
  'creative_product',
  'creative_brand_awareness',
  'creative_hybrid',
] as const;
export const STARTER_SLOTS = [...STARTER_ELEMENT_ROLES, ...STARTER_CREATIVE_SLOTS] as const;
export const STARTER_ATTEMPT_LIMIT = 2;
export const starterSlotKeySchema = z.enum(STARTER_SLOTS);
export type StarterSlotKey = z.infer<typeof starterSlotKeySchema>;
export type StarterElementRole = (typeof STARTER_ELEMENT_ROLES)[number];

export const starterProductCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    imageUrl: z.string().url().max(2000),
    productUrl: z.string().url().max(2000),
  })
  .strict();

export const starterSlotSchema = z
  .object({
    status: z.enum(['pending', 'running', 'ready', 'failed']),
    attempts: z.number().int().min(0).max(STARTER_ATTEMPT_LIMIT),
    providerReservations: z
      .object({ image: z.number().int().min(0).max(2), quality: z.number().int().min(0).max(2) })
      .default({ image: 0, quality: 0 }),
    elementId: z.string().uuid().nullable().default(null),
    assetId: z.string().uuid().nullable().default(null),
    versionId: z.string().uuid().nullable().default(null),
    name: z.string().max(200).nullable().default(null),
    rationale: z.string().max(2000).nullable().default(null),
    source: z.enum(['catalog', 'website', 'concept', 'generated']).nullable().default(null),
    error: z.string().max(500).nullable().default(null),
    referenceAssetIds: z.array(z.string().uuid()).default([]),
    references: z
      .array(z.object({ asset_id: z.string().uuid(), version_id: z.string().uuid() }).strict())
      .default([]),
    missingRoles: z.array(z.enum(STARTER_ELEMENT_ROLES)).default([]),
    quality: z
      .object({ sha256: z.string(), score: z.number(), reason: z.string() })
      .nullable()
      .default(null),
  })
  .strict();
export type StarterSlot = z.infer<typeof starterSlotSchema>;

export const starterSlotsSchema = z
  .object({
    product: starterSlotSchema,
    character: starterSlotSchema,
    style: starterSlotSchema,
    setting: starterSlotSchema,
    creative_product: starterSlotSchema,
    creative_brand_awareness: starterSlotSchema,
    creative_hybrid: starterSlotSchema,
  })
  .strict();

export const onboardingStarterRunSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    status: z.enum(['queued', 'running', 'prepared', 'completed', 'partial']),
    slots: starterSlotsSchema,
    updatedAt: z.string(),
    fundedBy: z.literal('continuum'),
  })
  .strict();
export type OnboardingStarterRun = z.infer<typeof onboardingStarterRunSchema>;

export const startOnboardingStarterSchema = z
  .object({
    brandId: z.string().uuid(),
    inspiration: onboardingInspirationSelectionSchema.nullable().optional(),
    prepareOnly: z.boolean().optional(),
  })
  .strict();
export const retryOnboardingStarterSchema = z
  .object({
    slots: z.array(starterSlotKeySchema).min(1).max(7),
  })
  .strict();

export function emptyStarterSlots(): OnboardingStarterRun['slots'] {
  const slot = () => starterSlotSchema.parse({ status: 'pending', attempts: 0 });
  return {
    product: slot(),
    character: slot(),
    style: slot(),
    setting: slot(),
    creative_product: slot(),
    creative_brand_awareness: slot(),
    creative_hybrid: slot(),
  };
}

export function starterProgress(run: OnboardingStarterRun) {
  const slots = Object.values(run.slots);
  const ready = slots.filter((slot) => slot.status === 'ready').length;
  const failed = slots.filter((slot) => slot.status === 'failed').length;
  return {
    ready,
    failed,
    total: STARTER_SLOTS.length,
    active: run.status === 'queued' || run.status === 'running',
  };
}
