import { z } from 'zod';
import { unsplashPhotoSchema } from '../media/unsplash';
import { reelPresentationSchema } from '../reels/presentation';
import { reelShotRoleSchema, reelTemplateIdSchema } from '../reels/templates';
import { resolvedEffectSchema } from './effects';
import { headlessGrammarSchema, headlessVariationAxisSchema } from './grammar';
import { creativeTargetSchema, optimizerGenerationContextSchema } from './optimizer';

// The JSON is the source of truth. Library media is pinned to exact versions;
// Unsplash source photos retain their original hotlinked URL and credit.
const detail = z.string().trim().min(1).max(600);
export const headlessAssetRefSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type HeadlessAssetRef = z.infer<typeof headlessAssetRefSchema>;
const libraryVisualReferenceSchema = z
  .object({
    role: z.enum(['product', 'scene', 'style', 'pose']),
    asset: headlessAssetRefSchema,
  })
  .strict();
export const headlessUnsplashReferenceSchema = z
  .object({
    unsplash: unsplashPhotoSchema.pick({
      id: true,
      url: true,
      photographerName: true,
      photographerUrl: true,
      unsplashUrl: true,
      downloadLocation: true,
    }),
  })
  .strict();
export type HeadlessUnsplashReference = z.infer<typeof headlessUnsplashReferenceSchema>;
export const headlessVisualReferenceSchema = z.union([
  libraryVisualReferenceSchema,
  z
    .object({
      role: z.enum(['scene', 'style', 'pose']),
      unsplash: headlessUnsplashReferenceSchema.shape.unsplash,
    })
    .strict(),
]);
export type HeadlessVisualReference = z.infer<typeof headlessVisualReferenceSchema>;

const trait = z.string().trim().min(1).max(160);

export {
  type HeadlessGrammar,
  type HeadlessVariationAxis,
  headlessGrammarSchema,
  headlessVariationAxisSchema,
} from './grammar';

/** How she sounds, written the same way into every clip (Omni takes no voice reference). */
export const characterVoiceProfileSchema = z
  .object({ timbre: trait, pitch: trait, pace: trait, accent: trait, register: trait })
  .strict();
/** A look's garments one by one (keyed by lookPresets[].id), so a variant can change one garment
 * without rewriting the rest. */
export const lookWardrobeSchema = z
  .object({
    lookId: z.string().min(1),
    top: trait,
    bottom: trait,
    footwear: trait,
    accessories: trait,
    palette: z.array(trait).min(1).max(6),
  })
  .strict();
/** Who she is beyond the face: what makes a new scene or caption recognisably hers. */
export const characterBriefSchema = z
  .object({
    name: trait,
    personality: detail,
    captionVoice: z.array(trait).min(1).max(3),
    settings: z.array(trait).min(1).max(8),
    grammars: z.array(headlessGrammarSchema).max(3),
  })
  .strict();
/** Her resting pose in the identity pack and the opening stills. */
export const DEFAULT_CHARACTER_POSE = {
  head: 'slightly tilted and gently raised',
  chin: 'slightly elevated',
  gaze: 'directly toward the camera',
  mouth: 'relaxed, lips slightly parted',
  shoulders: 'relaxed and open',
};
/**
 * What makes a face read well on camera, as concrete ingredients: structure, eyes, brows, nose,
 * cheeks, lips, skin, hair, physique. A bare "attractive" or "beautiful" renders an average face
 * in flat light; these slots are what the image model can actually draw.
 */
