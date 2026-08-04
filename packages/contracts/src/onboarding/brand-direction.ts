// Brand Book v2 — creative direction as reviewable, attributable RULES.
//
// v1 knows what colours and fonts a brand OWNS. It knows nothing about how the brand
// BEHAVES visually, and the one field that was supposed to carry that — `imagery` —
// is null by construction: `extractBrandTokens` hard-codes `imagery: null`, there is no
// production writer, and `brand-md.test.ts` asserts the null. The only way a brand ever
// gets visual direction today is a human hand-typing YAML into a textarea.
//
// Filling that gap with more free strings would make things worse, not better. The
// failure the whole program exists to prevent is a model-inferred guess acting with the
// authority of a brand law — a scraped adjective silently becoming "the generation MUST
// comply". So every statement of visual behaviour here carries, as a mandatory envelope:
// where it came from, how confident that source was, whether a HUMAN approved it, how
// hard it binds, and whether anything can actually CHECK it. A rule that cannot answer
// those five questions is not a rule; it is a mood.
//
// Three invariants do the load-bearing work, and they are deliberately redundant:
//
//   R2  a model-inferred rule can NEVER be approved in a single write. Promotion is a
//       human re-authoring it, not a confidence threshold. There is no auto-approve.
//   R3  only an approved rule may be `hard`.
//   R4  only an evaluable rule may be `hard` — a hard rule the bench cannot judge is
//       not a hard rule, it is a wish with a stern voice.
//
// The type system is the second layer (see `asApprovedRule`), and a DB check constraint
// is the third. One layer is one point of failure.
//
// Scope note: this module is ADDITIVE. `brandMdTokensSchema`, `extractBrandTokens`,
// `renderForcedBrandBlock` and `buildMediaBrandGrounding` are untouched, so a brand that
// hand-authored `imagery` gets a byte-identical prompt block before and after.
//
// Vocabulary note: enums the frozen `creative-system` module already owns are IMPORTED,
// never redeclared — polish, slop signatures, families, camera movement, transitions,
// lens bands, retouch, durable asset refs and reference roles all have exactly one home.
// Where this module needs a decision `creative-system` does not yet model, it declares it
// here under a `BRAND_` prefix so a future collision is visible rather than silent.

import { z } from 'zod';
import { CONTENT_FAMILIES, RETOUCH_POLICIES, SHOT_TRANSITIONS } from '../creative-system/families';
import {
  durableAssetRefSchema,
  IDENTITY_PRESERVING_ROLES,
  REFERENCE_ROLES,
} from '../creative-system/references';
import {
  CAMERA_MOVEMENTS,
  comparePolish,
  LENS_BANDS,
  POLISH_LEVELS,
  type PolishLevel,
  SLOP_SIGNATURES,
} from '../creative-system/vocabulary';
import type { BrandMdTokens } from './brand-md';

/* -------------------------------------------------------------------------- */
/*  Shared enums                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How hard a rule binds.
 *
 * This single field is the difference between "the compiler blocks and explains" and
 * "the compiler complies and records an override" for the SAME brand value against the
 * SAME user intent. Fixtures CF-03 / CF-03b exist to hold that distinction still.
 */
export const BRAND_RULE_STRENGTHS = ['hard', 'strong-preference', 'default'] as const;
export type BrandRuleStrength = (typeof BRAND_RULE_STRENGTHS)[number];
export const brandRuleStrengthEnum = z.enum(BRAND_RULE_STRENGTHS);

export const BRAND_RULE_PROVENANCES = [
  'approved-by-user',
  'extracted-from-source',
  'inferred-by-model',
  'proposed-from-performance',
] as const;
export type BrandRuleProvenance = (typeof BRAND_RULE_PROVENANCES)[number];
export const brandRuleProvenanceEnum = z.enum(BRAND_RULE_PROVENANCES);

/**
 * The only two provenances an approved rule may carry (invariant R2).
 *
 * A model proposal and a performance observation are evidence, not authority. Promoting
 * one means a human re-authors it as `approved-by-user` with `supersedes: [originalId]`;
 * the original moves to `retired`. There is deliberately no confidence threshold that
 * short-circuits that, because a threshold is how "inferred" quietly becomes "approved".
 */
export const APPROVABLE_PROVENANCES: readonly BrandRuleProvenance[] = Object.freeze([
  'approved-by-user',
  'extracted-from-source',
]);

export const BRAND_RULE_APPROVAL_STATES = ['approved', 'proposed', 'rejected', 'retired'] as const;
export type BrandRuleApprovalState = (typeof BRAND_RULE_APPROVAL_STATES)[number];
export const brandRuleApprovalStateEnum = z.enum(BRAND_RULE_APPROVAL_STATES);

/**
 * Who or what can judge whether the rule was honoured.
 *
 * `human-only` is permitted so a brand can record a genuinely subjective law, but such a
 * rule may never be `hard` (R4). An unevaluable hard rule produces a gate that always
 * passes, which is worse than no gate — it looks like coverage.
 */
export const BRAND_RULE_OBSERVABILITIES = ['deterministic', 'vision-judge', 'human-only'] as const;
export type BrandRuleObservability = (typeof BRAND_RULE_OBSERVABILITIES)[number];
export const brandRuleObservabilityEnum = z.enum(BRAND_RULE_OBSERVABILITIES);

/**
 * The thirteen typed pieces. Twelve are authorable; `unclassified-direction` is the
 * migration landing zone and is never resolvable into an authoritative bucket.
 */
export const BRAND_DIRECTION_PIECES = [
  'visual-thesis',
  'composition',
  'typography-behaviour',
  'colour-behaviour',
  'photography',
  'illustration-graphic',
  'motion',
  'people-characters',
  'product-world',
  'brand-integration',
  'brand-signature',
  'prohibition',
  'unclassified-direction',
] as const;
export type BrandDirectionPiece = (typeof BRAND_DIRECTION_PIECES)[number];
export const brandDirectionPieceEnum = z.enum(BRAND_DIRECTION_PIECES);

/** The family vocabulary has exactly one home: `creative-system/families`. */
export const brandDirectionFamilyEnum = z.enum(CONTENT_FAMILIES);

export const BRAND_DIRECTION_MEDIA_KINDS = ['still', 'motion', 'sequence'] as const;
export type BrandDirectionMediaKind = (typeof BRAND_DIRECTION_MEDIA_KINDS)[number];

/**
 * A communication mechanism id.
 *
 * The closed mechanism vocabulary is owned by the creative-system corpus and has not
 * landed. Declaring a second copy here is precisely the drift this program forbids, so
 * the field validates SHAPE (a kebab-case id) and is narrowed to the enum when it lands.
 */
const mechanismIdSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'mechanism ids are kebab-case');

const hexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected a #rrggbb hex colour');

const shareSchema = z.number().min(0).max(1);

/* -------------------------------------------------------------------------- */
/*  The 17-field rule envelope                                                 */
/* -------------------------------------------------------------------------- */

export const BRAND_RULE_SOURCE_KINDS = [
  'brand-md',
  'uploaded-document',
  'library-asset',
  'website-scan',
  'performance-window',
  'manual',
] as const;
export type BrandRuleSourceKind = (typeof BRAND_RULE_SOURCE_KINDS)[number];

