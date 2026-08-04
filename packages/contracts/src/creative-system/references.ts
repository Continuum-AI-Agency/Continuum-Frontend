// Reference assets, typed constraints, and exact copy.
//
// These three are grouped because they are the three places the current system loses
// intent, and they lose it the same way: by flattening a decision into a string.
//
//   an attached image  -> "context"        (which part of it? the product? the mood?)
//   an exclusion       -> a negative prompt (whose rule was that? can it yield?)
//   a headline         -> prose in the brief (is the spelling load-bearing?)
//
// A role, a strength, and a provenance are what make each of those enforceable. A
// provider adapter can refuse a role it cannot honour; a compiler can decide which of
// two contradictory constraints wins; an evaluator can OCR a copy item it was told is
// exact. None of that is possible once the information is a sentence.

import { z } from 'zod';

import { boundedText } from './limits';

/* -------------------------------------------------------------------------- */
/*  Durable identity                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The only legal way to point at a Library asset.
 *
 * A signed URL is transport. It expires, it differs per request, and a receipt that
 * stored one is not reproducible six months later — which defeats the entire point of
 * a receipt. `mediaAssetVersionSchema` already models this identity for the Library;
 * this is the two-field coordinate every creative-system object references it by.
 */
export const durableAssetRefSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid(),
  })
  .strict();
export type DurableAssetRef = z.infer<typeof durableAssetRefSchema>;

/* -------------------------------------------------------------------------- */
/*  Reference roles                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What an attached image is FOR.
 *
 * Split into identity-preserving roles and borrowing roles, because the two make
 * opposite demands of a provider. `preserve-product-identity` asks the model to change
 * nothing about the object; `borrow-composition` asks it to keep nothing but the
 * arrangement. A provider that supports one does not necessarily support the other,
 * and a request that silently swaps them produces a plausible image of the wrong thing.
 *
 * `avoid-resembling` is the only negative role. It is listed here rather than in
 * constraints because it is carried by an asset, and an adapter that cannot send a
 * negative image reference must degrade it explicitly into prose rather than drop it.
 */
export const REFERENCE_ROLES = [
  'preserve-product-identity',
  'preserve-person-identity',
  'use-logo-exactly',
  'borrow-composition',
  'borrow-treatment',
  'borrow-palette',
  'borrow-lighting',
  'environment-plate',
  'first-frame',
  'last-frame',
  'avoid-resembling',
] as const;
export type ReferenceRole = (typeof REFERENCE_ROLES)[number];

/** Roles whose whole purpose is that the output must not deviate from the source. */
export const IDENTITY_PRESERVING_ROLES: readonly ReferenceRole[] = Object.freeze([
  'preserve-product-identity',
  'preserve-person-identity',
  'use-logo-exactly',
]);

/**
 * How hard the role binds.
 *
 * `required` means an adapter that cannot honour the role must refuse the whole
 * compilation. This is the setting a real product photograph uses — shipping a
 * hallucinated variant of a customer's product is worse than shipping nothing.
 */
export const REFERENCE_STRENGTHS = ['required', 'preferred', 'hint'] as const;
export type ReferenceStrength = (typeof REFERENCE_STRENGTHS)[number];

export const creativeReferenceSchema = z
  .object({
    asset: durableAssetRefSchema,
    role: z.enum(REFERENCE_ROLES),
    strength: z.enum(REFERENCE_STRENGTHS),
    /** Which part of the asset the role applies to, when the whole frame is not meant. */
    focus: boundedText(1, 200).nullable(),
    /** Recorded rights basis. Required for person references — see `refine` below. */
    rightsNote: boundedText(1, 300).nullable(),
  })
  .strict()
  .refine((ref) => ref.role !== 'preserve-person-identity' || !!ref.rightsNote, {
    message: 'a person-identity reference must record a rights basis',
    path: ['rightsNote'],
  });
export type CreativeReference = z.infer<typeof creativeReferenceSchema>;

/* -------------------------------------------------------------------------- */
/*  Typed constraints                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Where a constraint came from, which is what decides whether it may yield.
 *
 * A single negative-prompt string cannot express priority or provenance, so when a
 * brand prohibition and a preset preference disagree the old system had no way to
 * resolve it except ordering luck. Naming the origin makes the resolution a rule.
 */
export const CONSTRAINT_ORIGINS = [
  'brand-prohibition',
  'family-invariant',
  'preset-law',
  'style-exclusion',
  'user-correction',
  'provider-safety',
  'anti-slop-baseline',
] as const;
export type ConstraintOrigin = (typeof CONSTRAINT_ORIGINS)[number];

/**
 * Constraint force, highest first.
 *
 * `must` and `must-not` are load-bearing: violating one is a hard gate failure, not a
 * score deduction. `avoid` is the only class permitted to yield when two constraints
 * genuinely collide, which is why anything the brand actually forbids must never be
 * authored as `avoid`.
 */