export const characterAppearanceSchema = z
  .object({
    /** Mid-20s or older, always: an adult who reads as one. */
    apparentAge: z.number().int().min(25).max(80),
    physique: trait.describe('e.g. "slim with natural proportions".'),
    face: z
      .object({
        shape: trait.describe('e.g. "slightly narrower soft oval".'),
        jawline: trait.describe('e.g. "tapered and delicate".'),
        chin: trait,
      })
      .strict(),
    eyes: z
      .object({
        shape: trait.describe('e.g. "elongated almond".'),
        size: trait,
        spacing: trait,
        color: trait,
        outerCorners: trait.describe('e.g. "gently lifted".'),
      })
      .strict(),
    brows: z.object({ shape: trait, density: trait, color: trait }).strict(),
    nose: z
      .object({
        bridge: trait.describe('e.g. "narrow and straight".'),
        tip: trait.describe('e.g. "refined, softly rounded".'),
      })
      .strict(),
    cheeks: z
      .object({
        cheekbones: trait.describe('e.g. "slightly higher".'),
        midface: trait.describe('e.g. "soft natural fullness".'),
      })
      .strict(),
    lips: z
      .object({
        upper: trait,
        lower: trait,
        cupidBow: trait.describe('e.g. "defined".'),
        color: trait.describe('e.g. "nude-rose".'),
        finish: trait,
      })
      .strict(),
    skin: z
      .object({
        tone: trait.describe('e.g. "warm medium tan".'),
        undertone: trait.describe('e.g. "golden-neutral".'),
        finish: trait.describe('e.g. "soft luminous satin".'),
        texture: trait.describe('e.g. "realistic pores and subtle tonal variation".'),
        retouching: trait.describe('e.g. "light and believable".'),
        highlights: trait.describe('e.g. "warm amber highlights on forehead, nose, cheekbones".'),
      })
      .strict(),
    hair: z
      .object({
        color: trait.describe('e.g. "deep chocolate brown".'),
        length: trait,
        style: trait.describe('e.g. "smooth glossy blowout with loose waves".'),
        part: trait.describe('e.g. "slightly off-center".'),
        volume: trait,
        texture: trait,
        shine: trait.describe('e.g. "warm reflected highlights".'),
      })
      .strict(),
    pose: z
      .object({ head: trait, chin: trait, gaze: trait, mouth: trait, shoulders: trait })
      .strict()
      .default(DEFAULT_CHARACTER_POSE),
    expression: trait.default('a natural, relaxed half-smile with soft eyes'),
  })
  .strict()
  .describe(
    'Concrete appearance ingredients. Fill every slot with what the camera sees; never write a bare adjective like "attractive", "beautiful" or "pretty".',
  );
export type CharacterAppearance = z.infer<typeof characterAppearanceSchema>;

export const characterSpecSchema = z
  .object({
    adult: z.literal(true),
    apparentAgeRange: detail,
    face: z
      .object({
        shape: detail,
        features: detail,
        eyes: detail,
        skinToneAndTexture: detail,
        distinguishingMarks: detail,
      })
      .strict(),
    hair: detail,
    body: z
      .object({
        height: detail,
        build: detail,
        proportions: detail,
        distinguishingDetails: detail,
      })
      .strict(),
    persona: detail,
    voice: detail.optional(),
    /** Absent on Elements written before it existed; they keep parsing on the coarse slots. */
    appearance: characterAppearanceSchema.optional(),
    voiceProfile: characterVoiceProfileSchema.optional(),
    brief: characterBriefSchema.optional(),
    lookWardrobe: z.array(lookWardrobeSchema).max(12).optional(),
    movement: z
      .object({
        posture: detail,
        gait: detail,
        gestures: detail,
        athleticCapabilities: detail,
        limits: detail,
      })
      .strict(),
    lookPresets: z
      .array(z.object({ id: z.string().min(1), wardrobe: detail, grooming: detail }).strict())
      .min(1)
      .max(12),
    sourceReferences: z
      .array(
        z
          .object({
            asset: headlessAssetRefSchema,
            role: z.enum(['identity', 'body', 'look', 'motion']),
            allowedInfluence: detail,
            prohibitedInfluence: detail,
          })
          .strict(),
      )
      .max(8),
    /** Unsplash photos she was cast from: style and pose only, never identity. Kept for credit. */
    externalReferences: z
      .array(
        z
          .object({
            role: z.enum(['style', 'pose']),
            unsplash: headlessUnsplashReferenceSchema.shape.unsplash,
          })
          .strict(),
      )
      .max(4)
      .optional(),
  })
  .strict();