export const brandRuleSourceVersionSchema = z
  .object({
    kind: z.enum(BRAND_RULE_SOURCE_KINDS),
    /** Document id, storage path, url or asset id — whatever names the source durably. */
    ref: z.string().min(1).max(400),
    versionId: z.string().min(1).max(120).nullable().default(null),
    capturedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type BrandRuleSourceVersion = z.infer<typeof brandRuleSourceVersionSchema>;

export const brandRuleApplicabilitySchema = z
  .object({
    families: z.union([
      z.literal('all'),
      z.array(brandDirectionFamilyEnum).min(1).max(CONTENT_FAMILIES.length),
    ]),
    /** Exclusion beats inclusion, so `families: 'all'` minus one family is expressible. */
    excludedFamilies: z.array(brandDirectionFamilyEnum).max(CONTENT_FAMILIES.length).default([]),
    mediaKinds: z
      .array(z.enum(BRAND_DIRECTION_MEDIA_KINDS))
      .min(1)
      .default([...BRAND_DIRECTION_MEDIA_KINDS]),
    /** Empty means every channel. A non-empty list must intersect the plan's channels. */
    channels: z.array(z.string().min(1).max(40)).max(12).default([]),
  })
  .strict();
export type BrandRuleApplicability = z.infer<typeof brandRuleApplicabilitySchema>;

const brandRuleEnvelopeShape = {
  /** Stable and deterministic for migrated rules, so re-running a migration inserts nothing. */
  id: z.string().min(8).max(120),
  applicability: brandRuleApplicabilitySchema,
  strength: brandRuleStrengthEnum,
  provenance: brandRuleProvenanceEnum,
  confidence: z.number().min(0).max(1),
  approvalState: brandRuleApprovalStateEnum,
  sourceVersion: brandRuleSourceVersionSchema,
  observability: brandRuleObservabilityEnum,
  /** The "why", surfaced in the editor so a rule can be argued with rather than obeyed. */
  rationale: z.string().min(1).max(400).nullable().default(null),
  supersedes: z.array(z.string().min(1).max(120)).max(8).default([]),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  approvedBy: z.string().uuid().nullable().default(null),
  approvedAt: z.iso.datetime({ offset: true }).nullable().default(null),
  lastAppliedAt: z.iso.datetime({ offset: true }).nullable().default(null),
} as const;

/* -------------------------------------------------------------------------- */
/*  P1 visual-thesis                                                           */
/* -------------------------------------------------------------------------- */

export const visualThesisValueSchema = z
  .object({
    statement: z.string().min(1).max(280),
    businessLink: z.string().min(1).max(280).nullable().default(null),
    /** Executable implications, not adjectives. Five is a thesis; twelve is a wish list. */
    visualConsequences: z.array(z.string().min(1).max(200)).max(5).default([]),
    notThis: z.array(z.string().min(1).max(200)).max(5).default([]),
  })
  .strict();
export type VisualThesisValue = z.infer<typeof visualThesisValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P2 composition                                                             */
/* -------------------------------------------------------------------------- */

export const BRAND_HIERARCHY_PATTERNS = [
  'single-dominant',
  'dual-anchor',
  'modular-grid',
  'route-path',
  'field',
  'ledger',
] as const;
export const BRAND_DENSITIES = ['sparse', 'measured', 'dense', 'saturated'] as const;
export const BRAND_NEGATIVE_SPACE_BEHAVIOURS = [
  'generous-margins',
  'active-void',
  'edge-to-edge',
  'framed',
] as const;
export const BRAND_GRID_TENDENCIES = ['strict-column', 'modular', 'optical', 'freeform'] as const;
export const BRAND_CROP_BEHAVIOURS = [
  'full-subject',
  'considered-crop',
  'extreme-crop',
  'bleed',
] as const;
export const BRAND_SCALE_CONTRASTS = ['flat', 'moderate', 'collision'] as const;
export const BRAND_SYMMETRIES = ['symmetric', 'asymmetric', 'mixed'] as const;

export const compositionValueSchema = z
  .object({
    hierarchyPattern: z.enum(BRAND_HIERARCHY_PATTERNS),
    density: z.enum(BRAND_DENSITIES),
    negativeSpaceBehaviour: z.enum(BRAND_NEGATIVE_SPACE_BEHAVIOURS),
    gridTendency: z.enum(BRAND_GRID_TENDENCIES),
    cropBehaviour: z.enum(BRAND_CROP_BEHAVIOURS),
    scaleContrast: z.enum(BRAND_SCALE_CONTRASTS),
    symmetry: z.enum(BRAND_SYMMETRIES),
    layering: z
      .object({
        overlapAllowed: z.boolean(),
        maxLayers: z.number().int().min(1).max(6),
        subjectOverType: z.boolean(),
      })
      .strict(),
    repeatedMechanisms: z.array(mechanismIdSchema).max(6).default([]),
    safeAreaPolicy: z
      .object({
        respectPlatformSafeAreas: z.boolean(),
        reservedZones: z
          .array(
            z
              .object({ zone: z.string().min(1).max(60), purpose: z.string().min(1).max(120) })
              .strict(),
          )
          .max(4)
          .default([]),
      })
      .strict(),
  })
  .strict();
export type CompositionValue = z.infer<typeof compositionValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P3 typography-behaviour                                                    */
/* -------------------------------------------------------------------------- */

export const BRAND_TYPE_ROLES = ['display', 'body', 'functional', 'accent'] as const;
export const BRAND_CASING_POLICIES = [
  'sentence',
  'title',
  'upper',
  'lower',
  'mixed-expressive',
] as const;
export const BRAND_TRACKING_TENDENCIES = ['tight', 'normal', 'open', 'extreme-open'] as const;
export const BRAND_LINE_HEIGHT_TENDENCIES = ['tight', 'normal', 'airy'] as const;
export const BRAND_EXPRESSIVE_TREATMENTS = [
  'outline',
  'stretch',
  'stack',
  'overlap',
  'arc',
  'image-fill',
  'stencil',
  'none',
] as const;
export const BRAND_TYPE_IMAGE_INTERACTIONS = [
  'type-over-image',
  'type-beside-image',
  'image-inside-type',
  'type-only',
  'weave',
] as const;
export const BRAND_EXACT_COPY_SENSITIVITIES = [
  'verbatim-required',
  'paraphrase-allowed',
  'no-copy-in-image',
] as const;

/**
 * What happens when the brand's font is not available to the renderer.
 *
 * This is the field that decides two-stage versus single-generation for a typographic
 * family: `render-no-text` and `composite-in-canvas` both force a compositing step,
 * because a model asked to draw a font it does not have will invent a lookalike and the
 * brand will ship a wordmark it never approved.
 */
export const BRAND_FONT_UNAVAILABLE_FALLBACKS = [
  'substitute-metric-compatible',
  'render-no-text',
  'composite-in-canvas',
] as const;

export const typographyBehaviourValueSchema = z
  .object({
    roleAssignments: z
      .array(
        z
          .object({
            role: z.enum(BRAND_TYPE_ROLES),
            family: z.string().min(1).max(120),
            fallbackFamily: z.string().min(1).max(120).nullable().default(null),
          })
          .strict(),
      )
      .max(6)
      .default([]),
    permittedScaleRegisters: z.number().int().min(1).max(5),
    casingPolicy: z.enum(BRAND_CASING_POLICIES),
    punctuationPolicy: z
      .object({
        terminalPeriods: z.boolean(),
        ampersandUse: z.enum(['ampersand', 'spelled-and', 'either']),
        hyphenationAllowed: z.boolean(),
      })
      .strict(),
    trackingTendency: z.enum(BRAND_TRACKING_TENDENCIES),
    lineHeightTendency: z.enum(BRAND_LINE_HEIGHT_TENDENCIES),
    expressiveTreatments: z.array(z.enum(BRAND_EXPRESSIVE_TREATMENTS)).max(8).default([]),
    typeImageInteraction: z.enum(BRAND_TYPE_IMAGE_INTERACTIONS),
    exactCopySensitivity: z.enum(BRAND_EXACT_COPY_SENSITIVITIES),
    forbiddenTypeTropes: z.array(z.string().min(1).max(160)).max(10).default([]),
    fontUnavailableFallback: z.enum(BRAND_FONT_UNAVAILABLE_FALLBACKS),
    legibilityFloor: z
      .object({
        minCapHeightPctOfShortEdge: z.number().min(0).max(100),
        minContrastRatio: z.number().min(1).max(21),
      })
      .strict(),
  })
  .strict();
export type TypographyBehaviourValue = z.infer<typeof typographyBehaviourValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P4 colour-behaviour                                                        */
/* -------------------------------------------------------------------------- */

export const BRAND_COLOUR_ROLES = ['dominant', 'support', 'accent', 'surface', 'ink'] as const;
export const BRAND_CAMPAIGN_ACCENT_MODES = [
  'forbidden',
  'preapproved-list',
  'any-with-approval',
] as const;
export const BRAND_COLOUR_SUBSTITUTES = ['none', 'texture', 'light', 'material'] as const;
export const BRAND_SATURATION_POLICIES = [
  'muted',
  'natural',
  'elevated',
  'fluorescent-permitted',
] as const;

export const colourBehaviourValueSchema = z
  .object({
    roleRatios: z
      .array(
        z
          .object({
            role: z.enum(BRAND_COLOUR_ROLES),
            minShare: shareSchema,
            maxShare: shareSchema,
          })
          .strict()
          .refine((ratio) => ratio.minShare <= ratio.maxShare, {
            message: 'minShare must not exceed maxShare',
            path: ['minShare'],
          }),
      )
      .max(6)
      .default([]),
    backgroundSurfacePairs: z
      .array(
        z
          .object({
            background: hexColourSchema,
            surface: hexColourSchema,
            note: z.string().min(1).max(200).nullable().default(null),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    /** WCAG-style ratio. 1 is "no requirement"; 21 is black on white. */
    contrastFloor: z.number().min(1).max(21),
    prohibitedPairings: z
      .array(
        z
          .object({ a: hexColourSchema, b: hexColourSchema, reason: z.string().min(1).max(200) })
          .strict(),
      )
      .max(12)
      .default([]),
    campaignAccentPolicy: z
      .object({
        mode: z.enum(BRAND_CAMPAIGN_ACCENT_MODES),
        allowed: z.array(hexColourSchema).max(8).default([]),
        maxShare: shareSchema,
      })
      .strict(),
    substituteForColour: z.enum(BRAND_COLOUR_SUBSTITUTES),
    neutralPolicy: z
      .object({
        allowed: z.array(hexColourSchema).max(6).default([]),
        roleLimit: z.enum(['support-only', 'any']),
      })
      .strict(),
    saturationPolicy: z.enum(BRAND_SATURATION_POLICIES),
  })
  .strict();
export type ColourBehaviourValue = z.infer<typeof colourBehaviourValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P5 photography                                                             */
/* -------------------------------------------------------------------------- */

export const BRAND_POINTS_OF_VIEW = [
  'observer',
  'participant',
  'overhead',
  'eye-level',
  'low-hero',
] as const;
/**
 * Subject distance, which `LENS_BANDS` deliberately does not encode — a macro lens and a
 * wide shot of a small object are different decisions about the same subject.
 */
export const BRAND_CAMERA_DISTANCES = [
  'macro',
  'close',
  'medium',
  'wide',
  'environmental',
] as const;
export const BRAND_ANGLE_TENDENCIES = [
  'frontal',
  'three-quarter',
  'profile',
  'dutch',
  'top-down',
] as const;
export const BRAND_LIGHT_KEYS = ['hard', 'soft', 'direct-flash', 'available', 'mixed'] as const;
export const BRAND_REALISM_MODES = ['documented-real', 'constructed-studio', 'hybrid'] as const;
export const BRAND_MOVEMENT_GESTURES = [
  'still',
  'natural-motion',
  'strobe-frozen',
  'long-shutter-drag',
] as const;
export const BRAND_GRAIN_LEVELS = ['none', 'fine', 'coarse'] as const;
export const BRAND_IDENTITY_PRESERVATIONS = [
  'strict',
  'family-resemblance',
  'unconstrained',
] as const;

export const photographyValueSchema = z
  .object({
    subjectMatter: z.array(z.string().min(1).max(160)).max(10).default([]),
    pointOfView: z.enum(BRAND_POINTS_OF_VIEW),
    /** A summary only — the enforceable casting detail lives in `people-characters`. */
    castingSummary: z.string().min(1).max(240).nullable().default(null),
    cameraDistance: z.enum(BRAND_CAMERA_DISTANCES),
    lensCharacter: z.enum(LENS_BANDS),
    angleTendency: z.enum(BRAND_ANGLE_TENDENCIES),
    lightingLogic: z
      .object({
        key: z.enum(BRAND_LIGHT_KEYS),
        direction: z.string().min(1).max(120),
        shadowBehaviour: z.string().min(1).max(160),
        note: z.string().min(1).max(200).nullable().default(null),
      })
      .strict(),
    realismMode: z.enum(BRAND_REALISM_MODES),
    movementGesture: z.enum(BRAND_MOVEMENT_GESTURES),
    environment: z.array(z.string().min(1).max(160)).max(8).default([]),
    props: z
      .object({
        allowed: z.array(z.string().min(1).max(120)).max(10).default([]),
        forbidden: z.array(z.string().min(1).max(120)).max(10).default([]),
      })
      .strict(),
    postProcessing: z
      .object({
        grain: z.enum(BRAND_GRAIN_LEVELS),
        halation: z.boolean(),
        colourGrade: z.string().min(1).max(120).nullable().default(null),
        retouchPolicy: z.enum(RETOUCH_POLICIES),
      })
      .strict(),
    /**
     * The ordinal floor a generation may not fall below. Ordinal — not a tag set —
     * because "is this MORE raw than the brand allows?" is only answerable if the steps
     * are ordered. `comparePolish` is the comparison; `violatesPolishFloor` is the test.
     */
    polishFloor: z.enum(POLISH_LEVELS),
    productDepictionRequiresReference: z.boolean(),
    identityPreservation: z.enum(BRAND_IDENTITY_PRESERVATIONS),
  })
  .strict();
export type PhotographyValue = z.infer<typeof photographyValueSchema>;

/** True when the requested polish sits below the brand's approved floor. */
export const violatesPolishFloor = (floor: PolishLevel, requested: PolishLevel): boolean =>
  comparePolish(requested, floor) < 0;

/* -------------------------------------------------------------------------- */
/*  P6 illustration-graphic                                                    */
/* -------------------------------------------------------------------------- */

export const BRAND_ILLUSTRATION_MEDIA = [
  'vector',
  'hand-drawn',
  'cut-paper',
  'collage',
  '3d-render',
  'pixel',
  'woodcut',
  'gouache',
] as const;
export const BRAND_GEOMETRY_ORGANIC_BALANCES = [
  'strict-geometric',
  'geometric-lean',
  'balanced',
  'organic-lean',
  'fully-organic',
] as const;
export const BRAND_PRINT_PROCESSES = [
  'riso',
  'screenprint',
  'halftone',
  'dither',
  'photocopy',
  'offset-misregistration',
  'letterpress',
  'none',
] as const;
export const BRAND_BAN_DETECTORS = ['vision-judge', 'deterministic'] as const;

/**
 * A banned generated-image signature.
 *
 * The `known` arm draws on the frozen `SLOP_SIGNATURES` list so a ban names a target the
 * gate already knows how to look for. The `novel` arm exists because a brand will
 * occasionally see a tell nobody has catalogued yet — but it is the escape hatch, not the
 * default, and a free string is still required to describe something OBSERVABLE.
 */
export const aiSignatureBanSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('known'),
      signature: z.enum(SLOP_SIGNATURES),
      detector: z.enum(BRAND_BAN_DETECTORS),
    })
    .strict(),
  z
    .object({
      kind: z.literal('novel'),
      signature: z.string().min(4).max(160),
      detector: z.enum(BRAND_BAN_DETECTORS),
    })
    .strict(),
]);
export type AiSignatureBan = z.infer<typeof aiSignatureBanSchema>;

export const illustrationGraphicValueSchema = z
  .object({
    allowedMedia: z.array(z.enum(BRAND_ILLUSTRATION_MEDIA)).max(8).default([]),
    markMaking: z.array(z.string().min(1).max(160)).max(8).default([]),
    geometryOrganicBalance: z.enum(BRAND_GEOMETRY_ORGANIC_BALANCES),
    iconBehaviour: z
      .object({
        strokeWidth: z.number().min(0).max(64),
        cornerRadius: z.number().min(0).max(256),
        gridUnit: z.number().int().min(1).max(512),
        fillStyle: z.enum(['outline', 'solid', 'duotone']),
      })
      .strict(),
    diagramStyle: z
      .object({
        connectors: z.enum(['orthogonal', 'curved', 'straight']),
        labelPlacement: z.enum(['inside', 'outside', 'callout']),
        dataInkPolicy: z.enum(['minimal', 'moderate', 'decorative']),
      })
      .strict(),
    printProcesses: z.array(z.enum(BRAND_PRINT_PROCESSES)).max(8).default([]),
    prohibitedStockMotifs: z.array(z.string().min(1).max(160)).max(12).default([]),
    aiSignatureBans: z.array(aiSignatureBanSchema).max(12).default([]),
  })
  .strict();
export type IllustrationGraphicValue = z.infer<typeof illustrationGraphicValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P7 motion                                                                  */
/* -------------------------------------------------------------------------- */

export const BRAND_PACINGS = ['slow-observational', 'measured', 'brisk', 'rapid-cut'] as const;
export const BRAND_TYPE_MOTIONS = ['static', 'fade', 'kinetic', 'mask-reveal', 'none'] as const;
export const BRAND_LOOP_POLICIES = ['none', 'seamless-required', 'seamless-preferred'] as const;
export const BRAND_LOGO_MOTION_BEHAVIOURS = [
  'none',
  'endcard',
  'persistent-bug',
  'reveal',
] as const;

export const motionValueSchema = z
  .object({
    shotDurationMs: z
      .object({
        min: z.number().int().min(100).max(60_000),
        max: z.number().int().min(100).max(60_000),
        typical: z.number().int().min(100).max(60_000),
      })
      .strict()
      .refine((span) => span.min <= span.typical && span.typical <= span.max, {
        message: 'shot duration must satisfy min <= typical <= max',
        path: ['typical'],
      }),
    pacing: z.enum(BRAND_PACINGS),
    cameraMovement: z.array(z.enum(CAMERA_MOVEMENTS)).max(6).default([]),
    transitionGrammar: z.array(z.enum(SHOT_TRANSITIONS)).max(6).default([]),
    typeMotion: z.enum(BRAND_TYPE_MOTIONS),
    continuityRules: z.array(z.string().min(1).max(200)).max(8).default([]),
    soundRelationship: z
      .object({
        musicRole: z.string().min(1).max(160),
        voiceRole: z.string().min(1).max(160),
        sfxPolicy: z.string().min(1).max(160),
        silencePermitted: z.boolean(),
      })
      .strict(),
    introOutro: z
      .object({
        introMs: z.number().int().min(0).max(30_000),
        outroMs: z.number().int().min(0).max(30_000),
        logoBehaviour: z.enum(BRAND_LOGO_MOTION_BEHAVIOURS),
      })
      .strict(),
    loopPolicy: z.enum(BRAND_LOOP_POLICIES),
  })
  .strict();
export type MotionValue = z.infer<typeof motionValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P8 people-characters                                                       */
/* -------------------------------------------------------------------------- */

export const BRAND_SKIN_FIDELITIES = ['documentary-true', 'natural-corrected', 'stylized'] as const;
export const BRAND_POSE_POLICIES = ['candid', 'directed-natural', 'formal', 'heroic'] as const;
export const BRAND_EXPRESSION_POLICIES = ['neutral', 'warm', 'intense', 'range-permitted'] as const;
export const BRAND_GAZE_POLICIES = ['to-camera', 'away', 'mixed'] as const;
export const BRAND_REAL_PERSON_MODES = [
  'no-real-people',
  'consented-asset-only',
  'synthetic-permitted',
] as const;
export const BRAND_STEREOTYPE_DETECTORS = ['vision-judge', 'human'] as const;

export const peopleCharactersValueSchema = z
  .object({
    castingPrinciples: z.array(z.string().min(1).max(200)).max(8).default([]),
    representationRules: z.array(z.string().min(1).max(200)).max(8).default([]),
    skinRenderingFidelity: z.enum(BRAND_SKIN_FIDELITIES),
    stylingSystem: z
      .object({
        wardrobe: z.array(z.string().min(1).max(120)).max(8).default([]),
        accessories: z.array(z.string().min(1).max(120)).max(8).default([]),
        grooming: z.array(z.string().min(1).max(120)).max(6).default([]),
        makeup: z.array(z.string().min(1).max(120)).max(6).default([]),
      })
      .strict(),
    posePolicy: z.enum(BRAND_POSE_POLICIES),
    expressionPolicy: z.enum(BRAND_EXPRESSION_POLICIES),
    gazePolicy: z.enum(BRAND_GAZE_POLICIES),
    identityContinuity: z
      .object({
        required: z.boolean(),
        referenceRole: z.enum(REFERENCE_ROLES),
        toleranceNote: z.string().min(1).max(240).nullable().default(null),
      })
      .strict()
      .refine(
        (continuity) =>
          !continuity.required || IDENTITY_PRESERVING_ROLES.includes(continuity.referenceRole),
        {
          message: 'required identity continuity must bind an identity-preserving reference role',
          path: ['referenceRole'],
        },
      ),
    prohibitedStereotypes: z
      .array(
        z
          .object({
            description: z.string().min(1).max(240),
            detector: z.enum(BRAND_STEREOTYPE_DETECTORS),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    realPersonPolicy: z
      .object({
        mode: z.enum(BRAND_REAL_PERSON_MODES),
        consentEvidenceRef: z.string().min(1).max(400).nullable().default(null),
      })
      .strict(),
  })
  .strict();
export type PeopleCharactersValue = z.infer<typeof peopleCharactersValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P9 product-world                                                           */
/* -------------------------------------------------------------------------- */

export const BRAND_PRODUCT_SCALES = [
  'hero-dominant',
  'in-hand',
  'in-context',
  'incidental',
] as const;
export const BRAND_PRODUCT_ANGLES = [
  'front',
  'three-quarter',
  'side',
  'top-down',
  'hero-low',
  'exploded',
  'cross-section',
] as const;
export const BRAND_PACKAGING_FIDELITIES = [
  'exact-asset-only',
  'structure-exact-copy-editable',
  'conceptual',
] as const;
export const BRAND_LABEL_LEGIBILITIES = [
  'must-be-legible',
  'must-be-illegible',
  'no-label-visible',
] as const;

export const productWorldValueSchema = z
  .object({
    productScale: z.enum(BRAND_PRODUCT_SCALES),
    permittedAngles: z.array(z.enum(BRAND_PRODUCT_ANGLES)).max(8).default([]),
    packagingFidelity: z.enum(BRAND_PACKAGING_FIDELITIES),
    materialsSurfaces: z.array(z.string().min(1).max(160)).max(10).default([]),
    propRules: z
      .object({
        allowed: z.array(z.string().min(1).max(120)).max(10).default([]),
        forbidden: z.array(z.string().min(1).max(120)).max(10).default([]),
      })
      .strict(),
    useContextVsPackshot: z
      .object({
        mode: z.enum(['packshot-only', 'context-only', 'both']),
        contextShare: shareSchema,
      })
      .strict(),
    labelLegibility: z.enum(BRAND_LABEL_LEGIBILITIES),
    /** Things the model must never add to the product — a flavour, a size, a claim. */
    prohibitedInventions: z.array(z.string().min(1).max(160)).max(12).default([]),
    variantSystem: z
      .object({
        attributesFixed: z.array(z.string().min(1).max(120)).max(8).default([]),
        attributesVariable: z.array(z.string().min(1).max(120)).max(8).default([]),
      })
      .strict(),
  })
  .strict();
export type ProductWorldValue = z.infer<typeof productWorldValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P10 brand-integration — the anti-slop lever                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether the image model may draw the mark at all.
 *
 * `composited-from-asset-only` is the single largest anti-slop lever in the system: a
 * hallucinated logo is a hard fail, and no amount of prompt prose reliably prevents one.
 * Declaring it forces the compiler to select a `generate-then-compose` or
 * `deterministic-composition` plan and lay the real asset over the generated field.
 */
export const BRAND_LOGO_RENDER_POLICIES = [
  'composited-from-asset-only',
  'model-may-render-with-reference',
  'no-logo',
] as const;
export type BrandLogoRenderPolicy = (typeof BRAND_LOGO_RENDER_POLICIES)[number];

/**
 * Whether the model may invent the product.
 *
 * `real-reference-required` means a run with no identity-preserving product reference
 * fails compilation rather than generating a convincing photograph of a product that
 * does not exist. Fixture CF-04 is the case that proves it blocks.
 */
export const BRAND_PRODUCT_RENDER_POLICIES = [
  'real-reference-required',
  'model-may-render-from-reference',
  'model-may-invent',
] as const;
export type BrandProductRenderPolicy = (typeof BRAND_PRODUCT_RENDER_POLICIES)[number];

export const BRAND_LOGO_ZONES = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'optical-centre',
  'lockup-with-product',
  'baseline-strip',
] as const;
export const BRAND_FORBIDDEN_LOGO_TREATMENTS = [
  'stretch',
  'rotate',
  'recolour-outside-palette',
  'gradient-fill',
  'drop-shadow',
  'outline',
  'emboss',
  'bevel',
  'on-busy-photo',
  'partial-crop',
  'perspective-warp',
  'texture-overlay',
  'animate-morph',
  'monochrome-inversion',
  'custom',
] as const;
export const BRAND_PACKAGING_TEXT_POLICIES = [
  'verbatim-from-asset',
  'no-legible-text',
  'placeholder-only',
] as const;
export const BRAND_INTEGRATION_MECHANISMS = [
  'foreground-lockup',
  'in-world-placement',
  'surface-application',
  'environmental-signage',
  'none',
] as const;
export const BRAND_VERIFICATION_HOOKS = [
  'logo-pixel-diff',
  'ocr-label-match',
  'reference-composite-required',
  'clear-space-geometry',
  'occurrence-count',
  'human-signoff',
] as const;
export type BrandVerificationHook = (typeof BRAND_VERIFICATION_HOOKS)[number];

/** Hooks that can actually confirm a composited mark landed where the brand said. */
export const LOGO_VERIFYING_HOOKS: readonly BrandVerificationHook[] = Object.freeze([
  'logo-pixel-diff',
  'reference-composite-required',
  'clear-space-geometry',
]);

export const brandIntegrationValueSchema = z
  .object({
    logoRenderPolicy: z.enum(BRAND_LOGO_RENDER_POLICIES),
    /** Durable `{assetId, versionId}` — never a signed URL, which expires and is not reproducible. */
    logoAssetRef: durableAssetRefSchema.nullable().default(null),
    placementLaws: z
      .array(
        z
          .object({ zone: z.enum(BRAND_LOGO_ZONES), priority: z.number().int().min(1).max(6) })
          .strict(),
      )
      .max(6)
      .default([]),
    clearSpace: z
      .object({
        unit: z.enum(['logo-height', 'px', 'percent-of-shortest-edge']),
        multiple: z.number().min(0).max(20),
      })
      .strict(),
    minimumSize: z
      .object({
        unit: z.enum(['px', 'percent-of-shortest-edge']),
        value: z.number().min(0).max(4096),
        contextNote: z.string().min(1).max(200).nullable().default(null),
      })
      .strict(),
    /** Zero is legitimate for a `no-logo` policy; it stops the "logo three times" failure. */
    maxOccurrences: z.number().int().min(0).max(4).default(1),
    forbiddenTreatments: z.array(z.enum(BRAND_FORBIDDEN_LOGO_TREATMENTS)).max(16).default([]),
    coBrandingRules: z
      .object({
        allowed: z.boolean(),
        lockupOrder: z.enum(['brand-first', 'partner-first', 'alphabetical']),
        separatorRule: z.string().min(1).max(160).nullable().default(null),
        partnerMinClearSpace: z.number().min(0).max(20).nullable().default(null),
      })
      .strict(),
    productRenderPolicy: z.enum(BRAND_PRODUCT_RENDER_POLICIES),
    productAssetRefs: z
      .array(
        durableAssetRefSchema
          .extend({ role: z.enum(['geometry', 'packaging', 'material', 'variant']) })
          .strict(),
      )
      .max(12)
      .default([]),
    packagingTextPolicy: z.enum(BRAND_PACKAGING_TEXT_POLICIES),
    signatureMarkBehaviour: z
      .object({
        markId: z.string().min(1).max(120).nullable().default(null),
        whenRequired: z.enum(['always', 'campaign', 'never']),
        frequency: shareSchema,
      })
      .strict(),
    /** How the brand ENTERS the frame, so the compiler does not default to a corner bug. */
    integrationMechanism: z.enum(BRAND_INTEGRATION_MECHANISMS),
    verificationHooks: z.array(z.enum(BRAND_VERIFICATION_HOOKS)).max(6).default([]),
  })
  .strict();
export type BrandIntegrationValue = z.infer<typeof brandIntegrationValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P11 brand-signature                                                        */
/* -------------------------------------------------------------------------- */

export const BRAND_SIGNATURE_FREQUENCY_MODES = ['every', 'campaign-level', 'occasional'] as const;
export type BrandSignatureFrequencyMode = (typeof BRAND_SIGNATURE_FREQUENCY_MODES)[number];

export const brandSignatureValueSchema = z
  .object({
    name: z.string().min(1).max(80),
    mechanism: mechanismIdSchema,
    description: z.string().min(1).max(400),
    frequency: z
      .object({
        mode: z.enum(BRAND_SIGNATURE_FREQUENCY_MODES),
        maxSharePerCampaign: shareSchema,
      })
      .strict(),
    exampleRefs: z.array(durableAssetRefSchema).max(6).default([]),
    /** The guard that stops a signature hardening into a template the brand cannot escape. */
    exhaustionGuard: z
      .object({ enabled: z.boolean(), note: z.string().min(1).max(240).nullable().default(null) })
      .strict(),
  })
  .strict();
export type BrandSignatureValue = z.infer<typeof brandSignatureValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P12 prohibition                                                            */
/* -------------------------------------------------------------------------- */

export const BRAND_PROHIBITION_CATEGORIES = [
  'composition',
  'colour',
  'typography',
  'subject',
  'material',
  'product',
  'logo',
  'people',
  'motion',
  'copy',
] as const;
export type BrandProhibitionCategory = (typeof BRAND_PROHIBITION_CATEGORIES)[number];

export const BRAND_PROHIBITION_DETECTORS = [
  'deterministic-check',
  'vision-judge-rubric',
  'ocr',
  'palette-histogram',
  'geometry-check',
  'human',
] as const;

/**
 * Phrases that describe a feeling rather than a pixel.
 *
 * A ban worded like this with no evaluator behind it is the exact failure the Brand Book
 * is meant to remove — it reads as a rule, renders as a rule, and is enforced by nothing.
 * Paired with `detector: 'human'` it is rejected at parse rather than flagged in review.
 */
const VAGUE_PROHIBITION_RE =
  /\b(ai[- ]?generated|generic|bad|ugly|cheap|tacky|low[- ]quality|soulless)\b/i;

export const prohibitionValueSchema = z
  .object({
    /** An observable failure, not a feeling. "Multi-stop gradient mesh", not "looks cheap". */
    observableFailure: z.string().min(8).max(240),
    category: z.enum(BRAND_PROHIBITION_CATEGORIES),
    detector: z.enum(BRAND_PROHIBITION_DETECTORS),
    /** Shape owned by the evaluator, so this stays a passthrough rather than a fake type. */
    detectorConfig: z.unknown().nullable().default(null),
    severity: z.enum(['reject', 'warn']),
    exampleRefs: z.array(durableAssetRefSchema).max(6).default([]),
    /** What to do INSTEAD, so the compiler can render a positive instruction, not only a ban. */
    replacementGuidance: z.string().min(1).max(240).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.detector === 'human' && VAGUE_PROHIBITION_RE.test(value.observableFailure)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'unevaluable_prohibition: a vague observableFailure needs an evaluator other than `human`',
        path: ['observableFailure'],
      });
    }
  });
