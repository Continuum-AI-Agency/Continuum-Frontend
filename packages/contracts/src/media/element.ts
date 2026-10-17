// Elements — a named, reusable subject (a model, a product, a place, a style) that a
// canvas node can point at instead of re-attaching the same images every time.
//
// An Element is stored as a `media.asset_groups` row with `kind='element'`: its members
// are ordinary Library assets in `asset_group_members` (position-ordered, <=8), and
// everything else lives in the group's existing `origin_ref` jsonb bag. There is no
// Element table and no `metadata` column — see the migration
// 20260824100000_asset_groups_element_kind.sql for why.
//
// WHY the interesting parts of this file are PURE FUNCTIONS rather than backend code:
//
//   * `buildElementReferencePrompt` turns nine categories into one unit test over a
//     string instead of nine paid image generations, and it lets the panel show the
//     operator exactly what will be sent.
//   * `resolveElementRefs` and `buildElementReferenceLabel` are the emission rules. The
//     canvas node (Frontend) and the backend must agree about them exactly — an Element
//     that emits a different ref set on each side is the drift this package exists to
//     prevent.
//
// Reference material: docs/research/element-reference-generation.md — §2 the call
// shape, §3 the prompt skeleton, §4 per-category format, §5 these templates, §8.6 and
// §9 the emission/fallback semantics.

import { z } from 'zod';
import { campaignMoneySchema } from '../goals/campaign-artifacts';
import { type LibraryImageRef, libraryImageRefSchema } from './library-reference';

// --- Vocabulary --------------------------------------------------------------

export const ELEMENT_CATEGORIES = [
  'model',
  'character',
  'product',
  'object',
  'material',
  'setting',
  'location',
  'landscape',
  'style',
  'moodboard',
  'palette',
  'animation',
  'effect',
  'general',
] as const;

export const elementCategorySchema = z.enum(ELEMENT_CATEGORIES);
export type ElementCategory = z.infer<typeof elementCategorySchema>;

export const ELEMENT_USE_INTENTS = [
  'subject',
  'environment',
  'treatment',
  'palette',
  'motion',
] as const;
export const elementUseIntentSchema = z.enum(ELEMENT_USE_INTENTS);
export type ElementUseIntent = z.infer<typeof elementUseIntentSchema>;

export const defaultElementUseIntent = (category: ElementCategory): ElementUseIntent => {
  if (category === 'setting' || category === 'location' || category === 'landscape') {
    return 'environment';
  }
  if (category === 'style' || category === 'moodboard' || category === 'material') {
    return 'treatment';
  }
  if (category === 'palette') return 'palette';
  if (category === 'animation' || category === 'effect') return 'motion';
  return 'subject';
};

/**
 * Members per Element. Enforced in the ROUTE — nothing below it enforces anything:
 * `media.asset_group_members` has no cap and `assetGroupSchema` is `.min(1)` with no
 * `.max`. Chosen to sit under the provider's 10 high-fidelity object slots with room
 * left for the palette, logo and environment plate the same node usually also carries.
 */
export const ELEMENT_MEMBER_LIMIT = 8;

/**
 * The ceiling on FALLBACK member refs for the two person categories.
 * `gemini-3.1-flash-image` carries four character slots, not ten — a `model` Element
 * with five raw members is over the model's budget before any other reference is added.
 * This is the strongest argument for generating a person Element's reference eagerly.
 */
export const ELEMENT_PERSON_FALLBACK_LIMIT = 4;

/** Categories whose reference is a person, and which therefore need a rights basis. */
export const ELEMENT_PERSON_CATEGORIES: readonly ElementCategory[] = ['model', 'character'];

export const isElementPersonCategory = (category: ElementCategory): boolean =>
  ELEMENT_PERSON_CATEGORIES.includes(category);

/**
 * Seeded on every generated Element reference asset. Registered assets are real Library
 * rows, so without a tag a brand with twenty Elements would find its Library full of
 * near-identical studio shots; the browse surfaces exclude this tag by default
 * (HIDDEN_LIBRARY_TAGS in ./library-browse). Search still finds them.
 */
