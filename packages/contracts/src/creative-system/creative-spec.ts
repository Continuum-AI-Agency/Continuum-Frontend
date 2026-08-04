// CreativeSpec v1 — provider-neutral authoring intent.
//
// This is the object the whole system agrees on. Canvas authors it, headless receives
// it, Organic maps its brief into it, and the compiler is the only thing allowed to
// turn it into provider prose. Storing structure and compiling prose is the central
// decision: a planning model can read JSON usefully, but an image model should not be
// handed JSON merely because JSON looks precise.
//
// The core here is deliberately small. Everything family-specific lives in the
// discriminated payload (`families.ts`), everything about craft vocabulary lives in
// `vocabulary.ts`, and everything about words and attachments lives in `references.ts`.
// A field earns its place in this file only if EVERY family needs it.

import { z } from 'zod';

import { CONTENT_FAMILIES, COPY_BEARING_FAMILIES, familyPayloadSchema } from './families';
import {
  boundedText,
  boundedTextArray,
  DEFAULT_CANDIDATE_COUNT,
  FREEFORM_PROMPT_HARD_LIMIT,
  MAX_CANDIDATE_COUNT,
  MIN_CANDIDATE_COUNT,
} from './limits';
import {
  copyPlanSchema,
  creativeConstraintSchema,
  creativeReferenceSchema,
  durableAssetRefSchema,
} from './references';
import { polishDirectionSchema, sceneDirectionSchema, styleSelectionSchema } from './vocabulary';

/* -------------------------------------------------------------------------- */
/*  Identity and provenance                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A pinned reference to a versioned library object.
 *
 * Version is required, not optional. A recipe that points at "the club-night preset"
 * without saying which version cannot be re-run, cannot be audited, and quietly changes
 * meaning when someone publishes v2 — which defeats the point of having receipts.
 */
export const pinnedObjectRefSchema = z
  .object({
    id: z.string().min(1).max(120),
    version: z.number().int().min(1),
  })
  .strict();
export type PinnedObjectRef = z.infer<typeof pinnedObjectRefSchema>;

export const specIdentitySchema = z
  .object({
    brandId: z.string().uuid(),
    /**
     * Opaque, because the Brand Book's own versioning is not this module's business —
     * only the fact that a specific state of it was used.
     */
    brandBookVersion: z.string().min(1).max(120).nullable(),
    preset: pinnedObjectRefSchema.nullable(),
    /** Set when the user picked a friendly shortcut; records what it expanded to. */
    tasteShortcutId: z.string().min(1).max(120).nullable(),
  })
  .strict();
export type SpecIdentity = z.infer<typeof specIdentitySchema>;

/* -------------------------------------------------------------------------- */
/*  Communication job                                                          */
/* -------------------------------------------------------------------------- */