export type ProhibitionValue = z.infer<typeof prohibitionValueSchema>;

/* -------------------------------------------------------------------------- */
/*  P13 unclassified-direction — migration landing zone                        */
/* -------------------------------------------------------------------------- */

export const BRAND_LEGACY_IMAGERY_FIELDS = ['creative_direction', 'mood', 'avoid'] as const;
export type BrandLegacyImageryField = (typeof BRAND_LEGACY_IMAGERY_FIELDS)[number];

/**
 * Where a migrated legacy string lands.
 *
 * It exists so a `brand.md` sentence has a typed home in the review queue instead of
 * being force-fitted into a structured piece it does not actually contain. It is never
 * authorable in the editor and never resolvable into an authoritative bucket.
 */
export const unclassifiedDirectionValueSchema = z
  .object({
    text: z.string().min(1).max(300),
    legacyField: z.enum(BRAND_LEGACY_IMAGERY_FIELDS),
    suggestedPiece: brandDirectionPieceEnum.nullable().default(null),
  })
  .strict();
export type UnclassifiedDirectionValue = z.infer<typeof unclassifiedDirectionValueSchema>;

/* -------------------------------------------------------------------------- */
/*  The rule union and its invariants                                          */
/* -------------------------------------------------------------------------- */

const ruleVariant = <P extends BrandDirectionPiece, V extends z.ZodTypeAny>(piece: P, value: V) =>
  z.object({ ...brandRuleEnvelopeShape, piece: z.literal(piece), value });