export type CharacterSpec = z.infer<typeof characterSpecSchema>;
/** The keys added after the director's and caster's model schemas were fixed. Omit them from any
 * schema a model answers in until that caller is ready for them: a grown Gemini response schema
 * has already been refused with 400 INVALID_ARGUMENT. */
export const CHARACTER_SPEC_V2_KEYS = {
  voiceProfile: true,
  brief: true,
  lookWardrobe: true,
  externalReferences: true,
} as const;

export const headlessSceneSpecSchema = z
  .object({
    setting: detail,
    spatialAnchors: z.array(detail).min(1).max(16),
    lighting: detail,
    captureDefaults: detail,
    references: z.array(headlessAssetRefSchema).max(4),
  })
  .strict();
/** How a creator shows the product: worn clothing turns full body, a held item comes to the
 * lens, a cosmetic is held by the face and applied. Absent → inferred from the concept. */
export const productShowcaseSchema = z.enum(['worn', 'held', 'applied']);
export type ProductShowcase = z.infer<typeof productShowcaseSchema>;

export const headlessProductSpecSchema = z
  .object({
    concept: detail,
    showcase: productShowcaseSchema.optional(),
    sku: z.string().trim().min(1).nullable(),
    visualConstraints: z.array(detail).max(16),
    approvedClaimRefs: z.array(z.string().uuid()).max(16),
    references: z.array(headlessAssetRefSchema).max(4),
  })
  .strict();

const revisionBase = {
  elementId: z.string().uuid(),
  tenantId: z.string().uuid(),
  revision: z.number().int().positive(),
  schemaVersion: z.literal(1),
  rightsRef: z.string().trim().min(1),
  approved: z.boolean(),
};
export const headlessElementRevisionSchema = z.discriminatedUnion('kind', [
  z
    .object({ ...revisionBase, kind: z.literal('character'), payload: characterSpecSchema })
    .strict(),
  z
    .object({ ...revisionBase, kind: z.literal('scene'), payload: headlessSceneSpecSchema })
    .strict(),
  z
    .object({ ...revisionBase, kind: z.literal('product'), payload: headlessProductSpecSchema })
    .strict(),
]);
export type HeadlessElementRevision = z.infer<typeof headlessElementRevisionSchema>;

export const characterPanelRoleSchema = z.enum([
  'neutral_face',
  'full_body_front',
  'profile_three_quarter',
  'approved_look',
  'action_pose',
]);
export const preparedCharacterSchema = z
  .object({
    elementId: z.string().uuid(),
    revision: z.number().int().positive(),
    preparationSignature: z.string().regex(/^[a-f0-9]{64}$/),
    model: z.literal('gemini-3.1-flash-image'),
    composite: headlessAssetRefSchema,
    panels: z
      .array(z.object({ role: characterPanelRoleSchema, description: detail }).strict())
      .length(5),
    motionReference: headlessAssetRefSchema.nullable(),
    approved: z.boolean(),
    /** Whether the five panels show one uncropped person; absent on packs made before the check. */
    consistency: z
      .object({ verdict: z.enum(['pass', 'fail']), issues: z.array(detail).max(8) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const roles = value.panels.map((panel) => panel.role);
    if (new Set(roles).size !== characterPanelRoleSchema.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['panels'],
        message: 'Every character panel role is required exactly once',
      });
    }
  });
export type PreparedCharacter = z.infer<typeof preparedCharacterSchema>;