export const ELEMENT_REFERENCE_TAG = 'element-reference';

// --- Boards -----------------------------------------------------------------

/**
 * What one member image IS to the Element — the turnaround view, the label, the hand that
 * gives it scale. Stored as `origin_ref.memberRoles[assetId]` and surfaced as
 * `members[i].role`; a member with no role is still a member.
 */
export const ELEMENT_MEMBER_ROLES = [
  'identity',
  'front',
  'back',
  'side',
  'three_quarter',
  'top',
  'detail',
  'label',
  'packaging',
  'in_hand',
  'wardrobe',
  'pose',
] as const;
export const elementMemberRoleSchema = z.enum(ELEMENT_MEMBER_ROLES);
export type ElementMemberRole = z.infer<typeof elementMemberRoleSchema>;

/** Keyed by member asset id. The Backend prunes it to the current members on every write. */
export const elementMemberRolesSchema = z.record(z.string().uuid(), elementMemberRoleSchema);
export type ElementMemberRoles = z.infer<typeof elementMemberRolesSchema>;

/**
 * `/slug` style shortcuts an Element carries into every generation it feeds. The Backend
 * validates each against the brand's visual creative-direction skills; the shape here is the
 * token grammar `parseShortcutTokens` reads (lowercase slug, no slash).
 */
export const ELEMENT_STYLE_SLUG_LIMIT = 6;
export const elementStyleSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(120);
export const elementStyleSlugsSchema = z
  .array(elementStyleSlugSchema)
  .max(ELEMENT_STYLE_SLUG_LIMIT);

/** Linked boards: the look an Element is shot in, kept as other same-brand Elements. */
export const ELEMENT_BOARD_LIMIT = 4;
export const ELEMENT_BOARD_CATEGORIES = [
  'moodboard',
  'style',
  'palette',
  'setting',
  'location',
] as const satisfies readonly ElementCategory[];
export const elementBoardIdsSchema = z.array(z.string().uuid()).max(ELEMENT_BOARD_LIMIT);

export const isElementBoardCategory = (category: ElementCategory): boolean =>
  (ELEMENT_BOARD_CATEGORIES as readonly ElementCategory[]).includes(category);

/** The two categories whose reference is the product continuity sheet. */
export const isElementProductCategory = (category: ElementCategory): boolean =>
  category === 'product' || category === 'object';

// --- Product facts -----------------------------------------------------------

/**
 * Variants per product. A colourway/size grid is the shape a real catalog export has;
 * beyond this the brand is uploading a whole store as one Element and wants many.
 */
export const ELEMENT_PRODUCT_VARIANT_LIMIT = 100;

/**
 * Money is `campaignMoneySchema` from `../goals/campaign-artifacts` — the money type this
 * package already has. Minor-units integer plus an ISO-4217 code, never a float: 19.99
 * USD is `{ amountMinor: 1999, currency: 'USD' }`. A second money type here would be a
 * second rounding rule.
 */
export const elementProductVariantSchema = z
  .object({
    name: z.string().min(1).max(200),
    sku: z.string().min(1).max(120).nullable().optional(),
    price: campaignMoneySchema.nullable().optional(),
  })
  .strict();
export type ElementProductVariant = z.infer<typeof elementProductVariantSchema>;

/**
 * The non-image half of a product Element.
 *
 * EVERY field is optional, and the block itself is optional wherever it appears. An
 * Element is a set of reference images first — a product with no price is still a
 * product, and every payload that parsed before this block existed still parses to the
 * same object, without a `product` key.
 */
export const elementProductFactsSchema = z
  .object({
    sku: z.string().min(1).max(120).nullable().optional(),
    price: campaignMoneySchema.nullable().optional(),
    productUrl: z.string().url().max(2000).nullable().optional(),
    variants: z.array(elementProductVariantSchema).max(ELEMENT_PRODUCT_VARIANT_LIMIT).default([]),
  })
  .strict();
export type ElementProductFacts = z.infer<typeof elementProductFactsSchema>;

