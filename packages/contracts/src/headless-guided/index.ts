import { z } from 'zod';
import { headlessGrammarSchema, headlessVariationAxisSchema } from '../headless-content/index';
import { reelTemplateIdSchema } from '../reels/templates';

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
    unsplashPhotos: z
      .array(
        z
          .object({
            photoId: z.string().trim().min(1).max(100),
            role: z.enum(['scene', 'style', 'pose']),
          })
          .strict(),
      )
      .max(2)
      .optional()
      .describe(
        'Optional Unsplash photo ids selected from unsplash_search; source photos guide the scene, style or pose only.',
      ),
    grammar: headlessGrammarSchema
      .optional()
      .describe(
        "Every reel's story shape: a concept id from view=guidance concepts (offer-direct, the default, is the offer in the hook). With vary=grammar, the concept to move the base to.",
      ),
    baseRecommendationId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Paid: double down on this winning recommendation's creative, changing one thing (vary). Give at most one base.",
      ),
    baseRunId: z
      .string()
      .uuid()
      .optional()
      .describe('An accepted headless output to double down on: its run id, with baseOutputId.'),
    baseOutputId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('The accepted output id inside baseRunId.'),
    vary: headlessVariationAxisSchema
      .optional()
      .describe(
        "The ONE thing each variant changes against its base (hook, face, location, grammar or effect). The base is baseRecommendationId, baseRunId+baseOutputId, or else the one winning angle in angleIds. With a base and no vary, the ad's own numbers pick it.",
      ),
    effectId: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(40)
      .optional()
      .describe(
        "An effect over the footage, never the type (view=guidance effects, or the brand's approved styles). With vary=effect and a base, the effect to re-style the base's own takes in, at no generation cost.",
      ),
    templateId: reelTemplateIdSchema
      .optional()
      .describe(
        "The reel's type and motion template (view=guidance templates); absent, the director picks.",
      ),
    stillLayout: z
      .string()
      .max(40)
      .optional()
      .describe("A still's layout family (view=guidance layouts); absent, the director picks."),
    conceptVariantId: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .max(40)
      .optional()
      .describe(
        "A brand's approved concept variant (view=guidance); its base concept is the grammar.",
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
  baseRecommendationId: true,
});
