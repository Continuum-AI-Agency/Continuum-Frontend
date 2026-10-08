// The blocks a caller assembles a piece from (concept + effect + template + cast + scene), the
// styles a brand's agents compose for it (owner 2026-09-29: "the organic agent can create more",
// usable once the brand approves), and the review queue that shows the result before it posts
// (swipe to approve or skip; describe a change or re-style it at $0).

import { z } from 'zod';
import { reelTemplateIdSchema } from '../reels/templates';
import { headlessConcept } from './concepts';
import { headlessEffectSchema } from './effects';
import { headlessGrammarSchema } from './grammar';

const slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(40);

/** A concept told a brand's way: an existing concept's beats, with the brand's own guidance. */
export const conceptVariantSchema = z
  .object({
    id: slug,
    base: headlessGrammarSchema,
    label: z.string().trim().min(1).max(40),
    whenToUse: z.string().trim().min(1).max(300),
    guidance: z.array(z.string().trim().min(1).max(300)).max(5),
    seconds: z
      .object({ min: z.number().positive(), max: z.number().positive() })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((variant, ctx) => {
    if (!variant.seconds) return;
    const base = headlessConcept(variant.base).seconds;
    if (
      variant.seconds.min >= variant.seconds.max ||
      variant.seconds.min < base.min ||
      variant.seconds.max > base.max
    )
      ctx.addIssue({
        code: 'custom',
        path: ['seconds'],
        message: `within ${variant.base}'s ${base.min}–${base.max} s`,
      });
  });
export type ConceptVariant = z.infer<typeof conceptVariantSchema>;

/** What a plan item, a guided call or a queue revision builds a piece from, by id. */
export const headlessCreativeBlocksSchema = z
  .object({
    concept: headlessGrammarSchema,
    conceptVariantId: slug.optional(),
    effectId: slug.optional(),
    templateId: reelTemplateIdSchema.optional(),
    characterElementIds: z.array(z.string().uuid()).max(4).optional(),
    sceneElementIds: z.array(z.string().uuid()).max(4).optional(),
  })
  .strict();
export type HeadlessCreativeBlocks = z.infer<typeof headlessCreativeBlocksSchema>;

// --- A brand's own styles ----------------------------------------------------------------------

export const brandStyleStatusSchema = z.enum(['draft', 'approved', 'retired']);
export type BrandStyleStatus = z.infer<typeof brandStyleStatusSchema>;

const brandEffectSpecSchema = headlessEffectSchema.refine((effect) => effect.origin === 'brand', {
  message: 'a brand effect has origin brand',
});

export const brandStyleSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('effect'), spec: brandEffectSpecSchema }).strict(),
  z.object({ kind: z.literal('concept_variant'), spec: conceptVariantSchema }).strict(),
]);
export type BrandStyleSpec = z.infer<typeof brandStyleSpecSchema>;

export const brandStyleSchema = z.intersection(
  brandStyleSpecSchema,
  z.object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    slug,
    status: brandStyleStatusSchema,
    /** The $0 render of the effect on the brand's own still, for the shelf. */
    previewUrl: z.string().url().nullable(),
    createdBy: z.string().uuid().nullable(),
    approvedBy: z.string().uuid().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);
export type BrandStyle = z.infer<typeof brandStyleSchema>;

/** POST a draft; the agent or a brand user composes it, only a brand user approves it. */
export const brandStyleDraftRequestSchema = brandStyleSpecSchema;
export const brandStyleListResponseSchema = z
  .object({ styles: z.array(brandStyleSchema) })
  .strict();
export const brandStyleDecisionRequestSchema = z
  .object({ decision: z.enum(['approve', 'retire']) })
  .strict();

// --- The review queue --------------------------------------------------------------------------

/** A draft whose media is made (status draft, media realized) and that carries its blocks. */
export const reviewQueueItemSchema = z
  .object({
    draftId: z.string().uuid(),
    brandId: z.string().uuid(),
    platform: z.enum(['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube']),
    scheduledAt: z.string().nullable(),
    caption: z.string().nullable(),
    media: z
      .object({
        kind: z.enum(['video', 'image']),
        url: z.string().url(),
        posterUrl: z.string().url().nullable(),
      })
      .strict(),
    creative: headlessCreativeBlocksSchema,
    createdAt: z.string(),
  })
  .strict();
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const reviewQueueListResponseSchema = z
  .object({ items: z.array(reviewQueueItemSchema) })
  .strict();

/** Right = approve (onto its schedule), left = skip, tap = revise: a note re-directs it with the
 *  same blocks; an effect alone re-styles the same takes at $0. */
export const reviewDecisionSchema = z
  .discriminatedUnion('decision', [
    z.object({ decision: z.literal('approve'), scheduledAt: z.string().optional() }).strict(),
    z.object({ decision: z.literal('skip') }).strict(),
    z
      .object({
        decision: z.literal('revise'),
        note: z.string().trim().min(1).max(400).optional(),
        effectId: slug.optional(),
      })
      .strict(),
  ])
  .refine((value) => value.decision !== 'revise' || Boolean(value.note || value.effectId), {
    message: 'a revision names a change or an effect',
  });
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const reviewDecisionResponseSchema = z
  .object({
    draftId: z.string().uuid(),
    status: z.enum(['scheduled', 'skipped', 'revising']),
  })
  .strict();