export const ELEMENT_FACT_LIMIT = 24;
export const elementFactSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    value: z.string().trim().min(1).max(500),
  })
  .strict();
export type ElementFact = z.infer<typeof elementFactSchema>;

export const elementRevisionSchema = z
  .object({
    createdAt: z.string(),
    name: z.string().min(1).max(200),
    category: elementCategorySchema,
    guidelines: z.string().max(2000).nullable(),
    rightsNote: z.string().max(500).nullable(),
    product: elementProductFactsSchema.nullable().optional(),
    facts: z.array(elementFactSchema).max(ELEMENT_FACT_LIMIT).default([]),
    memberAssetIds: z.array(z.string().uuid()).max(ELEMENT_MEMBER_LIMIT),
    motionAssetId: z.string().uuid().nullable().default(null),
    defaultReferenceAssetId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type ElementRevision = z.infer<typeof elementRevisionSchema>;

// --- The stored shape --------------------------------------------------------

/**
 * `media.asset_groups.origin_ref` for an Element. The two existing writers of this
 * column stamp `{ kind, <sourceId> }`; this adds the Element's own state.
 *
 * `referenceHistory` is an ordered list of ASSET ids, not asset_versions: the version
 * RPC guards its storage path (`{brand}/{asset}/…`) and Studio writes to
 * `{brand}/canvas-creations/…`, so a regenerated reference cannot become v2 of the
 * existing asset without a bigger change. Each regeneration is therefore a new asset,
 * and set-default flips one field.
 */
export const elementOriginRefSchema = z
  .object({
    kind: z.literal('element').optional(),
    category: elementCategorySchema,
    guidelines: z.string().max(2000).nullable().optional(),
    rightsNote: z.string().max(500).nullable().optional(),
    product: elementProductFactsSchema.optional(),
    facts: z.array(elementFactSchema).max(ELEMENT_FACT_LIMIT).default([]),
    motionAssetId: z.string().uuid().nullable().default(null),
    motionRecipe: z
      .object({
        durationSec: z.number().finite().positive().max(86_400),
        keyframes: z.array(z.unknown()).max(500),
      })
      .nullable()
      .optional(),
    referenceHistory: z.array(z.string().uuid()).default([]),
    defaultReferenceAssetId: z.string().uuid().nullable().default(null),
    revisions: z.array(elementRevisionSchema).default([]),
    // Optional and never defaulted: absent in the bag means absent on the record, which is
    // what keeps a Backend that knows these keys readable by a Frontend that does not.
    memberRoles: elementMemberRolesSchema.optional(),
    styleSlugs: elementStyleSlugsSchema.optional(),
    boardElementIds: elementBoardIdsSchema.optional(),
  })
  .passthrough();
export type ElementOriginRef = z.infer<typeof elementOriginRefSchema>;

export const elementMemberSchema = z
  .object({
    assetId: z.string().uuid(),
    position: z.number().int().nonnegative(),
    role: elementMemberRoleSchema.optional(),
  })
  .strict();
export type ElementMember = z.infer<typeof elementMemberSchema>;

export const elementRecordSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(200),
    category: elementCategorySchema,
    guidelines: z.string().nullable(),
    rightsNote: z.string().nullable(),
    product: elementProductFactsSchema.nullable().optional(),
    facts: z.array(elementFactSchema).max(ELEMENT_FACT_LIMIT).optional(),
    motionAssetId: z.string().uuid().nullable().optional(),
    motionRecipe: z
      .object({
        durationSec: z.number().finite().positive().max(86_400),
        keyframes: z.array(z.unknown()).max(500),
      })
      .nullable()
      .optional(),
    members: z.array(elementMemberSchema).max(ELEMENT_MEMBER_LIMIT),
    referenceHistory: z.array(z.string().uuid()),
    defaultReferenceAssetId: z.string().uuid().nullable(),
    revisions: z.array(elementRevisionSchema).optional(),
    /** Omitted when empty — see the deploy-order note on `elementOriginRefSchema`. */
    styleSlugs: elementStyleSlugsSchema.optional(),
    boardElementIds: elementBoardIdsSchema.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type ElementRecord = z.infer<typeof elementRecordSchema>;

// --- Failure codes -----------------------------------------------------------

// Named, not numbered: the caller needs to know what to DO about it. A member that is a
// video and a member that belongs to another brand are both "bad member" to an HTTP 422
// and completely different to a person fixing it.
export const elementErrorCodeSchema = z.enum([
  'element_not_found',
  'element_name_conflict',
  'element_member_limit_exceeded',
  'element_member_not_image',
  'element_member_wrong_brand',
  'element_member_not_found',
  'element_rights_note_required',
  'element_reference_not_in_history',
  'element_reference_generation_failed',
  'element_update_conflict',
  'element_motion_not_video',
  'element_catalog_row_invalid',
  'element_style_unknown',
  'element_style_conflict',
  'element_board_invalid',
  'element_not_promotable',
]);
export type ElementErrorCode = z.infer<typeof elementErrorCodeSchema>;

// --- Wire envelopes ----------------------------------------------------------

const memberIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(ELEMENT_MEMBER_LIMIT, { message: 'element_member_limit_exceeded' });

export const createElementRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().min(1).max(200),
    category: elementCategorySchema,
    guidelines: z.string().max(2000).nullable().optional(),
    rightsNote: z.string().max(500).nullable().optional(),
    product: elementProductFactsSchema.optional(),
    facts: z.array(elementFactSchema).max(ELEMENT_FACT_LIMIT).default([]),
    motionAssetId: z.string().uuid().nullable().optional(),
    motionRecipe: z
      .object({
        durationSec: z.number().finite().positive().max(86_400),
        keyframes: z.array(z.unknown()).max(500),
      })
      .nullable()
      .optional(),
    memberAssetIds: memberIdsSchema,
    memberRoles: elementMemberRolesSchema.optional(),
    styleSlugs: elementStyleSlugsSchema.optional(),
    boardElementIds: elementBoardIdsSchema.optional(),
  })
  .strict();