export const elementBindingSchema = z
  .object({
    id: z.string().min(1),
    elementId: z.string().uuid(),
    revision: z.number().int().positive(),
    kind: z.enum(['character', 'scene', 'product']),
    variantId: z.string().min(1).nullable(),
    overrides: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const headlessShotSchema = z
  .object({
    id: z.string().min(1),
    subject: z.enum(['person', 'product', 'scene']).default('person'),
    characterBindingId: z.string().min(1).optional(),
    sceneBindingId: z.string().min(1),
    productUses: z
      .array(
        z
          .object({
            bindingId: z.string().min(1),
            mode: z.enum(['overlay', 'in_scene', 'both']),
            interaction: detail,
          })
          .strict(),
      )
      .max(8),
    captureRig: z
      .object({
        operator: detail,
        position: detail,
        framing: detail,
        motion: detail,
        audioPerspective: detail,
      })
      .strict(),
    // Wider than `detail`: the authored style carries the agent's `/slug` shortcut
    // fragments and the brand-book direction line (agentReel.ts), ~150–200 chars each.
    visualStyle: z.string().trim().min(1).max(1600).optional(),
    performance: z
      .object({
        action: detail,
        bodyPositions: z.array(detail).min(1).max(12),
        timing: detail,
        expression: detail,
        dialogue: z.string().max(1200),
        /** A line heard from someone off camera (a street interviewer's question). */
        offCameraLine: z
          .object({
            text: z.string().trim().min(1).max(200),
            voice: detail,
            atSec: z.number().min(0).max(30).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    sound: z
      .object({
        voiceDelivery: detail,
        ambientSource: detail,
        ambientLevel: z.enum(['silent', 'low', 'natural']),
        physicalSounds: z.array(detail).max(6),
        exclude: z.array(detail).max(8),
        continuity: detail,
      })
      .strict()
      .optional(),
    brandUse: z
      .object({
        factRefs: z.array(z.string().uuid()),
        claimRefs: z.array(z.string().uuid()),
        logoInScene: headlessAssetRefSchema.nullable(),
      })
      .strict(),
    continuityFromShotId: z.string().min(1).nullable(),
    approvedStartFrame: headlessAssetRefSchema.nullable(),
    referenceImages: z.array(headlessVisualReferenceSchema).max(2).default([]),
    selectedClip: z
      .object({ asset: headlessAssetRefSchema, durationSec: z.number().positive() })
      .strict()
      .nullable()
      .optional(),
    trimEndSec: z.number().min(0.2).max(60).optional(),
    aspectRatio: z.enum(['9:16', '16:9']),
    resolution: z.enum(['360p', '720p', '1080p']),
    takeVariant: z.number().int().nonnegative().default(0),
  })
  .strict()
  .superRefine((shot, ctx) => {
    if (shot.subject === 'person' && !shot.characterBindingId)
      ctx.addIssue({
        code: 'custom',
        path: ['characterBindingId'],
        message: 'Person shots require a character binding.',
      });
    if (shot.subject !== 'person' && shot.characterBindingId)
      ctx.addIssue({
        code: 'custom',
        path: ['characterBindingId'],
        message: 'Presenter-free shots cannot bind a character.',
      });
    if (shot.subject === 'product' && !shot.productUses.some((use) => use.mode !== 'overlay'))
      ctx.addIssue({
        code: 'custom',
        path: ['productUses'],
        message: 'Product shots require an in-scene product.',
      });
  });
export type HeadlessShot = z.infer<typeof headlessShotSchema>;

export const headlessStoryboardSchema = z
  .object({
    format: detail.optional(),
    grammar: headlessGrammarSchema.optional(),
    throughline: detail,
    beats: z
      .array(
        z
          .object({
            shotId: z.string().min(1),
            /** The beat's job; it sets the clip length and the spoken-word cap. Absent on a
             * single showcase shot and on specs written before roles existed. */
            role: reelShotRoleSchema.optional(),
            /** One keyword of this beat's line, shown giant behind her (Render's display track). */
            displayWord: z.string().trim().min(1).max(40).optional(),
            purpose: detail,
            opening: detail,
            development: detail,
            ending: detail,
            handoff: detail,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const captionTreatmentSchema = z
  .object({
    style: z.enum(['focus_blur', 'paper_notes', 'neon_frame', 'editorial_split']),
    emphasisPhrases: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
    insetAsset: headlessAssetRefSchema.nullable().default(null),
    soundAccents: z.enum(['none', 'subtle']).default('subtle'),
    ctaText: z.string().trim().max(120).nullable().default(null),
  })
  .strict();
export type CaptionTreatment = z.infer<typeof captionTreatmentSchema>;

export const headlessCompositionSchema = z
  .object({
    id: z.string().min(1),
    shotIds: z.array(z.string().min(1)).min(1).max(20),
    cta: z.string().max(400).nullable(),
    logoAsset: headlessAssetRefSchema.nullable(),
    captions: z.boolean(),
    captionPreset: z.enum(['pop', 'pulse', 'glide', 'fusion', 'classic', 'boxed']).optional(),
    captionTreatment: captionTreatmentSchema.optional(),
    presentation: reelPresentationSchema.optional(),
    /** A one-pick Render look, expanded at compose time once every take's length is known.
     * Exclusive with `presentation`; the CTA is `cta` and the packshot is `insetAsset`. */
    template: z
      .object({
        id: reelTemplateIdSchema,
        headline: z.string().trim().min(1).max(60).nullable(),
        accentHex: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .nullable(),
        emphasisPhrases: z.array(z.string().trim().min(1).max(80)).max(12),
      })
      .strict()
      .optional(),
    insetAsset: headlessAssetRefSchema.nullable().optional(),
    /** The effect over the footage (never the type), as resolved when the piece was made. Beside
     * `template` and `presentation`, so either kind of composition can carry one. */
    effect: resolvedEffectSchema.optional(),
    /** A stylised packshot cutaway over the start of one shot's picture; its voice keeps playing. */
    productHero: z
      .object({
        shotId: z.string().min(1),
        displayWord: z.string().trim().min(1).max(40).nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    /** A full-screen type card over the start of one shot's picture; its voice keeps playing. */
    typeCard: z
      .object({
        shotId: z.string().min(1),
        title: z.string().trim().min(1).max(60),
        lines: z.array(z.string().trim().min(1).max(80)).max(5),
      })
      .strict()
      .nullable()
      .optional(),
    output: z
      .object({
        width: z.number().int().min(360).max(3840),
        height: z.number().int().min(360).max(3840),
        fps: z.number().int().min(24).max(60),
      })
      .strict()
      .optional(),
    captionLanguage: z.string().min(2).max(12).nullable().optional(),
    audioBed: z
      .object({ asset: headlessAssetRefSchema, volume: z.number().min(0).max(1) })
      .strict()
      .nullable()
      .optional(),
    productOverlays: z
      .array(
        z
          .object({
            productBindingId: z.string().min(1),
            asset: headlessAssetRefSchema,
            position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']),
            scale: z.number().positive().max(1),
            startSec: z.number().nonnegative().nullable(),
            endSec: z.number().positive().nullable(),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export const headlessContentSpecSchema = z
  .object({
    contentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    revision: z.number().int().positive(),
    schemaVersion: z.literal(1),
    generationContext: optimizerGenerationContextSchema.optional(),
    target: creativeTargetSchema.optional(),
    templateRef: z
      .object({ contentId: z.string().uuid(), revision: z.number().int().positive() })
      .strict()
      .nullable()
      .optional(),
    templateParameters: z.array(z.string().min(1)).max(30).optional(),
    /** The accepted content this one varies, and the one axis it changes. */
    variationOf: z
      .object({
        contentId: z.string().uuid(),
        revision: z.number().int().positive(),
        axis: headlessVariationAxisSchema,
      })
      .strict()
      .optional(),
    bindings: z.array(elementBindingSchema).max(20),
    storyboard: headlessStoryboardSchema.optional(),
    shots: z.array(headlessShotSchema).min(1).max(100),
    compositions: z.array(headlessCompositionSchema).max(50),
    requestedOutputIds: z.array(z.string().min(1)),
  })
  .strict();
export type HeadlessContentSpec = z.infer<typeof headlessContentSpecSchema>;

export const headlessElementReviewStateSchema = z
  .object({
    revision: headlessElementRevisionSchema.nullable(),
    preparation: preparedCharacterSchema.nullable(),
  })
  .strict();
export type HeadlessElementReviewState = z.infer<typeof headlessElementReviewStateSchema>;
