// Custom fields: the brand's own metadata vocabulary on a Library asset.
//
// Tags answer "what is in this?" — a flat, ungoverned bag. Custom fields answer
// "what do WE need to know about this?" — rating, usage rights, assignee,
// campaign, shoot date — with a governed vocabulary per field, so a brand can
// filter and board on values that mean something to them.
//
// Four types only. That is the whole surface the category leader ships, and it
// is the set a filter UI can express honestly. A number or boolean type buys a
// widget and a pile of operators nobody uses.
//
// review_status is NOT here. It stays first-class: it carries an append-only
// audit trail and its own RLS, and demoting an approval to a select that anyone
// can silently overwrite would destroy the only thing that makes it trustworthy.

import { z } from 'zod';

export const CUSTOM_FIELD_TYPES = ['single_select', 'multi_select', 'text', 'date'] as const;
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

export const customFieldSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    name: z.string().min(1).max(120),
    type: customFieldTypeSchema,
    options: z.array(customFieldOptionSchema),
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
    options: z.array(customFieldOptionSchema).max(200).optional(),
  })
  .strict()
  .refine(
    (field) =>
      field.type === 'single_select' || field.type === 'multi_select'
        ? (field.options?.length ?? 0) > 0
        : true,
    { message: 'A select field needs at least one option', path: ['options'] },
  );
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequestSchema>;

export const updateCustomFieldRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    fieldId: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    // Options may be added or relabelled. A REMOVED option's id stays valid on
    // the assets already holding it until they are re-saved — the alternative is
    // silently rewriting history on every asset, which is worse.
    options: z.array(customFieldOptionSchema).max(200).optional(),
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
  z.string(), // single_select (option id) · text · date (ISO yyyy-mm-dd)
  z.array(z.string()), // multi_select (option ids)
  z.null(), // cleared
]);
export type CustomFieldValue = z.infer<typeof customFieldValueSchema>;

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

// Filtering. Three operators, which is what the four types can honestly express:
// "is any of" (selects), "is" (text/date exact), "is empty" (unset).
export const customFieldFilterOperatorSchema = z.enum(['any_of', 'is', 'is_empty']);
export type CustomFieldFilterOperator = z.infer<typeof customFieldFilterOperatorSchema>;

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