const brandDirectionRuleUnion = z.discriminatedUnion('piece', [
  ruleVariant('visual-thesis', visualThesisValueSchema),
  ruleVariant('composition', compositionValueSchema),
  ruleVariant('typography-behaviour', typographyBehaviourValueSchema),
  ruleVariant('colour-behaviour', colourBehaviourValueSchema),
  ruleVariant('photography', photographyValueSchema),
  ruleVariant('illustration-graphic', illustrationGraphicValueSchema),
  ruleVariant('motion', motionValueSchema),
  ruleVariant('people-characters', peopleCharactersValueSchema),
  ruleVariant('product-world', productWorldValueSchema),
  ruleVariant('brand-integration', brandIntegrationValueSchema),
  ruleVariant('brand-signature', brandSignatureValueSchema),
  ruleVariant('prohibition', prohibitionValueSchema),
  ruleVariant('unclassified-direction', unclassifiedDirectionValueSchema),
]);

type BrandDirectionRuleShape = z.infer<typeof brandDirectionRuleUnion>;

/**
 * Layer 1 of the "an inferred rule must never act approved" defence.
 *
 * These six are stated as parse failures rather than review warnings because a warning
 * is something a batch writer can ignore. R2 is the one that matters most: it makes the
 * promotion of a model guess into a brand law a deliberate human act with its own row,
 * not a field update.
 */
