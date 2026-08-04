// Artifact families and their payloads.
//
// The union is discriminated on `family` rather than being one object of optional
// fields, because the families genuinely disagree about what a good answer looks like.
// A UGC video wants a named capture device and a permitted-imperfection budget; a
// product still life wants a fidelity source and a prop count; a poster wants type
// registers and a print process. Put those in one flat object and every author sees
// forty optional fields, sets six, and the compiler emits a prompt full of defaults
// nobody chose — which is schema maximalism, and it produces worse output than a
// sentence would.
//
// So: a small shared core (in `creative-spec.ts`) plus a payload per family, where
// each payload's REQUIRED fields are the decisions that family cannot be good without.
// Omission is a feature. A type-only flyer has no complexion field to leave blank.

import { z } from 'zod';

import { boundedText, boundedTextArray } from './limits';
import {
  extendedCameraDirectionSchema,
  extendedLightDirectionSchema,
  REALISM_DEVICES,
} from './vocabulary';

/**
 * The fifteen user-facing artifact classes.
 *
 * Frozen in the WP-00 decision note. Ids are kebab-case and singular; the prose labels
 * live in the library package, not here, so a rename of a label is not a contract change.
 */
export const CONTENT_FAMILIES = [
  'campaign-key-visual',
  'product-still-life',
  'editorial-illustration',
  'creator-ugc',
  'carousel-infographic',
  'typography-led',
  'packaging',
  'event-promotion',
  'portrait-character',
  'motion-storyboard',
  'icon-illustration-system',
  'pattern-texture',
  'spatial-environment',
  'brand-identity-exploration',
  'short-form-explainer',
] as const;
export type ContentFamily = (typeof CONTENT_FAMILIES)[number];

/** Families whose output is temporal, so a shot list is required rather than optional. */
export const MOTION_FAMILIES: readonly ContentFamily[] = Object.freeze([
  'motion-storyboard',
  'short-form-explainer',
]);

/** Families that normally carry model-rendered or composited words. */
export const COPY_BEARING_FAMILIES: readonly ContentFamily[] = Object.freeze([
  'typography-led',
  'event-promotion',
  'carousel-infographic',
  'packaging',
  'short-form-explainer',
]);

/* -------------------------------------------------------------------------- */
/*  Shared sub-objects                                                         */
/* -------------------------------------------------------------------------- */

/**
 * How the real product gets into the frame.
 *
 * The most expensive failure this system can produce is a convincing photograph of a
 * product that does not exist — a bottle with the wrong cap, a shoe with an invented
 * logo. `composited-from-reference` exists so a brand can require that the object is
 * never synthesised at all. It is a plan constraint, not a preference.
 */
export const PRODUCT_FIDELITY_MODES = [
  'ai-rendered-freely',
  'ai-rendered-from-reference',
  'composited-from-reference',
] as const;
export type ProductFidelityMode = (typeof PRODUCT_FIDELITY_MODES)[number];

export const RETOUCH_POLICIES = [
  'none-as-captured',
  'dust-and-blemish-only',
  'standard-commercial',
  'full-retouch',
] as const;
export type RetouchPolicy = (typeof RETOUCH_POLICIES)[number];

/**
 * One shot in a temporal sequence.
 *
 * `beatRole` is what stops a shot list becoming a list of pretty frames: every shot has
 * a job in the argument, and a sequence with three `hook` shots and no `payoff` is a
 * structural failure a validator can catch before anything is rendered.
 */
export const SHOT_BEAT_ROLES = [
  'hook',
  'lead',
  'context',
  'demonstration',
  'proof',
  'objection',
  'turn',
  'payoff',
  'call-to-action',
  'loop-close',
] as const;
export type ShotBeatRole = (typeof SHOT_BEAT_ROLES)[number];

export const SHOT_TRANSITIONS = [
  'hard-cut',
  'match-cut',
  'whip-pan',
  'graphic-wipe',
  'cross-dissolve',
  'jump-cut',
  'none-continuous',
] as const;
export type ShotTransition = (typeof SHOT_TRANSITIONS)[number];