export type CreateElementRequest = z.input<typeof createElementRequestSchema>;

export const updateElementRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    category: elementCategorySchema.optional(),
    guidelines: z.string().max(2000).nullable().optional(),
    rightsNote: z.string().max(500).nullable().optional(),
    product: elementProductFactsSchema.nullable().optional(),
    facts: z.array(elementFactSchema).max(ELEMENT_FACT_LIMIT).optional(),
    motionAssetId: z.string().uuid().nullable().optional(),
    motionRecipe: z
      .object({
        durationSec: z.number().finite().positive().max(86_400),
        keyframes: z.array(z.unknown()).max(500),
      })
      .nullable()
      .optional(),
    memberAssetIds: memberIdsSchema.optional(),
    /** Each REPLACES the stored value; an empty one clears it. */
    memberRoles: elementMemberRolesSchema.optional(),
    styleSlugs: elementStyleSlugsSchema.optional(),
    boardElementIds: elementBoardIdsSchema.optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  .strict();
export type UpdateElementRequest = z.infer<typeof updateElementRequestSchema>;

export const elementResponseSchema = z.object({ element: elementRecordSchema }).strict();
export const listElementsResponseSchema = z
  .object({ elements: z.array(elementRecordSchema) })
  .strict();
export type ListElementsResponse = z.infer<typeof listElementsResponseSchema>;

export const generateElementReferenceResponseSchema = z
  .object({
    element: elementRecordSchema,
    referenceAssetId: z.string().uuid(),
    /** Kept for wire compatibility; candidate-only generation always returns false. */
    becameDefault: z.boolean(),
  })
  .strict();
export type GenerateElementReferenceResponse = z.infer<
  typeof generateElementReferenceResponseSchema
>;

/** `assetId: null` CLEARS the default — the same endpoint sets and unsets. */
export const setElementDefaultReferenceRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid().nullable(),
    expectedUpdatedAt: z.string(),
  })
  .strict();
export type SetElementDefaultReferenceRequest = z.infer<
  typeof setElementDefaultReferenceRequestSchema