export const FUNNEL_STAGES = [
  'awareness',
  'consideration',
  'conversion',
  'retention',
  'advocacy',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * What the creative is for, decided before what it looks like.
 *
 * `primaryMessage` is singular and required. "No single communication job or message
 * hierarchy" is the first named property of slop, and the cheapest place to catch it is
 * at authoring time — a brief that cannot name one message will not produce an image
 * that carries one.
 */
export const communicationJobSchema = z
  .object({
    audience: boundedText(3, 300),
    audienceState: boundedText(3, 300),
    primaryMessage: boundedText(3, 300),
    supportingProof: boundedTextArray(1, 200).max(4),
    desiredResponse: boundedText(3, 200),
    funnelStage: z.enum(FUNNEL_STAGES),
  })
  .strict();
export type CommunicationJob = z.infer<typeof communicationJobSchema>;

/* -------------------------------------------------------------------------- */
/*  Concept and mechanism                                                      */
/* -------------------------------------------------------------------------- */

/**
 * How the layout performs the idea.
 *
 * This is the most transferable lesson in the source material and the hardest thing to
 * fake: a mechanism is something the composition DOES. "Premium and bold" is a mood;
 * "the stock ledger strikes out lines to perform scarcity" is a mechanism, and you can
 * look at the output and say whether it happened.
 */
export const COMMUNICATION_MECHANISMS = [
  'repeat-and-degrade',
  'route-path',
  'image-inside-type',
  'foreground-background-weave',
  'inventory-ledger',
  'scale-collision',
  'crop-as-pressure',
  'transformation',
  'before-after-contrast',
  'progressive-disclosure',
  'open-and-close-loop',
  'modular-system',
  'object-as-metaphor',
  'negative-space-reveal',
  'accumulation',
  'reduction',
] as const;
export type CommunicationMechanism = (typeof COMMUNICATION_MECHANISMS)[number];

export const conceptSchema = z
  .object({
    /** One idea. Not a list — a second `singleIdea` field would be a contradiction. */
    singleIdea: boundedText(3, 400),
    mechanism: z.enum(COMMUNICATION_MECHANISMS),
    /** How the mechanism is executed in this specific artefact. */
    mechanismExecution: boundedText(3, 400),
    dominantGesture: boundedText(3, 300),
    /**
     * Capped at 4. "Many decorative elements with no compositional role" is a named
     * slop property, and an unbounded supporting-detail list is how a single dominant
     * idea becomes six competing ones.
     */
    supportingDetails: boundedTextArray(1, 160).max(4),
  })
  .strict();
export type Concept = z.infer<typeof conceptSchema>;

/* -------------------------------------------------------------------------- */
/*  Delivery                                                                   */
/* -------------------------------------------------------------------------- */

export const ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9', '3:2', '2:3', '2.39:1'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const deliverySchema = z
  .object({
    family: z.enum(CONTENT_FAMILIES),
    preFormatId: z.string().min(1).max(120).nullable(),
    placement: z.string().min(1).max(120),
    aspectRatio: z.enum(ASPECT_RATIOS),
    /** Physical or pixel size when the placement demands one. Intent, not a provider size. */
    dimensions: z
      .object({ width: z.number().int().min(1), height: z.number().int().min(1) })
      .strict()
      .nullable(),
    respectPlatformSafeAreas: z.boolean(),
  })
  .strict();
export type Delivery = z.infer<typeof deliverySchema>;

/* -------------------------------------------------------------------------- */
/*  Brand selection                                                            */
/* -------------------------------------------------------------------------- */

export const brandSelectionSchema = z
  .object({
    /**
     * Which Brand Book pieces the author asked for. Null means "let the resolver decide
     * from the family", which is the default and the better answer — a hand-picked piece
     * list is how Canvas and headless drifted apart in the first place.
     */
    requestedPieces: z.array(z.string().min(1).max(60)).max(20).nullable(),
    /** Campaign-scoped departures, each of which the resolver must authorise. */
    campaignOverrides: boundedTextArray(1, 200).max(8),
  })
  .strict();
export type BrandSelection = z.infer<typeof brandSelectionSchema>;

/* -------------------------------------------------------------------------- */
/*  Generation intent                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What the run is FOR, which decides how its results may be reported.
 *
 * `curation` may cherry-pick a winner. `reliability` may not — it reports the whole
 * distribution. Keeping the tier on the spec is what stops a five-candidate batch from
 * being quietly presented as proof that a preset works.
 */
export const QUALITY_TIERS = ['smoke', 'curation', 'reliability', 'production'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const generationIntentSchema = z
  .object({
    candidateCount: z
      .number()
      .int()
      .min(MIN_CANDIDATE_COUNT)
      .max(MAX_CANDIDATE_COUNT)
      .default(DEFAULT_CANDIDATE_COUNT),
    qualityTier: z.enum(QUALITY_TIERS),
    /** Explicit human approval requirement. Defaults on for anything user-visible. */
    requiresHumanApproval: z.boolean(),
  })
  .strict();
export type GenerationIntent = z.infer<typeof generationIntentSchema>;

/* -------------------------------------------------------------------------- */
/*  The spec                                                                   */
/* -------------------------------------------------------------------------- */

export const creativeSpecV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    identity: specIdentitySchema,
    job: communicationJobSchema,
    delivery: deliverySchema,
    concept: conceptSchema,
    brand: brandSelectionSchema,

    /**
     * Composed, never copied — `sceneDirectionSchema` is `artDirectionSchema` with its
     * camera, light and palette blocks widened in place, so this remains one object and
     * the existing production contract stays the one truth.
     */
    artDirection: sceneDirectionSchema,
    polish: polishDirectionSchema,
    style: styleSelectionSchema.nullable(),

    copy: copyPlanSchema,
    references: z.array(creativeReferenceSchema).max(12),
    constraints: z.array(creativeConstraintSchema).max(40),
    payload: familyPayloadSchema,
    generation: generationIntentSchema,

    /**
     * The author's own words, preserved verbatim.
     *
     * Kept because a structured brief loses nuance and because a user who typed
     * something specific deserves to see it survive into the output. It is budgeted
     * like every other block and is never silently trimmed.
     */
    freeformBrief: boundedText(0, FREEFORM_PROMPT_HARD_LIMIT).nullable(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.payload.family !== spec.delivery.family) {
      ctx.addIssue({
        code: 'custom',
        message: 'delivery.family and payload.family must agree',
        path: ['payload', 'family'],
      });
    }

    const identityRefs = spec.references.filter(
      (ref) => ref.role === 'preserve-product-identity' || ref.role === 'use-logo-exactly',
    );
    if (spec.payload.family === 'product-still-life') {
      const needsReference =
        spec.payload.fidelity === 'composited-from-reference' ||
        spec.payload.fidelity === 'ai-rendered-from-reference';
      if (needsReference && identityRefs.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message:
            'a product fidelity mode that requires a reference must carry an identity-preserving reference',
          path: ['references'],
        });
      }
    }

    // `copyPlanSchema` already rejects items on a no-copy plan, so the inverse — a family
    // whose whole job depends on words declaring it has none — is the case only this level
    // can see. An event poster with no copy has no event facts, and a carousel with no copy
    // is a pile of pictures.
    if (spec.copy.strategy === 'no-copy' && COPY_BEARING_FAMILIES.includes(spec.payload.family)) {
      ctx.addIssue({
        code: 'custom',
        message: `the ${spec.payload.family} family carries words; a no-copy strategy cannot deliver it`,
        path: ['copy', 'strategy'],
      });
    }
  });