/**
 * A shot states its camera and light in the SAME shape a scene direction does.
 *
 * The alternative — a flat `lensBand`/`movement`/`lightingSetup` trio here — would be a
 * third spelling of the camera decision alongside `SceneDirection.camera`, and a shot
 * list whose vocabulary differs from the still it was cut from cannot be checked against
 * it. `camera.framing` carries the shot size, so there is no separate size field.
 */
export const shotSchema = z
  .object({
    index: z.number().int().min(1).max(60),
    beatRole: z.enum(SHOT_BEAT_ROLES),
    /** Capped at 30s because a single shot longer than that is a scene, not a shot. */
    durationMs: z.number().int().min(300).max(30_000),
    subjectAction: boundedText(3, 300),
    camera: extendedCameraDirectionSchema,
    light: extendedLightDirectionSchema,
    transitionIn: z.enum(SHOT_TRANSITIONS),
    /** Words burned on screen for this shot. Empty means none — never means "decide". */
    onScreenText: boundedTextArray(1, 120).max(4),
    audioCue: boundedText(1, 200).nullable(),
  })
  .strict()
  .refine((shot) => shot.camera.movement !== null && shot.camera.movement !== undefined, {
    message: 'a shot must state its camera movement; locked-off is a choice, not an absence',
    path: ['camera', 'movement'],
  });
export type Shot = z.infer<typeof shotSchema>;

export const shotListSchema = z
  .array(shotSchema)
  .min(1)
  .max(40)
  .superRefine((shots, ctx) => {
    const indices = shots.map((shot) => shot.index);
    if (new Set(indices).size !== indices.length) {
      ctx.addIssue({ code: 'custom', message: 'shot indices must be unique' });
    }
    if (!shots.some((shot) => shot.beatRole === 'hook')) {
      ctx.addIssue({ code: 'custom', message: 'a sequence must open on a hook shot' });
    }
  });

/* -------------------------------------------------------------------------- */
/*  Family payloads                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Product still life — the WP-00 vertical slice.
 *
 * Required fields are the ones a packshot is bad without: what the object actually is,
 * how faithfully it must be reproduced, what it sits on, and how many other things are
 * allowed in frame. `propBudget` is required and capped low on purpose — "many
 * decorative elements with no compositional role" is one of the named slop properties,
 * and an unbounded prop list is how you get it.
 */
export const productStillLifePayloadSchema = z
  .object({
    family: z.literal('product-still-life'),
    productName: boundedText(1, 160),
    fidelity: z.enum(PRODUCT_FIDELITY_MODES),
    surface: boundedText(3, 200),
    /** Objects in frame besides the product. Zero is a legitimate and common answer. */
    propBudget: z.number().int().min(0).max(6),
    props: boundedTextArray(1, 120).max(6),
    retouch: z.enum(RETOUCH_POLICIES),
    /** True when the product's own material behaviour is the subject of the image. */
    materialIsTheSubject: z.boolean(),
    scaleCue: boundedText(1, 200).nullable(),
  })
  .strict()
  .refine((payload) => payload.props.length <= payload.propBudget, {
    message: 'props exceed the declared prop budget',
    path: ['props'],
  });

/**
 * Creator/UGC — the contrast family, and the one the anti-polish axis exists for.
 *
 * `permittedImperfections` is required and must be non-empty. A UGC brief with no
 * imperfections is not UGC; it is a studio advertisement of a person holding a phone,
 * which is exactly the failure mode this family is meant to prevent. The floor of one
 * is the schema refusing to let the family be requested in name only.
 */
export const creatorUgcPayloadSchema = z
  .object({
    family: z.literal('creator-ugc'),
    creatorArchetype: boundedText(3, 200),
    captureDevice: z.enum([
      'front-facing-phone',
      'rear-phone-handheld',
      'phone-on-tripod',
      'webcam',
      'action-camera',
      'older-camcorder',
    ]),
    setting: boundedText(3, 200),
    /** Real rooms are not tidy. Required, minimum one — see the doc comment above. */
    permittedImperfections: z.array(z.enum(REALISM_DEVICES)).min(1).max(8),
    speaksToCamera: z.boolean(),
    /** What the first frame must show to stop a thumb. Required — a UGC asset with no hook is inert. */
    hookFrame: boundedText(3, 300),
    productInUse: z.boolean(),
    disclosureRequired: z.boolean(),
  })
  .strict();