export const CONSTRAINT_FORCES = ['must', 'must-not', 'avoid'] as const;
export type ConstraintForce = (typeof CONSTRAINT_FORCES)[number];

export const creativeConstraintSchema = z
  .object({
    force: z.enum(CONSTRAINT_FORCES),
    origin: z.enum(CONSTRAINT_ORIGINS),
    /** An observable property, not a feeling. "No visible gradient", not "not tacky". */
    statement: boundedText(3, 300),
    /** Set when the origin is a versioned object, so a receipt can name the exact rule. */
    sourceId: z.string().min(1).max(120).nullable(),
    sourceVersion: z.number().int().min(1).nullable(),
  })
  .strict();
export type CreativeConstraint = z.infer<typeof creativeConstraintSchema>;

/** Origins whose constraints a compiler may never downgrade or drop to fit a provider. */
export const NON_YIELDING_ORIGINS: readonly ConstraintOrigin[] = Object.freeze([
  'brand-prohibition',
  'provider-safety',
  'anti-slop-baseline',
]);

export const isYieldable = (constraint: CreativeConstraint): boolean =>
  constraint.force === 'avoid' && !NON_YIELDING_ORIGINS.includes(constraint.origin);

/* -------------------------------------------------------------------------- */
/*  Exact copy                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Copy is data, never prose buried in a description.
 *
 * The reason is narrow and practical: if the words live in the brief sentence, nothing
 * downstream can OCR the output and check them. A price rendered as "$49" when the
 * brief said "$49.00" is a factual error that an attractive image will hide.
 */
export const COPY_ROLES = [
  'headline',
  'subhead',
  'body',
  'price',
  'date',
  'time',
  'venue',
  'product-name',
  'call-to-action',
  'legal-disclosure',
  'edition-code',
  'caption',
  'on-screen-text',
] as const;
export type CopyRole = (typeof COPY_ROLES)[number];

export const COPY_CASES = ['as-written', 'upper', 'lower', 'title', 'sentence'] as const;
export type CopyCase = (typeof COPY_CASES)[number];

/**
 * How the words are actually going to get onto the pixels.
 *
 * This is a plan decision, not a wish. `model-rendered` is the only one that risks
 * misspelling, and it is therefore the only one that requires an OCR gate; the two
 * deterministic strategies cannot misspell but can only produce the typography a
 * compositor supports. Naming the strategy up front is what stops the system implying
 * that a single conversational prompt guarantees correct text.
 */
export const COPY_STRATEGIES = [
  'model-rendered',
  'generate-then-edit',
  'generate-then-compose',
  'deterministic-only',
  'no-copy',
] as const;
export type CopyStrategy = (typeof COPY_STRATEGIES)[number];

/** Roles where a wrong character is a factual error, so `exact` may not be false. */
export const FACTUAL_COPY_ROLES: readonly CopyRole[] = Object.freeze([
  'price',
  'date',
  'time',
  'venue',
  'product-name',
  'legal-disclosure',
  'edition-code',
]);

export const copyItemSchema = z
  .object({
    role: z.enum(COPY_ROLES),
    text: boundedText(1, 600),
    /** Whether the spelling is load-bearing. Drives the OCR gate. */
    exact: z.boolean(),
    case: z.enum(COPY_CASES),
    /** True when the author's line breaks must survive; false lets the layout re-wrap. */
    fixedLineBreaks: z.boolean(),
    /** Typographic intent in production language, not a font file. */
    styleNote: boundedText(1, 200).nullable(),
  })
  .strict()
  .refine((item) => !FACTUAL_COPY_ROLES.includes(item.role) || item.exact, {
    message: 'factual copy roles are always exact',
    path: ['exact'],
  });
export type CopyItem = z.infer<typeof copyItemSchema>;

export const copyPlanSchema = z
  .object({
    strategy: z.enum(COPY_STRATEGIES),
    items: z.array(copyItemSchema).max(12),
    /**
     * Whether the model may invent words beyond the supplied items.
     *
     * Defaults false everywhere because invented copy is one of the named slop
     * properties, and a poster that reads convincingly in a language the brand never
     * approved is worse than one with no text at all.
     */
    allowAdditionalText: z.boolean(),
    /** Registers of type size. Two is the poster law; more usually means no hierarchy. */
    typeRegisters: z.number().int().min(1).max(5).nullable(),
  })
  .strict()
  .refine((plan) => plan.strategy !== 'no-copy' || plan.items.length === 0, {
    message: 'a no-copy plan may not carry copy items',
    path: ['items'],
  })
  .refine((plan) => plan.strategy === 'no-copy' || plan.items.length > 0, {
    message: 'a copy strategy other than no-copy must carry at least one copy item',
    path: ['items'],
  });
export type CopyPlan = z.infer<typeof copyPlanSchema>;

/** True when the plan carries a guarantee an OCR gate has to verify. */
export const requiresOcrGate = (plan: CopyPlan): boolean =>
  plan.strategy !== 'no-copy' && plan.items.some((item) => item.exact);
