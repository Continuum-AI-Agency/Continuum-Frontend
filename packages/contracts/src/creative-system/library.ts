// The Taste library: family definitions, presets, and the manifest card.
//
// The manifest card is the load-bearing idea here. Agents must never receive the whole
// library in a system prompt — not because of cost alone, but because a model handed
// forty full presets picks by surface similarity, which is how you get ten nearly
// identical "luxury" results and call it discovery. So search returns compact cards
// carrying exactly the facets needed to ELIMINATE options (family, placement, provider,
// brand compatibility, required inputs), and the full definition loads only after a
// selection has been made.
//
// The same card drives the human library browser. One card, one catalog — otherwise the
// UI catalog and the agent catalog drift into two different products with the same name.

import { z } from 'zod';
import { COMMUNICATION_MECHANISMS, pinnedObjectRefSchema } from './creative-spec';
import { CONTENT_FAMILIES } from './families';
import { boundedText, boundedTextArray } from './limits';
import { PLAN_KINDS, QUALIFICATION_STATUSES } from './plan';
import { COPY_STRATEGIES, durableAssetRefSchema } from './references';
import { POLISH_LEVELS } from './vocabulary';

/* -------------------------------------------------------------------------- */
/*  Object kinds and ownership                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The distinct reusable objects.
 *
 * They are listed together and kept apart deliberately. Collapsing a saved prompt, a
 * template, a preset, and a skill into one "prompt" concept is what makes safe
 * overrides, versioning, and evaluation impossible — and it is the single most common
 * way a prompt library rots into a text dump.
 */
export const TASTE_OBJECT_KINDS = [
  'family',
  'pre-format',
  'taste-preset',
  'mechanism',
  'prompt-template',
  'brief-template',
  'skill',
  'taste-shortcut',
  'example',
  'recipe',
  'receipt',
  'qualification-manifest',
  'provider-profile',
  'art-style',
] as const;
export type TasteObjectKind = (typeof TASTE_OBJECT_KINDS)[number];

export const OWNERSHIP_SCOPES = ['first-party', 'brand', 'user'] as const;
export type OwnershipScope = (typeof OWNERSHIP_SCOPES)[number];

export const BRAND_COMPATIBILITY = [
  'compatible',
  'requires-override',
  'conflicts',
  'unknown',
] as const;
export type BrandCompatibility = (typeof BRAND_COMPATIBILITY)[number];

/* -------------------------------------------------------------------------- */
/*  Manifest card                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The bounded card a search returns.
 *
 * Every field is either a filter facet or a reason to choose. `whyItWorks` is required
 * because a card that cannot say what its mechanism achieves is a style name, and style
 * names are what this whole system exists to replace. `previewAsset` is a durable
 * `{assetId, versionId}` — the consuming surface resolves its own authorized thumbnail,
 * because a signed URL baked into a catalog entry is stale the moment it is stored.
 */
export const tasteManifestCardSchema = z
  .object({
    id: z.string().min(1).max(120),
    version: z.number().int().min(1),
    kind: z.enum(TASTE_OBJECT_KINDS),
    name: boundedText(1, 120),
    summary: boundedText(8, 300),

    familyId: z.enum(CONTENT_FAMILIES).nullable(),
    preFormatIds: z.array(z.string().min(1).max(60)).max(12),
    communicationJobs: z.array(z.string().min(1).max(60)).max(8),
    mechanisms: z.array(z.enum(COMMUNICATION_MECHANISMS)).max(6),
    placements: z.array(z.string().min(1).max(24)).max(12),
    polishLevel: z.enum(POLISH_LEVELS).nullable(),
    styleIds: z.array(z.string().min(1).max(60)).max(6),

    requiredInputs: z.array(z.string().min(1).max(80)).max(10),
    requiredReferenceRoles: z.array(z.string().min(1).max(60)).max(6),
    copyStrategies: z.array(z.enum(COPY_STRATEGIES)).max(COPY_STRATEGIES.length),
    supportedPlanKinds: z.array(z.enum(PLAN_KINDS)).max(PLAN_KINDS.length),

    qualification: z.enum(QUALIFICATION_STATUSES),
    ownership: z.enum(OWNERSHIP_SCOPES),
    brandCompatibility: z.enum(BRAND_COMPATIBILITY),
    providerCompatibility: z.array(z.string().min(1).max(120)).max(12),
    costBand: z.enum(['low', 'medium', 'high']),
    latencyBand: z.enum(['fast', 'standard', 'slow']),

    previewAsset: durableAssetRefSchema.nullable(),
    /** The mechanism's payoff, in one sentence a human can judge. */
    whyItWorks: boundedText(8, 300),
  })
  .strict();
export type TasteManifestCard = z.infer<typeof tasteManifestCardSchema>;

/* -------------------------------------------------------------------------- */
/*  Family definition                                                          */
/* -------------------------------------------------------------------------- */