/**
 * Event promotion — the poster family, where exact copy is normal rather than exceptional.
 *
 * `typeRegisters` defaults to the poster law: two sizes, one enormous and one small.
 * Three or more registers is the most common way a poster loses its hierarchy, so the
 * cap is deliberately tight.
 */
export const eventPromotionPayloadSchema = z
  .object({
    family: z.literal('event-promotion'),
    eventKind: boundedText(1, 120),
    printFormat: z.enum(['A1', 'A2', 'A3', 'A4', 'digital-only', 'custom']),
    printProcess: z.enum([
      'offset-litho',
      'screenprint',
      'risograph',
      'photocopy',
      'inkjet',
      'digital-native',
    ]),
    typeRegisters: z.number().int().min(1).max(3),
    /** Barcodes, spec blocks, stamps, edition marks — the small functional furniture. */
    ephemera: boundedTextArray(1, 120).max(8),
    /** True when the artefact should read as a scanned physical object rather than a file. */
    presentAsScan: z.boolean(),
  })
  .strict();

export const typographyLedPayloadSchema = z
  .object({
    family: z.literal('typography-led'),
    statement: boundedText(1, 400),
    letterformRole: z.enum([
      'type-only',
      'image-inside-type',
      'type-over-image',
      'type-weaves-with-subject',
      'type-as-object',
    ]),
    typeRegisters: z.number().int().min(1).max(3),
    legibilityFloor: z.enum(['must-read-at-thumbnail', 'must-read-at-arms-length', 'expressive']),
  })
  .strict();

export const shortFormExplainerPayloadSchema = z
  .object({
    family: z.literal('short-form-explainer'),
    /** Capped at 180s — beyond that it is not short form and the beat grammar stops applying. */
    totalDurationMs: z.number().int().min(3_000).max(180_000),
    shots: shotListSchema,
    /** An explicitly opened promise that a later beat pays off. Null when the piece does not loop. */
    openLoop: boundedText(3, 300).nullable(),
    captionsBurnedIn: z.boolean(),
    aspectRatio: z.enum(['9:16', '1:1', '4:5', '16:9']),
  })
  .strict();

export const motionStoryboardPayloadSchema = z
  .object({
    family: z.literal('motion-storyboard'),
    totalDurationMs: z.number().int().min(1_000).max(600_000),
    shots: shotListSchema,
    /** What must stay identical across every shot — the continuity contract. */
    continuityLocks: boundedTextArray(1, 200).max(10),
    aspectRatio: z.enum(['9:16', '1:1', '4:5', '16:9', '2.39:1']),
  })
  .strict();

export const carouselInfographicPayloadSchema = z
  .object({
    family: z.literal('carousel-infographic'),
    slideCount: z.number().int().min(2).max(20),
    /** The system every slide shares, stated once rather than repeated per slide. */
    sharedSystem: boundedText(3, 400),
    /** What changes slide to slide. This is the delta, not a re-description. */
    perSlideDelta: boundedText(3, 400),
    argument: z.enum([
      'explainer',
      'framework-list',
      'timeline',
      'comparison',
      'myth-fact',
      'process',
      'case-study',
      'data-story',
    ]),
    hasResolutionSlide: z.boolean(),
  })
  .strict();

export const portraitCharacterPayloadSchema = z
  .object({
    family: z.literal('portrait-character'),
    subjectKind: z.enum(['real-person', 'invented-person', 'mascot', 'recurring-character']),
    /** Everything that must not drift across a set. Required for recurring subjects. */
    identityLocks: boundedTextArray(1, 200).max(12),
    wardrobe: boundedText(1, 300).nullable(),
    expression: boundedText(1, 200),
    /** Rights basis. Required whenever the subject is a real person — see `refine`. */
    consentBasis: boundedText(1, 300).nullable(),
  })
  .strict()
  .refine((payload) => payload.subjectKind !== 'real-person' || !!payload.consentBasis, {
    message: 'a real-person portrait must record a consent basis',
    path: ['consentBasis'],
  });

export const campaignKeyVisualPayloadSchema = z
  .object({
    family: z.literal('campaign-key-visual'),
    campaignIdea: boundedText(3, 400),
    adaptationSet: z
      .array(z.enum(['1:1', '4:5', '9:16', '16:9']))
      .min(1)
      .max(4),
    productPresence: z.enum(['hero', 'supporting', 'absent']),
  })
  .strict();

