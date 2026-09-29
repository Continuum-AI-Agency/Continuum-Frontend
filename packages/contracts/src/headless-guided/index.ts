import { z } from 'zod';

/**
 * How an agent (Jaina, the Organic agent) GUIDES the product's headless director instead of
 * authoring every shot: ids and choices only. Every fact the director writes from (the offer,
 * the hook, prices, the persona's numbers, an Element's spec) comes from the product's own data;
 * the agent picks which of them, how many, and in what language.
 *
 * Model-facing, so FLAT: no unions (Gemini answers a union with `{}`) and no numeric enums (one
 * poisons the whole declaration). The deliverable comes first and the one free-text field last.
 */

/** Per format, per call. ponytail: bounds the tool's wall-clock (one director run per item);
 *  raise it with a fire-and-forget hand-off when an agent needs more in one call. */
export const HEADLESS_GUIDED_MAX_PER_FORMAT = 2;

const ids = (what: string) =>
  z.array(z.string().uuid()).max(4).optional().describe(`${what} Ids from view=guidance only.`);

export const headlessGuidanceSchema = z
  .object({
    reels: z
      .number()
      .int()
      .min(0)
      .max(HEADLESS_GUIDED_MAX_PER_FORMAT)
      .describe('How many vertical reels to make.'),
    stills: z
      .number()
      .int()
      .min(0)
      .max(HEADLESS_GUIDED_MAX_PER_FORMAT)
      .describe('How many still sets (a static or a small carousel) to make.'),
    language: z
      .string()
      .regex(/^[a-z]{2}$/)
      .describe('ISO 639-1 code every spoken and written word is in: "es", "en".'),
    portfolioId: z
      .string()
      .uuid()
      .optional()
      .describe('Paid: the Optimizer portfolio whose audience and winning ads ground the work.'),
    recommendationId: z
      .string()
      .uuid()
      .optional()
      .describe("Paid: an Optimizer recommendation; the work sells that recommendation's offer."),
    persona: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe('Who the creative speaks to: a persona id listed by view=guidance.'),
    gender: z
      .enum(['female', 'male'])
      .optional()
      .describe(
        'Casting constraint: the gender everyone cast shares (the approved actresses → female). Personas are derived within it.',
      ),
    angleIds: z
      .array(z.string().trim().min(1).max(200))
      .max(4)
      .optional()
      .describe('The winning angles to sell on: angle ids listed by view=guidance.'),
    characterElementIds: ids('Approved people the director may cast.'),
    sceneElementIds: ids('Approved places to shoot in.'),
    referenceAssetIds: z
      .array(
        z
          .object({
            assetId: z.string().uuid(),
            role: z.enum(['product', 'scene', 'style', 'pose']),
          })
          .strict(),
      )
      .max(2)
      .optional()
      .describe(
        'Library image assets to use as visual references; role says what each image controls.',
      ),
    direction: z
      .string()
      .trim()
      .max(400)
      .optional()
      .describe(
        'Optional steer on emphasis or tone, at most 400 characters. Never copy, a claim, a price or an offer: those come from the data.',
      ),
  })
  .strict();
export type HeadlessGuidance = z.infer<typeof headlessGuidanceSchema>;

/** The Organic agent guides from its own organic data; it has no Optimizer portfolio. */
export const organicHeadlessGuidanceSchema = headlessGuidanceSchema.omit({
  portfolioId: true,
  recommendationId: true,
});