>;

export const addElementReferenceRequestSchema = z
  .object({ brandId: z.string().uuid(), assetId: z.string().uuid() })
  .strict();
export type AddElementReferenceRequest = z.infer<typeof addElementReferenceRequestSchema>;

export const restoreElementRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    revisionIndex: z.number().int().nonnegative(),
    expectedUpdatedAt: z.string(),
  })
  .strict();
export type RestoreElementRequest = z.infer<typeof restoreElementRequestSchema>;

/**
 * POST /api/media/elements/:id/headless — the user's click that makes a product Element a
 * typed, approved headless product the Optimizer and server canvas can cast. `rightsNote` is
 * the rights basis; it is written to the Element first when the Element has none.
 */
export const promoteElementToHeadlessRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    rightsNote: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type PromoteElementToHeadlessRequest = z.infer<typeof promoteElementToHeadlessRequestSchema>;
export const promoteElementToHeadlessResponseSchema = z
  .object({
    element: elementRecordSchema,
    revision: z.number().int().positive(),
    approved: z.literal(true),
  })
  .strict();
export type PromoteElementToHeadlessResponse = z.infer<
  typeof promoteElementToHeadlessResponseSchema
>;

// --- Identity ----------------------------------------------------------------

/**
 * `external_key = 'element:{slug}'`, matching the existing `'paid_creative:{runId}'`
 * convention, so the group's `unique (brand_id, kind, external_key)` does the
 * duplicate-detection. Derived ONCE at create and immutable afterwards: renaming edits
 * the `title` column, never the key, so a rename cannot orphan the Element's identity.
 */
export const elementSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'element';
};

export const elementExternalKey = (slug: string): string => `element:${slug}`;

/**
 * Decide whether an incoming catalog row is a product we ALREADY hold.
 *
 * SKU wins over slug because the slug is derived from the name and the name is exactly
 * what a catalog export edits: "Hero Bottle" becoming "Hero Bottle 500ml" is a rename,
 * not a new product, and matching on slug alone would import a duplicate every quarter.
 * Slug is the fallback for the (very common) product carrying no SKU.
 *
 * `update` returns the EXISTING Element's id and nothing else, because that Element's
 * `slug`/`external_key` were fixed at create and must stay fixed — which is the whole
 * reason this decision is made here rather than by re-deriving a key from the new name.
 */
export type ElementCatalogMatch =
  | { action: 'update'; elementId: string; matchedBy: 'sku' | 'slug' }
  | { action: 'create'; slug: string; externalKey: string };

const normalizeSku = (sku: string | null | undefined): string | null => {
  const trimmed = sku?.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

interface SkuBearing {
  product?: { sku?: string | null } | null;
}

export const matchCatalogRowToElement = (
  row: { name: string } & SkuBearing,
  existing: readonly ({ id: string; slug: string } & SkuBearing)[],
): ElementCatalogMatch => {
  const sku = normalizeSku(row.product?.sku);
  if (sku) {
    const bySku = existing.find((candidate) => normalizeSku(candidate.product?.sku) === sku);
    if (bySku) return { action: 'update', elementId: bySku.id, matchedBy: 'sku' };
  }
  const slug = elementSlug(row.name);
  const bySlug = existing.find((candidate) => candidate.slug === slug);
  if (bySlug) return { action: 'update', elementId: bySlug.id, matchedBy: 'slug' };
  return { action: 'create', slug, externalKey: elementExternalKey(slug) };
};

// --- Catalog import ----------------------------------------------------------

/**
 * Rows per submission. A brand hands us a catalog export, not a hand-typed form — a
 * few hundred products is one real collection and still one HTTP body.
 */
export const ELEMENT_CATALOG_ROW_LIMIT = 500;

/** One product in a catalog submission: a name, its facts, and its images. */
export const elementCatalogRowSchema = z
  .object({
    name: z.string().min(1).max(200),
    guidelines: z.string().max(2000).nullable().optional(),
    rightsNote: z.string().max(500).nullable().optional(),
    product: elementProductFactsSchema.optional(),
    memberAssetIds: memberIdsSchema,
  })
  .strict();
export type ElementCatalogRow = z.infer<typeof elementCatalogRowSchema>;

/**
 * `rows` is `unknown[]` ON PURPOSE. `z.array(elementCatalogRowSchema)` here would fail a
 * 200-product upload whole because row 47 has a malformed price — a catalog nobody can
 * upload. The envelope checks only what is cheap and total (the brand, the row count);
 * each row is judged on its own by `partitionElementCatalog`.
 */
export const importElementCatalogRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    category: elementCategorySchema.default('product'),
    rows: z.array(z.unknown()).min(1).max(ELEMENT_CATALOG_ROW_LIMIT),
  })
  .strict();