export const editorialIllustrationPayloadSchema = z
  .object({
    family: z.literal('editorial-illustration'),
    /** The single argument the image makes. An illustration with two is a diagram. */
    metaphor: boundedText(3, 400),
    medium: z.enum([
      'hand-drawn',
      'cut-paper-collage',
      'geometric-vector',
      'photo-collage',
      'painterly',
      'mixed-media',
    ]),
    abstractionLevel: z.enum(['literal', 'stylised', 'symbolic', 'abstract']),
  })
  .strict();

export const packagingPayloadSchema = z
  .object({
    family: z.literal('packaging'),
    packFormat: boundedText(1, 160),
    view: z.enum(['front-panel', 'dieline-flat', 'three-quarter', 'shelf-context', 'pack-family']),
    material: boundedText(1, 200),
    finish: boundedText(1, 200),
    /** Zones that legally must remain legible and unobstructed. */
    regulatoryZones: boundedTextArray(1, 160).max(8),
  })
  .strict();

export const iconIllustrationSystemPayloadSchema = z
  .object({
    family: z.literal('icon-illustration-system'),
    assetCount: z.number().int().min(2).max(48),
    /** Geometry the whole set shares. Without it a "system" is just a pile of drawings. */
    sharedGeometry: boundedText(3, 300),
    strokeBehaviour: boundedText(1, 200),
    gridSize: z.number().int().min(8).max(512).nullable(),
  })
  .strict();

export const patternTexturePayloadSchema = z
  .object({
    family: z.literal('pattern-texture'),
    repeatKind: z.enum(['seamless-tile', 'half-drop', 'brick', 'scattered', 'non-repeating-field']),
    motifs: boundedTextArray(1, 120).min(1).max(10),
    scaleIntent: boundedText(1, 200),
  })
  .strict();

export const spatialEnvironmentPayloadSchema = z
  .object({
    family: z.literal('spatial-environment'),
    spaceKind: boundedText(1, 160),
    /** Whether people appear, which is what makes the scale readable. */
    humanScale: z.enum(['none', 'implied', 'people-present']),
    materials: boundedTextArray(1, 120).max(10),
    signagePresent: z.boolean(),
  })
  .strict();

export const brandIdentityExplorationPayloadSchema = z
  .object({
    family: z.literal('brand-identity-exploration'),
    markKind: z.enum([
      'wordmark',
      'monogram',
      'symbol-plus-wordmark',
      'emblem',
      'responsive-system',
      'app-icon',
    ]),
    conceptRoute: boundedText(3, 400),
    /**
     * Exploration only. Final vector construction is deterministic and human-approved,
     * so a generated mark is never presented as a finished asset.
     */
    isExplorationOnly: z.literal(true),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  The union                                                                  */
/* -------------------------------------------------------------------------- */

export const familyPayloadSchema = z.discriminatedUnion('family', [
  campaignKeyVisualPayloadSchema,
  productStillLifePayloadSchema,
  editorialIllustrationPayloadSchema,
  creatorUgcPayloadSchema,
  carouselInfographicPayloadSchema,
  typographyLedPayloadSchema,
  packagingPayloadSchema,
  eventPromotionPayloadSchema,
  portraitCharacterPayloadSchema,
  motionStoryboardPayloadSchema,
  iconIllustrationSystemPayloadSchema,
  patternTexturePayloadSchema,
  spatialEnvironmentPayloadSchema,
  brandIdentityExplorationPayloadSchema,
  shortFormExplainerPayloadSchema,
]);
export type FamilyPayload = z.infer<typeof familyPayloadSchema>;

export type ProductStillLifePayload = z.infer<typeof productStillLifePayloadSchema>;
export type CreatorUgcPayload = z.infer<typeof creatorUgcPayloadSchema>;
export type EventPromotionPayload = z.infer<typeof eventPromotionPayloadSchema>;
export type ShortFormExplainerPayload = z.infer<typeof shortFormExplainerPayloadSchema>;
export type MotionStoryboardPayload = z.infer<typeof motionStoryboardPayloadSchema>;