export const contentFamilyDefinitionSchema = z
  .object({
    id: z.enum(CONTENT_FAMILIES),
    version: z.number().int().min(1),
    label: boundedText(1, 80),
    communicationJob: boundedText(8, 300),
    /** Which Brand Book pieces this family cannot be resolved without. */
    requiredBrandBookPieces: z.array(z.string().min(1).max(60)).max(16),
    defaultPlanKind: z.enum(PLAN_KINDS),
    defaultPolishLevel: z.enum(POLISH_LEVELS),
    compatibleMechanisms: z.array(z.enum(COMMUNICATION_MECHANISMS)).min(1).max(16),
    defaultAspectRatios: z.array(z.string().min(1).max(12)).min(1).max(8),
    /** Whether the family normally carries words the model or a compositor must render. */
    expectsCopy: z.boolean(),
    /** Observable ways this family characteristically fails. Feeds the rubric. */
    failureSignatures: boundedTextArray(8, 300).min(1).max(12),
  })
  .strict();
export type ContentFamilyDefinition = z.infer<typeof contentFamilyDefinitionSchema>;

/* -------------------------------------------------------------------------- */
/*  Preset definition                                                          */
/* -------------------------------------------------------------------------- */

/**
 * An invariant the preset is not the preset without.
 *
 * `observable` is required for the same reason it is on a realism device: a law nobody
 * can check is a preference wearing a law's clothes. `10-curation-workflow` calls these
 * out as the thing that must survive red-team review — an author who writes "feels
 * premium" here has not finished.
 */
export const presetLawSchema = z
  .object({
    id: z.string().min(1).max(60),
    statement: boundedText(8, 400),
    observable: boundedText(12, 400),
  })
  .strict();
export type PresetLaw = z.infer<typeof presetLawSchema>;

export const presetSlotSchema = z
  .object({
    key: z.string().min(1).max(60),
    label: boundedText(1, 80),
    kind: z.enum(['text', 'enum', 'number', 'boolean', 'asset-ref', 'colour']),
    required: z.boolean(),
    /** Legal values for an enum slot. Empty for other kinds. */
    options: boundedTextArray(1, 120).max(24),
    defaultValue: boundedText(0, 400).nullable(),
    helpText: boundedText(0, 300).nullable(),
  })
  .strict();
export type PresetSlot = z.infer<typeof presetSlotSchema>;

/**
 * A versioned creative system. Immutable per `{id, version}`.
 *
 * "A paragraph with brackets is an import source, not yet a complete preset" — so laws,
 * exclusions, and failure signatures are all required with a floor of one. A preset that
 * knows what it wants but not what would ruin it cannot be evaluated, and an
 * unevaluable preset can never leave `draft`.
 */
export const creativePresetDefinitionSchema = z
  .object({
    id: z.string().min(1).max(120),
    version: z.number().int().min(1),
    familyId: z.enum(CONTENT_FAMILIES),
    name: boundedText(1, 120),
    summary: boundedText(8, 300),
    ownership: z.enum(OWNERSHIP_SCOPES),

    laws: z.array(presetLawSchema).min(1).max(12),
    slots: z.array(presetSlotSchema).max(20),
    mechanism: z.enum(COMMUNICATION_MECHANISMS),
    polishLevel: z.enum(POLISH_LEVELS),
    styleRefs: z.array(pinnedObjectRefSchema).max(4),
    /** Observable things this preset forbids. Compiled into the exclusion block. */
    exclusions: boundedTextArray(4, 300).min(1).max(20),
    defaultCopyStrategy: z.enum(COPY_STRATEGIES),
    recommendedSkillIds: z.array(z.string().min(1).max(120)).max(8),

    /** How this preset characteristically fails. Required — see the doc comment. */
    failureSignatures: boundedTextArray(8, 300).min(1).max(12),
    exampleBriefs: boundedTextArray(8, 1_000).max(6),
    exemplars: z.array(durableAssetRefSchema).max(6),

    status: z.enum(QUALIFICATION_STATUSES),
    /** Where the technique came from, and its rights position. Extraction, never copying. */
    provenance: boundedText(4, 600),
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine((preset) => preset.status === 'draft' || preset.exemplars.length > 0, {
    message: 'a preset beyond draft must pin at least one exemplar',
    path: ['exemplars'],
  });
export type CreativePresetDefinition = z.infer<typeof creativePresetDefinitionSchema>;

/* -------------------------------------------------------------------------- */
/*  Taste shortcut                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A friendly name that resolves to disclosed versions.
 *
 * The disclosure is the whole point. "Printed editorial" is a useful thing to click and
 * a dangerous thing to trust, so the shortcut always reports the exact preset and skill
 * versions it expanded to — a shortcut that hides its expansion is a style dropdown.
 */
export const tasteShortcutSchema = z
  .object({
    id: z.string().min(1).max(120),
    version: z.number().int().min(1),
    label: boundedText(1, 80),
    summary: boundedText(8, 300),
    expandsTo: z
      .object({
        presets: z.array(pinnedObjectRefSchema).min(1).max(6),
        skills: z.array(pinnedObjectRefSchema).max(6),
        styles: z.array(pinnedObjectRefSchema).max(4),
      })
      .strict(),
    ownership: z.enum(OWNERSHIP_SCOPES),
  })
  .strict();
export type TasteShortcut = z.infer<typeof tasteShortcutSchema>;