export type ImportElementCatalogRequest = z.infer<typeof importElementCatalogRequestSchema>;

export const elementCatalogAcceptedSchema = z
  .object({
    status: z.literal('accepted'),
    index: z.number().int().nonnegative(),
    row: elementCatalogRowSchema,
    slug: z.string(),
    externalKey: z.string(),
  })
  .strict();
export type ElementCatalogAccepted = z.infer<typeof elementCatalogAcceptedSchema>;

export const elementCatalogRejectedSchema = z
  .object({
    status: z.literal('rejected'),
    index: z.number().int().nonnegative(),
    /** Best effort — a row too malformed to read a name off reports null. */
    name: z.string().nullable(),
    reason: elementErrorCodeSchema,
    /** `path: message`, one per failed field, so row 47 can actually be FIXED. */
    issues: z.array(z.string()),
  })
  .strict();
export type ElementCatalogRejected = z.infer<typeof elementCatalogRejectedSchema>;

export const elementCatalogOutcomeSchema = z.discriminatedUnion('status', [
  elementCatalogAcceptedSchema,
  elementCatalogRejectedSchema,
]);
export type ElementCatalogOutcome = z.infer<typeof elementCatalogOutcomeSchema>;

export const importElementCatalogResponseSchema = z
  .object({
    accepted: z.array(elementCatalogAcceptedSchema),
    rejected: z.array(elementCatalogRejectedSchema),
  })
  .strict();
export type ImportElementCatalogResponse = z.infer<typeof importElementCatalogResponseSchema>;

const readRowName = (raw: unknown): string | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const name = (raw as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim().length > 0 ? name : null;
};

/**
 * Judge a catalog submission row by row. Pure — no id, no clock, no store.
 *
 * Two things reject a row: it does not parse, or its slug collides with a row already
 * accepted in the SAME submission. The second is not pedantry — `unique (brand_id, kind,
 * external_key)` would reject the duplicate at the database anyway, halfway through the
 * import, with nothing pointing at which row caused it.
 *
 * A rejected row never stops its neighbours. The caller creates the accepted rows and
 * hands the rejected ones back with their index.
 */