const applyRuleInvariants = (rule: BrandDirectionRuleShape, ctx: z.RefinementCtx): void => {
  const approved = rule.approvalState === 'approved';

  if (approved && (rule.approvedBy === null || rule.approvedAt === null)) {
    ctx.addIssue({
      code: 'custom',
      message: 'failed_invariant R1: an approved rule must record approvedBy and approvedAt',
      path: ['approvedBy'],
    });
  }

  if (approved && !APPROVABLE_PROVENANCES.includes(rule.provenance)) {
    ctx.addIssue({
      code: 'custom',
      message: `failed_invariant R2: provenance ${rule.provenance} cannot be approved in one write`,
      path: ['provenance'],
    });
  }

  if (rule.strength === 'hard' && !approved) {
    ctx.addIssue({
      code: 'custom',
      message: 'failed_invariant R3: only an approved rule may be hard',
      path: ['strength'],
    });
  }

  if (rule.strength === 'hard' && rule.observability === 'human-only') {
    ctx.addIssue({
      code: 'custom',
      message: 'failed_invariant R4: a hard rule no bench can evaluate is not a hard rule',
      path: ['observability'],
    });
  }

  if (rule.provenance === 'inferred-by-model' && rule.confidence > 0.8) {
    ctx.addIssue({
      code: 'custom',
      message: 'failed_invariant R5: a model cannot self-certify above 0.8 confidence',
      path: ['confidence'],
    });
  }

  if (!approved && (rule.approvedBy !== null || rule.approvedAt !== null)) {
    ctx.addIssue({
      code: 'custom',
      message: 'failed_invariant R6: a non-approved rule must not carry approval stamps',
      path: ['approvedBy'],
    });
  }

  if (
    approved &&
    rule.piece === 'brand-integration' &&
    rule.value.logoRenderPolicy !== 'no-logo' &&
    rule.value.logoAssetRef === null
  ) {
    ctx.addIssue({
      code: 'custom',
      message:
        'failed_invariant: an approved integration rule that permits a logo must name the asset',
      path: ['value', 'logoAssetRef'],
    });
  }

  if (
    approved &&
    rule.piece === 'brand-integration' &&
    rule.value.productRenderPolicy === 'real-reference-required' &&
    rule.value.productAssetRefs.length === 0
  ) {
    ctx.addIssue({
      code: 'custom',
      message:
        'failed_invariant: real-reference-required needs at least one durable product asset ref',
      path: ['value', 'productAssetRefs'],
    });
  }
};

