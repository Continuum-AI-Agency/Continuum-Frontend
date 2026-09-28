// Custom fields: the brand's own metadata vocabulary on a Library asset.
//
// Tags answer "what is in this?" — a flat, ungoverned bag. Custom fields answer
// "what do WE need to know about this?" — rating, usage rights, assignee,
// campaign, shoot date — with a governed vocabulary per field, so a brand can
// filter and board on values that mean something to them.
//
// The type list mirrors media.custom_fields.type; the value each type holds is
// enforced by a DB trigger on media.asset_field_values and mirrored here by
// valueSchemaFor.
//
// review_status is NOT here. It stays first-class: it carries an append-only
// audit trail and its own RLS, and demoting an approval to a select that anyone
// can silently overwrite would destroy the only thing that makes it trustworthy.

import { z } from 'zod';

// Exactly the media.custom_fields type CHECK. `user_multi` holds several brand members
// (at most MAX_CUSTOM_FIELD_USERS) and `long_text` up to MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH
// characters; both carry options [].
export const CUSTOM_FIELD_TYPES = [
  'single_select',
  'multi_select',
  'text',
  'date',
  'number',
  'checkbox',
  'rating',
  'user',
  'url',
  'status',
  'user_multi',
  'long_text',
] as const;
export const customFieldTypeSchema = z.enum(CUSTOM_FIELD_TYPES);
export type CustomFieldType = z.infer<typeof customFieldTypeSchema>;

/** Selects carry option IDs so renaming a label cannot orphan the assets holding it. */
export const customFieldOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).max(120),
    color: z.string().max(32).nullable().optional(),
  })
  .strict();
export type CustomFieldOption = z.infer<typeof customFieldOptionSchema>;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** A status option is a select option whose colour is mandatory and a real hex. */
export const statusOptionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    color: z.string().regex(HEX_COLOR_PATTERN),
  })
  .strict();
export type StatusOption = z.infer<typeof statusOptionSchema>;

export const statusOptionsSchema = z
  .array(statusOptionSchema)
  .min(1)
  .max(50)
  .refine((options) => new Set(options.map((option) => option.id)).size === options.length, {
    message: 'Status option ids must be unique',
  });

/** A rating field without `max` rates out of DEFAULT_RATING_MAX. */
export const DEFAULT_RATING_MAX = 5;

export const ratingOptionsSchema = z
  .object({ max: z.number().int().min(1).max(10).optional() })
  .strict();
export type RatingOptions = z.infer<typeof ratingOptionsSchema>;

// custom_fields.options: an option array for the selects and status, the rating
// object for rating, and [] for every other type.
export const customFieldOptionsSchema = z.union([
  z.array(customFieldOptionSchema),
  ratingOptionsSchema,
]);
export type CustomFieldOptions = z.infer<typeof customFieldOptionsSchema>;

/** The options shape a field of `type` must carry. */
export function optionsSchemaFor(type: CustomFieldType): z.ZodType<CustomFieldOptions> {
  switch (type) {
    case 'single_select':
    case 'multi_select':
      return z.array(customFieldOptionSchema).min(1).max(200);
    case 'status':
      return statusOptionsSchema;
    case 'rating':
      return ratingOptionsSchema;
    default:
      return z.array(customFieldOptionSchema).max(0);
  }
}

export const customFieldSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    name: z.string().min(1).max(120),
    type: customFieldTypeSchema,
    options: customFieldOptionsSchema,
    position: z.number().int().nonnegative(),
    isDefault: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type CustomField = z.infer<typeof customFieldSchema>;

// A brand can hold 100 fields. Past that the filter UI stops being a UI.
export const MAX_CUSTOM_FIELDS_PER_BRAND = 100;

export const createCustomFieldRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().min(1).max(120),
    type: customFieldTypeSchema,
    options: customFieldOptionsSchema.optional(),
  })
  .strict()
  .superRefine((field, context) => {
    // Absent options mean "none": [] for the plain types, {} for rating.
    const options = field.options ?? (field.type === 'rating' ? {} : []);
    const checked = optionsSchemaFor(field.type).safeParse(options);
    if (!checked.success) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message:
          field.type === 'single_select' || field.type === 'multi_select'
            ? 'A select field needs at least one option'
            : `Invalid options for a ${field.type} field`,
      });
    }
  });
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequestSchema>;

export const updateCustomFieldRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    fieldId: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    // Options may be added or relabelled. A REMOVED option's id stays valid on
    // the assets already holding it until they are re-saved — the alternative is
    // silently rewriting history on every asset, which is worse.
    options: customFieldOptionsSchema.optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .strict();
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequestSchema>;

export const deleteCustomFieldRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    fieldId: z.string().uuid(),
  })
  .strict();
export type DeleteCustomFieldRequest = z.infer<typeof deleteCustomFieldRequestSchema>;

// The value shapes, keyed to the field's declared type. Validated against the
// field at the boundary: a single_select holding an option id that the field
// does not define is a lie the DB cannot catch (the column is jsonb).
export const customFieldValueSchema = z.union([
  z.string(), // single_select · status (option id) · text · long_text · date (ISO yyyy-mm-dd) · user (uuid) · url
  z.number(), // number · rating
  z.boolean(), // checkbox
  z.array(z.string()), // multi_select (option ids) · user_multi (user uuids)
  z.null(), // cleared
]);
export type CustomFieldValue = z.infer<typeof customFieldValueSchema>;

export const MAX_CUSTOM_FIELD_TEXT_LENGTH = 2000;
export const MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH = 20_000;
export const MAX_CUSTOM_FIELD_USERS = 50;
export const MAX_CUSTOM_FIELD_URL_LENGTH = 2048;