export const partitionElementCatalog = (
  rows: readonly unknown[],
): { accepted: ElementCatalogAccepted[]; rejected: ElementCatalogRejected[] } => {
  const accepted: ElementCatalogAccepted[] = [];
  const rejected: ElementCatalogRejected[] = [];
  const seenSlugs = new Set<string>();

  rows.forEach((raw, index) => {
    const parsed = elementCatalogRowSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({
        status: 'rejected',
        index,
        name: readRowName(raw),
        reason: 'element_catalog_row_invalid',
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || '(row)'}: ${issue.message}`,
        ),
      });
      return;
    }

    const slug = elementSlug(parsed.data.name);
    if (seenSlugs.has(slug)) {
      rejected.push({
        status: 'rejected',
        index,
        name: parsed.data.name,
        reason: 'element_name_conflict',
        issues: [`name: "${parsed.data.name}" repeats the slug "${slug}" from an earlier row`],
      });
      return;
    }

    seenSlugs.add(slug);
    accepted.push({
      status: 'accepted',
      index,
      row: parsed.data,
      slug,
      externalKey: elementExternalKey(slug),
    });
  });

  return { accepted, rejected };
};

// --- Emission ----------------------------------------------------------------

/**
 * What an Element node actually sends downstream.
 *
 * With a generated reference: exactly ONE ref — that is the whole point, since an
 * Element in fallback otherwise monopolises the node's reference budget and two
 * Elements cannot be composed at all.
 *
 * Without one: the raw members, in `position` order (the prompt manifest depends on
 * that order), truncated to the model's budget for the category. Fallback is a real
 * mode, not an error path — an Element is usable the moment its members exist.
 */
export const resolveElementRefs = (element: {
  category: ElementCategory;
  members: readonly ElementMember[];
  defaultReferenceAssetId: string | null;
}): LibraryImageRef[] => {
  if (element.defaultReferenceAssetId) {
    return [{ asset_id: element.defaultReferenceAssetId }];
  }
  const limit = isElementPersonCategory(element.category)
    ? ELEMENT_PERSON_FALLBACK_LIMIT
    : ELEMENT_MEMBER_LIMIT;
  return [...element.members]
    .sort((left, right) => left.position - right.position)
    .slice(0, limit)
    .map((member) => ({ asset_id: member.assetId }));
};

/**
 * The prompt line that rides WITH the emitted image.
 *
 * An Element that contributes an image but no words has handed the model an ambiguity
 * it will resolve on its own — Google's own rule is that unlabelled references make
 * "the robot" mean any of the robots in the inputs. The second sentence is the shipped
 * house wording from the compiled `<references>` block, so the literal canvas path
 * stops being the weaker of the two.
 */
export const buildElementReferenceLabel = (params: {
  category: ElementCategory;
  name: string;
  slot: number;
}): string =>
  `Reference image #${params.slot} is the ${params.category} reference for "${params.name}". ` +
  'Preserve it exactly; do not redraw, restyle or improve it.';

/**
 * The one asset an Element node stands for: its motion clip for a motion use, else its first
 * emitted ref (the pinned sheet, or the first member in fallback). The browser canvas and the
 * server canvas run both resolve an Element node through this.
 */
export const elementSourceAssetId = (
  element: {
    category: ElementCategory;
    members: readonly ElementMember[];
    defaultReferenceAssetId: string | null;
    motionAssetId?: string | null;
  },
  intent: ElementUseIntent,
): string | undefined => {
  if (intent === 'motion') return element.motionAssetId ?? undefined;
  return resolveElementRefs(element)[0]?.asset_id;
};

/**
 * Put an Element's `/slug` style tokens BEFORE the prompt. The shortcut resolver keeps the
 * later of two conflicting shortcuts, so a slug the user typed in the prompt beats the
 * Element's default with no rule of its own; a slug both name resolves once.
 */
export const withElementStyleTokens = (prompt: string, slugs: readonly string[]): string => {
  const tokens = [...new Set(slugs)].map((slug) => `/${slug}`).join(' ');
  if (!tokens) return prompt;
  return prompt.trim() ? `${tokens} ${prompt}` : tokens;
};

// --- Reference generation prompt ---------------------------------------------

const UNIVERSAL_NEGATIVES =
  'watermark, illegible typography, invented logo, alternate identity, alternate product, ' +
  'cropped panels, overlapping panels, decorative border, promotional copy';

const MANIFEST_NOUN: Record<ElementCategory, string> = {
  model: 'source photograph of the person',
  character: 'source photograph of the character',
  product: 'source photograph of the product',
  object: 'source photograph of the object',
  material: 'source photograph of the material',
  setting: 'source photograph of the setting',
  location: 'source photograph of the location',
  landscape: 'source photograph of the landscape',
  style: 'source image carrying the visual style',
  moodboard: 'source image carrying the creative direction',
  palette: 'source image carrying the colour palette',
  animation: 'ordered keyframe from the animation',
  effect: 'ordered keyframe from the visual effect',
  general: 'source image of the subject',
};

const SHEET_PROFILE: Record<ElementCategory, string> = {
  model:
    'a full-body front, three-quarter, side, back and three-quarter-back turnaround; a large neutral portrait; expression studies; hair, eye and distinguishing-mark close-ups',
  character:
    'a full-body front, three-quarter, side and back turnaround with the exact costume; a large portrait; expression studies; costume and accessory details',
  product:
    'front, three-quarter, side, back and top product views; one large hero view; label, closure, material and base-marking close-ups',
  object:
    'front, three-quarter, side, back and top views; one large hero view; construction, material, joinery and functional-detail close-ups',
  material:
    'edge-to-edge macro swatches under flat, grazing and back light; repeat-scale samples; finish and texture close-ups',
  setting:
    'wide establishing, reverse, side and approach views; architectural, surface and characteristic-light details; an uncluttered environment plate',
  location:
    'wide establishing, reverse, side and approach views; spatial landmarks, access points, surfaces and characteristic-light details',
  landscape:
    'wide, medium and detail views from distinct vantage points; horizon, terrain, vegetation, atmospheric and characteristic-light studies',
  style:
    'representative compositions, texture and mark-making studies, tonal examples, edge-quality samples and a compact colour swatch row',
  moodboard:
    'a coherent set of composition, material, lighting, texture and atmosphere panels plus a compact colour swatch row',
  palette:
    'large proportional colour fields, neutral and accent swatches, representative gradients, contrast pairs and small application examples',
  animation:
    'ordered keyframes showing anticipation, action, transition and settle; motion-path and timing studies; consistent subject scale across frames',
  effect:
    'ordered keyframes showing onset, build, peak, dissipation and residue; shape, colour, illumination and compositing-detail studies',
  general:
    'front, three-quarter, side and back views where applicable; one large hero view and close-ups of every identity-defining detail',
};

export interface ElementReferencePrompt {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
}

/**
 * Build the reference-generation call's prompt for one category.
 *
 * The manifest opens the prompt because the backend passes images UNLABELLED and purely
 * positional — the provider emits prompt text first, then image parts in array order —
 * so `- Image 1: …` lines are the only thing telling the model that several photographs
 * are one subject rather than several. This is the single cheapest mitigation for
 * duplicated-subject output.
 *
 * Operator guidelines go LAST, on purpose: the last words are the ones that must survive
 * a careless reader. The block is omitted entirely when empty — an empty section is a
 * question the model has to answer.
 */
export const buildElementReferencePrompt = (
  category: ElementCategory,
  memberCount: number,
  guidelines?: string | null,
): ElementReferencePrompt => {
  const noun = MANIFEST_NOUN[category];
  const manifest = Array.from(
    { length: Math.max(memberCount, 0) },
    (_unused, index) => `- Image ${index + 1}: ${noun}.`,
  ).join('\n');

  const trimmedGuidelines = guidelines?.trim();
  const sections = [
    manifest,
    `Create one professional ${category} reference sheet on a seamless warm-white studio board.

The ${memberCount} attached images describe the SAME reusable Element. Preserve every stable identity-defining proportion, colour, material, mark and construction detail. Arrange a clean, evenly spaced multi-panel sheet containing ${SHEET_PROFILE[category]}.

Repeat the same subject across panels when the profile calls for multiple views. Keep proportions, identity, costume or product design completely consistent between panels. Use neutral, even lighting unless lighting is itself the Element. Reserve a clean header band at the top. Do not render labels or other text; the application adds authoritative names and facts after generation.`,
    ...(trimmedGuidelines ? [`Operator guidance (highest priority): ${trimmedGuidelines}`] : []),
  ].filter((section) => section.length > 0);

  return {
    prompt: sections.join('\n\n'),
    negativePrompt: UNIVERSAL_NEGATIVES,
    aspectRatio: '16:9',
  };
};

/**
 * The framing of the reference the Element route generates. A person's and a product's
 * reference is a portrait continuity sheet (./continuity-sheet); every other category is the
 * one-call board `buildElementReferencePrompt` describes.
 */
export const elementReferenceAspectRatio = (category: ElementCategory): string =>
  isElementPersonCategory(category) || isElementProductCategory(category) ? '3:4' : '16:9';

export { libraryImageRefSchema as elementImageRefSchema };