/**
 * Unknown top-level keys are STRIPPED rather than rejected — a rule written by a newer
 * writer must still be readable here. Unknown keys inside `value` are rejected, because a
 * half-understood `logoRenderPolicy` is more dangerous than no rule at all.
 */
export const brandDirectionRuleSchema = brandDirectionRuleUnion.superRefine(applyRuleInvariants);
export type BrandDirectionRule = z.infer<typeof brandDirectionRuleSchema>;

/** The pre-defaults shape, so authored rule literals are checked by the compiler too. */
export type BrandDirectionRuleInput = z.input<typeof brandDirectionRuleSchema>;

/** The rule variant for one piece, e.g. `BrandDirectionRuleOf<'prohibition'>`. */
export type BrandDirectionRuleOf<P extends BrandDirectionPiece> = Extract<
  BrandDirectionRule,
  { piece: P }
>;

/* -------------------------------------------------------------------------- */
/*  Layer 2 — branded authority                                                */
/* -------------------------------------------------------------------------- */

declare const APPROVED_BRAND: unique symbol;
declare const PROPOSED_BRAND: unique symbol;

/**
 * A rule the resolver granted authority in this package.
 *
 * The brand is a `unique symbol` declared but not exported, so `ApprovedRule` cannot be
 * constructed anywhere except through `asApprovedRule` — and `asApprovedRule` returns
 * `null` for anything failing R1/R2. Assigning a `ProposedRule` to an `ApprovedRule` is a
 * compile error, not a code-review catch. That is the whole point of the brand.
 */