export type CreativeSpecV1 = z.infer<typeof creativeSpecV1Schema>;

/* -------------------------------------------------------------------------- */
/*  Resolved values                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where a resolved value came from and how hard it binds.
 *
 * The order of `AUTHORITY_SOURCES` IS the precedence, lowest first, so a merge can be
 * written as a comparison instead of a pile of conditionals — and so the reason one
 * value beat another is inspectable rather than implied by statement order.
 */
export const AUTHORITY_SOURCES = [
  'provider-default',
  'family-default',
  'taste-shortcut',
  'preset-default',
  'preset-law',
  'brand-preferred',
  'campaign-override',
  'user-explicit',
  'brand-hard',
  'safety',
] as const;
export type AuthoritySource = (typeof AUTHORITY_SOURCES)[number];

export const AUTHORITY_RANK: Readonly<Record<AuthoritySource, number>> = Object.freeze(
  Object.fromEntries(AUTHORITY_SOURCES.map((source, index) => [source, index])) as Record<
    AuthoritySource,
    number
  >,
);

/** Sources whose values may never be trimmed, degraded, or overridden to fit a provider. */
export const NON_NEGOTIABLE_SOURCES: readonly AuthoritySource[] = Object.freeze([
  'brand-hard',
  'safety',
  'user-explicit',
]);

export const resolvedValueMetaSchema = z
  .object({
    source: z.enum(AUTHORITY_SOURCES),
    authority: z.enum(['required', 'preferred', 'suggestion']),
    sourceId: z.string().min(1).max(120).nullable(),
    sourceVersion: z.string().min(1).max(120).nullable(),
  })
  .strict();
export type ResolvedValueMeta = z.infer<typeof resolvedValueMetaSchema>;

export const resolvedCreativeSpecSchema = z
  .object({
    spec: creativeSpecV1Schema,
    /** Field path (dot notation) to the authority that decided it. */
    fieldAuthority: z.record(z.string(), resolvedValueMetaSchema),
    /** Every pinned object version that contributed, for the receipt. */
    pinnedVersions: z.array(pinnedObjectRefSchema).max(40),
    brandExamples: z.array(durableAssetRefSchema).max(12),
    resolvedAt: z.string().datetime(),
  })
  .strict();
export type ResolvedCreativeSpec = z.infer<typeof resolvedCreativeSpecSchema>;