/** The choosable options of a select or status field; [] for every other shape (e.g. rating's {max}). */
export function customFieldChoiceOptions(field: Pick<CustomField, 'options'>): CustomFieldOption[] {
  return Array.isArray(field.options) ? field.options : [];
}

function optionIdsOf(options: CustomFieldOptions): Set<string> {
  return new Set(customFieldChoiceOptions({ options }).map((option) => option.id));
}

/**
 * The schema for a (non-null) value of a field, mirroring the DB trigger on
 * media.asset_field_values. `user` checks the uuid shape only — brand
 * membership is the DB's call. Options that do not fit the type reject every
 * value rather than guessing.
 */
export function valueSchemaFor(
  type: CustomFieldType,
  options: CustomFieldOptions,
): z.ZodType<CustomFieldValue> {
  const optionIds = optionIdsOf(options);
  const isOption = (id: string) => optionIds.has(id);
  switch (type) {
    case 'single_select':
    case 'status':
      return z.string().refine(isOption, { message: 'Not an option on this field' });
    case 'multi_select':
      return z.array(z.string().refine(isOption, { message: 'Not an option on this field' }));
    case 'text':
      return z.string().max(MAX_CUSTOM_FIELD_TEXT_LENGTH);
    case 'date':
      return z.string().date();
    case 'number':
      return z.number();
    case 'checkbox':
      return z.boolean();
    case 'rating': {
      const rating = ratingOptionsSchema.safeParse(options);
      if (!rating.success) return z.never();
      return z
        .number()
        .int()
        .min(1)
        .max(rating.data.max ?? DEFAULT_RATING_MAX);
    }
    case 'user':
      return z.string().uuid();
    case 'user_multi':
      return z
        .array(z.string().uuid())
        .max(MAX_CUSTOM_FIELD_USERS)
        .refine((ids) => new Set(ids).size === ids.length, { message: 'Each person once' });
    case 'long_text':
      return z.string().max(MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH);
    case 'url':
      return z
        .string()
        .max(MAX_CUSTOM_FIELD_URL_LENGTH)
        .regex(/^https?:\/\/\S+$/i);
  }
}

export const assetFieldValueSchema = z
  .object({
    fieldId: z.string().min(1),
    value: customFieldValueSchema,
    updatedAt: z.string().nullable().optional(),
  })
  .strict();
export type AssetFieldValue = z.infer<typeof assetFieldValueSchema>;

export const setAssetFieldValueRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid(),
    fieldId: z.string().uuid(),
    value: customFieldValueSchema,
  })
  .strict();
export type SetAssetFieldValueRequest = z.infer<typeof setAssetFieldValueRequestSchema>;

export const listCustomFieldsResponseSchema = z
  .object({
    fields: z.array(customFieldSchema),
  })
  .strict();
export type ListCustomFieldsResponse = z.infer<typeof listCustomFieldsResponseSchema>;

export const listAssetFieldValuesResponseSchema = z
  .object({
    values: z.array(assetFieldValueSchema),
  })
  .strict();
export type ListAssetFieldValuesResponse = z.infer<typeof listAssetFieldValuesResponseSchema>;

// Filtering. Three operators, which is what the field types can honestly express:
// "is any of" (selects), "is" (text/date exact), "is empty" (unset).
export const customFieldFilterOperatorSchema = z.enum(['any_of', 'is', 'is_empty']);
export type CustomFieldFilterOperator = z.infer<typeof customFieldFilterOperatorSchema>;

/**
 * A filter value naming "whoever is looking" — so one saved "Assigned to me" means
 * each person who opens it. Resolved to the viewer's id at read time, by the SQL
 * smart-collection evaluator and by the Frontend's field-filter resolver alike.
 */
export const CURRENT_USER_FILTER_TOKEN = '@me';

export const customFieldFilterSchema = z
  .object({
    fieldId: z.string().min(1),
    operator: customFieldFilterOperatorSchema,
    // Option ids for a select; the literal for text/date. Empty for is_empty.
    values: z.array(z.string()).default([]),
  })
  .strict();
export type CustomFieldFilter = z.infer<typeof customFieldFilterSchema>;

// Saved filters ride on the EXISTING smart-collection seam (media.collections
// kind='smart', smart_query jsonb) rather than inventing a second concept —
// a saved filter and a smart collection are the same idea wearing two hats.
export const smartQueryFieldFiltersSchema = z
  .object({
    fieldFilters: z.array(customFieldFilterSchema).max(20).optional(),
  })
  .passthrough();

/** Seeded for every brand so the feature is useful the moment it is switched on. */
export const DEFAULT_CUSTOM_FIELDS: ReadonlyArray<{
  name: string;
  type: CustomFieldType;
  options: CustomFieldOption[];
}> = [
  {
    name: 'Rating',
    type: 'single_select',
    options: [
      { id: 'r1', label: '★' },
      { id: 'r2', label: '★★' },
      { id: 'r3', label: '★★★' },
      { id: 'r4', label: '★★★★' },
      { id: 'r5', label: '★★★★★' },
    ],
  },
  {
    name: 'Usage rights',
    type: 'single_select',
    options: [
      { id: 'unlimited', label: 'Unlimited' },
      { id: 'licensed', label: 'Licensed — check expiry' },
      { id: 'internal', label: 'Internal only' },
      { id: 'expired', label: 'Expired' },
    ],
  },
  { name: 'Rights expiry', type: 'date', options: [] },
];