export type ApprovedRule = BrandDirectionRule & { readonly [APPROVED_BRAND]: 'approved' };

/**
 * A rule the resolver did NOT grant authority in this package.
 *
 * Two things land here: rules that are not approved at all, and approved rules the plan
 * did not select (an `occasional` brand signature, the implicit integration default).
 * Either way the compiler may read them and may not obey them.
 */
export type ProposedRule = BrandDirectionRule & { readonly [PROPOSED_BRAND]: 'proposed' };

export type ApprovedProhibition = BrandDirectionRuleOf<'prohibition'> & {
  readonly [APPROVED_BRAND]: 'approved';
};

/** True when the rule satisfies R1 and R2 — the two invariants that confer authority. */
export const isApprovedRule = (rule: BrandDirectionRule): boolean =>
  rule.approvalState === 'approved' &&
  rule.approvedBy !== null &&
  rule.approvedAt !== null &&
  APPROVABLE_PROVENANCES.includes(rule.provenance);

/**
 * The only constructor of `ApprovedRule`.
 *
 * `unclassified-direction` is refused unconditionally: a migrated legacy string has not
 * been classified, so there is nothing for a compiler to obey even if a human ticked it.
 */
export const asApprovedRule = (rule: BrandDirectionRule): ApprovedRule | null => {
  if (rule.piece === 'unclassified-direction') return null;
  if (!isApprovedRule(rule)) return null;
  return rule as ApprovedRule;
};

export const asApprovedProhibition = (rule: BrandDirectionRule): ApprovedProhibition | null => {
  if (rule.piece !== 'prohibition') return null;
  if (!isApprovedRule(rule)) return null;
  return rule as ApprovedProhibition;
};

/** Any rule can be surfaced as a proposal; nothing about that grants it authority. */
export const asProposedRule = (rule: BrandDirectionRule): ProposedRule => rule as ProposedRule;

/* -------------------------------------------------------------------------- */
/*  Examples                                                                   */
/* -------------------------------------------------------------------------- */

export const BRAND_EXAMPLE_AUTHORITIES = ['approved', 'reference', 'exploratory'] as const;
export type BrandExampleAuthority = (typeof BRAND_EXAMPLE_AUTHORITIES)[number];

export const brandDirectionExampleSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
    kind: z.enum(['positive', 'negative']),
    appliesTo: z.array(brandDirectionFamilyEnum).min(1).max(CONTENT_FAMILIES.length),
    /**
     * At least one annotation is mandatory. An unannotated example teaches superficial
     * imitation — the model copies the lighting AND the couch AND the crop, and nobody
     * can say afterwards which of those the brand actually meant.
     */
    annotations: z
      .array(
        z.object({ dimension: brandDirectionPieceEnum, note: z.string().min(1).max(240) }).strict(),
      )
      .min(1)
      .max(8),
    authority: z.enum(BRAND_EXAMPLE_AUTHORITIES),
    rightsNote: z.string().min(1).max(240).nullable().default(null),
    addedBy: z.string().uuid(),
    addedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type BrandDirectionExample = z.infer<typeof brandDirectionExampleSchema>;

/* -------------------------------------------------------------------------- */
/*  Document wrapper                                                           */
/* -------------------------------------------------------------------------- */

export const BRAND_DIRECTION_MAX_RULES = 400;
export const BRAND_DIRECTION_MAX_EXAMPLES = 200;

export const brandDirectionDocumentSchema = z
  .object({
    schemaVersion: z.literal(2),
    brandId: z.string().uuid(),
    /** Monotonic; bumps on any rule write, so a stale reader can detect it is stale. */
    version: z.number().int().min(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/, 'checksum must be a sha256 hex digest'),
    rules: z.array(brandDirectionRuleSchema).max(BRAND_DIRECTION_MAX_RULES),
    examples: z.array(brandDirectionExampleSchema).max(BRAND_DIRECTION_MAX_EXAMPLES),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type BrandDirectionDocument = z.infer<typeof brandDirectionDocumentSchema>;

/* -------------------------------------------------------------------------- */
/*  Canonicalisation and checksums                                             */
/* -------------------------------------------------------------------------- */

/**
 * Key-order-independent JSON.
 *
 * Everything downstream — the document checksum, the resolved-package checksum, the
 * budget cost of a rule — must be identical for two objects that differ only in key
 * order, or "did this resolution change?" becomes unanswerable. Arrays keep their order
 * because array order is meaning (placement law priority, remedy sequence).
 */
export const canonicalDirectionJson = (input: unknown): string => {
  if (input === null || input === undefined) return 'null';
  if (typeof input === 'number') return Number.isFinite(input) ? JSON.stringify(input) : 'null';
  if (typeof input === 'boolean' || typeof input === 'string') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(canonicalDirectionJson).join(',')}]`;
  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalDirectionJson(value)}`)
      .join(',')}}`;
  }
  return 'null';
};

const SHA256_K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// biome-ignore-start lint/suspicious/noBitwiseOperators: SHA-256 is DEFINED as 32-bit rotations, xor and and. There is no non-bitwise formulation, and rewriting it to satisfy the lint would produce a different (wrong) digest.
const rotr = (word: number, bits: number): number => (word >>> bits) | (word << (32 - bits));

/**
 * SHA-256 in plain TypeScript, on purpose.
 *
 * `crypto.subtle.digest` is async and `node:crypto` is not available in the browser. The
 * resolver is required to be pure AND synchronous AND importable by the Frontend, so a
 * self-contained implementation is the only option that satisfies all three.
 */
export const directionSha256Hex = (input: string): string => {
  const data = new TextEncoder().encode(input);
  const blockCount = Math.ceil((data.length + 9) / 64);
  const padded = new Uint8Array(blockCount * 64);
  padded.set(data);
  padded[data.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = data.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 2 ** 32), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  const h = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let block = 0; block < blockCount; block += 1) {
    const offset = block * 64;
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let acc = h[7];

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (acc + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      acc = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + acc) >>> 0;
  }

  return Array.from(h, (word) => word.toString(16).padStart(8, '0')).join('');
};
// biome-ignore-end lint/suspicious/noBitwiseOperators: end of the SHA-256 implementation.

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const exampleSortKey = (example: BrandDirectionExample): string =>
  `${example.assetId}:${example.versionId}:${example.kind}`;

/**
 * The document checksum, over rules and examples only.
 *
 * Rules are sorted by id and examples by their durable coordinate before hashing, so two
 * writers that inserted the same rules in a different order produce the same digest.
 */
export const computeDirectionChecksum = (
  rules: readonly BrandDirectionRule[],
  examples: readonly BrandDirectionExample[],
): string =>
  directionSha256Hex(
    canonicalDirectionJson({
      rules: [...rules].sort(byId),
      examples: [...examples].sort((a, b) =>
        exampleSortKey(a) < exampleSortKey(b) ? -1 : exampleSortKey(a) > exampleSortKey(b) ? 1 : 0,
      ),
    }),
  );

/* -------------------------------------------------------------------------- */
/*  Tolerant read                                                              */
/* -------------------------------------------------------------------------- */

export const BRAND_DIRECTION_DROP_REASONS = [
  'unknown_piece',
  'unknown_enum',
  'invalid_shape',
  'failed_invariant',
  'unsupported_schema_version',
] as const;
export type BrandDirectionDropReason = (typeof BRAND_DIRECTION_DROP_REASONS)[number];

export type BrandDirectionDrop = {
  index: number;
  reason: BrandDirectionDropReason;
  detail: string;
};

export type BrandDirectionReadResult = {
  document: BrandDirectionDocument | null;
  dropped: BrandDirectionDrop[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const classifyRuleFailure = (issues: readonly z.core.$ZodIssue[]): BrandDirectionDropReason => {
  if (issues.some((issue) => issue.code === 'custom')) return 'failed_invariant';
  if (issues.some((issue) => issue.code === 'invalid_value')) return 'unknown_enum';
  return 'invalid_shape';
};

/**
 * Degrade to a partial document; never throw.
 *
 * Mirrors `parseBrandMd`'s stance. Every drop is reported rather than swallowed, because
 * a silent parse loss is indistinguishable from "the brand said nothing" — and the whole
 * point of this module is that the two are different answers.
 */
export function readBrandDirection(raw: unknown): BrandDirectionReadResult {
  if (raw === null || raw === undefined) return { document: null, dropped: [] };
  if (!isRecord(raw)) {
    return {
      document: null,
      dropped: [
        { index: -1, reason: 'invalid_shape', detail: 'direction payload is not an object' },
      ],
    };
  }
  if (Object.keys(raw).length === 0) return { document: null, dropped: [] };

  if (raw.schemaVersion !== 2) {
    return {
      document: null,
      dropped: [
        {
          index: -1,
          reason: 'unsupported_schema_version',
          detail: `expected schemaVersion 2, received ${JSON.stringify(raw.schemaVersion)}`,
        },
      ],
    };
  }

  const dropped: BrandDirectionDrop[] = [];
  const rules: BrandDirectionRule[] = [];
  const rawRules = Array.isArray(raw.rules) ? raw.rules : [];

  rawRules.forEach((rawRule, index) => {
    const piece = isRecord(rawRule) ? rawRule.piece : undefined;
    if (
      typeof piece !== 'string' ||
      !BRAND_DIRECTION_PIECES.includes(piece as BrandDirectionPiece)
    ) {
      dropped.push({
        index,
        reason: 'unknown_piece',
        detail: `piece ${JSON.stringify(piece)} is not part of this schema version`,
      });
      return;
    }
    const parsed = brandDirectionRuleSchema.safeParse(rawRule);
    if (!parsed.success) {
      dropped.push({
        index,
        reason: classifyRuleFailure(parsed.error.issues),
        detail: parsed.error.issues
          .map((issue) => issue.message)
          .join('; ')
          .slice(0, 400),
      });
      return;
    }
    rules.push(parsed.data);
  });

  const examples: BrandDirectionExample[] = [];
  const rawExamples = Array.isArray(raw.examples) ? raw.examples : [];
  rawExamples.forEach((rawExample, index) => {
    const parsed = brandDirectionExampleSchema.safeParse(rawExample);
    if (!parsed.success) {
      dropped.push({
        index,
        reason: 'invalid_shape',
        detail: `example: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`.slice(
          0,
          400,
        ),
      });
      return;
    }
    examples.push(parsed.data);
  });

  const wrapper = brandDirectionDocumentSchema.safeParse({
    schemaVersion: 2,
    brandId: raw.brandId,
    version: typeof raw.version === 'number' ? raw.version : 1,
    // Recomputed rather than trusted: the document a caller receives is the surviving
    // subset, so a checksum describing the pre-drop set would be a lie.
    checksum: computeDirectionChecksum(rules, examples),
    rules,
    examples,
    updatedAt: raw.updatedAt,
  });

  if (!wrapper.success) {
    return {
      document: null,
      dropped: [
        ...dropped,
        {
          index: -1,
          reason: 'invalid_shape',
          detail: wrapper.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')
            .slice(0, 400),
        },
      ],
    };
  }

  return { document: wrapper.data, dropped };
}

/* -------------------------------------------------------------------------- */
/*  Legacy `imagery` migration                                                 */
/* -------------------------------------------------------------------------- */

export type BrandDirectionProposalBatch = {
  rules: ProposedRule[];
  skipped: Array<{ id: string; reason: 'already-curated' }>;
};

/** NFKC + trim + collapse whitespace + lowercase, so an id survives cosmetic edits. */
const normalizeLegacyText = (text: string): string =>
  text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export const legacyImageryRuleId = (field: BrandLegacyImageryField, text: string): string =>
  `legacy-imagery:${field}:${directionSha256Hex(normalizeLegacyText(text)).slice(0, 16)}`;

const CURATED_STATES: readonly BrandRuleApprovalState[] = Object.freeze([
  'approved',
  'rejected',
  'retired',
]);

/**
 * Turn the legacy `imagery` arrays into REVIEWABLE proposals — never into rules.
 *
 * Two clauses carry the safety. First, everything lands `proposed` with `approvedBy:
 * null`, so a string a user typed into a textarea years ago does not silently acquire the
 * authority of a reviewed brand law. Second, `avoid[]` does NOT become a `prohibition`: a
 * legacy avoid string carries no detector, and promoting it would manufacture exactly the
 * unevaluable ban the vagueness guard exists to reject. It lands as
 * `unclassified-direction` with `suggestedPiece: 'prohibition'` and the editor asks the
 * user for a detector when they promote it.
 *
 * Pure: nothing is written, the input `tokens` object is not mutated, and the clock is
 * injected so two runs produce byte-identical batches.
 */
export function proposeDirectionFromLegacyImagery(args: {
  brandId: string;
  tokens: BrandMdTokens | null;
  capturedAt: string;
  existing: BrandDirectionDocument | null;
}): BrandDirectionProposalBatch {
  const imagery = args.tokens?.imagery ?? null;
  if (imagery === null) return { rules: [], skipped: [] };

  const existingById = new Map<string, BrandDirectionRule>(
    (args.existing?.rules ?? []).map((rule) => [rule.id, rule]),
  );

  const rules: ProposedRule[] = [];
  const skipped: BrandDirectionProposalBatch['skipped'] = [];
  const emitted = new Set<string>();

  const sources: Array<{ field: BrandLegacyImageryField; texts: readonly string[] }> = [
    { field: 'creative_direction', texts: imagery.creative_direction },
    { field: 'mood', texts: imagery.mood },
    { field: 'avoid', texts: imagery.avoid },
  ];

  for (const source of sources) {
    for (const rawText of source.texts) {
      const text = rawText.trim();
      if (text.length === 0) continue;

      const id = legacyImageryRuleId(source.field, text);
      if (emitted.has(id)) continue;

      const curated = existingById.get(id);
      if (curated && CURATED_STATES.includes(curated.approvalState)) {
        skipped.push({ id, reason: 'already-curated' });
        emitted.add(id);
        continue;
      }

      const parsed = brandDirectionRuleSchema.safeParse({
        id,
        piece: 'unclassified-direction',
        value: {
          text: text.slice(0, 300),
          legacyField: source.field,
          suggestedPiece: source.field === 'avoid' ? 'prohibition' : null,
        },
        applicability: {
          families: 'all',
          excludedFamilies: [],
          mediaKinds: [...BRAND_DIRECTION_MEDIA_KINDS],
          channels: [],
        },
        strength: 'default',
        // Honest: these strings did come from a user-authored `brand.md`. R1 still keeps
        // them unapproved, because nobody has reviewed them AS RULES.
        provenance: 'extracted-from-source',
        confidence: 0.5,
        approvalState: 'proposed',
        sourceVersion: {
          kind: 'brand-md',
          ref: 'brand_tokens.imagery',
          versionId: null,
          capturedAt: args.capturedAt,
        },
        observability: 'human-only',
        rationale: 'Migrated from legacy brand.md imagery; not yet classified or approved.',
        supersedes: [],
        createdAt: args.capturedAt,
        updatedAt: args.capturedAt,
        approvedBy: null,
        approvedAt: null,
        lastAppliedAt: null,
      });

      if (!parsed.success) continue;
      rules.push(asProposedRule(parsed.data));
      emitted.add(id);
    }
  }

  return { rules, skipped };
}
