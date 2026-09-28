// Custom fields: the browser seam for the field vocabulary + asset values, plus
// the PURE rules both the seam and the API routes depend on.
//
// The value column is jsonb, so the database cannot tell a single_select holding
// an option id the field never defined from one that is real, nor a date holding
// "banana" from a date. validateFieldValue is therefore the only thing standing
// between a governed vocabulary and a bag of junk — it lives here, pure and
// unit-tested, rather than buried inside the route that happens to call it.

import {
  type AssetFieldValue,
  assetFieldValueSchema,
  type CreateCustomFieldRequest,
  CURRENT_USER_FILTER_TOKEN,
  type CustomField,
  type CustomFieldFilter,
  type CustomFieldValue,
  customFieldChoiceOptions,
  customFieldFilterSchema,
  customFieldSchema,
  customFieldValueSchema,
  DEFAULT_RATING_MAX,
  type DeleteCustomFieldRequest,
  listAssetFieldValuesResponseSchema,
  listCustomFieldsResponseSchema,
  MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH,
  MAX_CUSTOM_FIELD_URL_LENGTH,
  MAX_CUSTOM_FIELD_USERS,
  type SetAssetFieldValueRequest,
  type UpdateCustomFieldRequest,
} from '@continuum/contracts';
import { z } from 'zod';

// A text value is a note, not a document. Past this it belongs in the asset's
// description, and the filter UI can no longer render it as a chip.
export const MAX_FIELD_TEXT_LENGTH = 2000;

// A filter set past this is not a filter, it is a query language.
export const MAX_FIELD_FILTERS = 20;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_PATTERN = /^https?:\/\/\S+$/i;

export type FieldValueSpec = Pick<CustomField, 'type' | 'options'>;

export type FieldValueCheck = { ok: true; value: CustomFieldValue } | { ok: false; reason: string };

// Rejects a date that parses as a string but is not a day on the calendar
// (2026-02-31, 2026-13-01) — a regex alone would let both through.
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Narrows an untrusted value against the field's DECLARED type, returning the
 * value normalized for storage. An empty value of any shape (null, "", [])
 * normalizes to null — "cleared" has exactly one representation, so `is_empty`
 * cannot be defeated by writing an empty string.
 */
export function validateFieldValue(field: FieldValueSpec, value: unknown): FieldValueCheck {
  if (value === null || value === undefined) return { ok: true, value: null };

  const optionIds = new Set(customFieldChoiceOptions(field).map((option) => option.id));

  switch (field.type) {
    case 'single_select': {
      if (typeof value !== 'string') {
        return { ok: false, reason: 'This field takes a single option id' };
      }
      if (value.length === 0) return { ok: true, value: null };
      if (!optionIds.has(value)) {
        return { ok: false, reason: `"${value}" is not an option on this field` };
      }
      return { ok: true, value };
    }
    case 'multi_select': {
      if (!Array.isArray(value)) {
        return { ok: false, reason: 'This field takes an array of option ids' };
      }
      const selected: string[] = [];
      for (const entry of value) {
        if (typeof entry !== 'string') {
          return { ok: false, reason: 'Option ids must be strings' };
        }
        if (!optionIds.has(entry)) {
          return { ok: false, reason: `"${entry}" is not an option on this field` };
        }
        if (!selected.includes(entry)) selected.push(entry);
      }
      return selected.length === 0 ? { ok: true, value: null } : { ok: true, value: selected };
    }
    case 'text': {
      if (typeof value !== 'string') return { ok: false, reason: 'This field takes text' };
      const trimmed = value.trim();
      if (trimmed.length === 0) return { ok: true, value: null };
      if (trimmed.length > MAX_FIELD_TEXT_LENGTH) {
        return { ok: false, reason: `Text is longer than ${MAX_FIELD_TEXT_LENGTH} characters` };
      }
      return { ok: true, value: trimmed };
    }
    case 'date': {
      if (typeof value !== 'string') {
        return { ok: false, reason: 'This field takes an ISO date (YYYY-MM-DD)' };
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) return { ok: true, value: null };
      if (!isCalendarDate(trimmed)) {
        return { ok: false, reason: `"${value}" is not a valid ISO date (YYYY-MM-DD)` };
      }
      return { ok: true, value: trimmed };
    }
    case 'status': {
      if (typeof value !== 'string') return { ok: false, reason: 'This field takes a status id' };
      if (value.length === 0) return { ok: true, value: null };
      if (!optionIds.has(value)) {
        return { ok: false, reason: `"${value}" is not a status on this field` };
      }
      return { ok: true, value };
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, reason: 'This field takes a number' };
      }
      return { ok: true, value };
    }
    case 'checkbox': {
      if (typeof value !== 'boolean')
        return { ok: false, reason: 'This field takes true or false' };
      return { ok: true, value };
    }
    case 'rating': {
      const max = ratingMax(field);
      // 0 stars is "not rated": the one cleared representation is null.
      if (value === 0) return { ok: true, value: null };
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
        return { ok: false, reason: `A rating is a whole number from 1 to ${max}` };
      }
      return { ok: true, value };
    }
    case 'user': {
      if (typeof value !== 'string') return { ok: false, reason: 'This field takes a user id' };
      if (value.length === 0) return { ok: true, value: null };
      if (!UUID_PATTERN.test(value)) return { ok: false, reason: `"${value}" is not a user id` };
      return { ok: true, value };
    }
    case 'user_multi': {
      if (!Array.isArray(value)) return { ok: false, reason: 'This field takes a list of user ids' };
      const people: string[] = [];
      for (const entry of value) {
        if (typeof entry !== 'string' || !UUID_PATTERN.test(entry)) {
          return { ok: false, reason: `"${String(entry)}" is not a user id` };
        }
        if (!people.includes(entry)) people.push(entry);
      }
      if (people.length > MAX_CUSTOM_FIELD_USERS) {
        return { ok: false, reason: `At most ${MAX_CUSTOM_FIELD_USERS} people` };
      }
      return people.length === 0 ? { ok: true, value: null } : { ok: true, value: people };
    }
    case 'long_text': {
      if (typeof value !== 'string') return { ok: false, reason: 'This field takes text' };
      const trimmed = value.trim();
      if (trimmed.length === 0) return { ok: true, value: null };
      if (trimmed.length > MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH) {
        return {
          ok: false,
          reason: `Text is longer than ${MAX_CUSTOM_FIELD_LONG_TEXT_LENGTH} characters`,
        };
      }
      return { ok: true, value: trimmed };
    }
    case 'url': {
      if (typeof value !== 'string') return { ok: false, reason: 'This field takes a link' };
      const trimmed = value.trim();
      if (trimmed.length === 0) return { ok: true, value: null };
      if (trimmed.length > MAX_CUSTOM_FIELD_URL_LENGTH || !URL_PATTERN.test(trimmed)) {
        return { ok: false, reason: `"${value}" is not an http(s) link` };
      }
      return { ok: true, value: trimmed };
    }
    default:
      // The row's type column is cast, not parsed, on the way out of the DB.
      return { ok: false, reason: 'Unknown field type' };
  }
}

/** The top of a rating field's scale. */
export function ratingMax(field: Pick<CustomField, 'options'>): number {
  const options = field.options;
  return !Array.isArray(options) && typeof options.max === 'number'
    ? options.max
    : DEFAULT_RATING_MAX;
}

/** Cleared, in every shape a stored value could take. */
export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// A stored scalar as the string a filter carries it as: 12 → "12", true → "true".
function filterLiteral(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * Filters may name the viewer as CURRENT_USER_FILTER_TOKEN ("Assigned to me"), so
 * one saved collection means a different person for everyone who opens it. The
 * token is replaced with the viewer's id before any value is compared.
 */
export function resolveViewerToken(
  filters: readonly CustomFieldFilter[],
  viewerId: string,
): CustomFieldFilter[] {
  return filters.map((filter) =>
    filter.values.includes(CURRENT_USER_FILTER_TOKEN)
      ? {
          ...filter,
          values: filter.values.map((value) =>
            value === CURRENT_USER_FILTER_TOKEN ? viewerId : value,
          ),
        }
      : filter,
  );
}

/**
 * Does a STORED value satisfy the filter? `is_empty` is answered here for a row
 * that exists but holds nothing; an asset with no row at all never reaches this
 * predicate (see resolveFieldFilterAssetIds — absence is the common case).
 */
export function matchesFieldFilter(value: unknown, filter: CustomFieldFilter): boolean {
  switch (filter.operator) {
    case 'is_empty':
      return isEmptyFieldValue(value);
    case 'any_of': {
      if (filter.values.length === 0) return false;
      // One predicate for every choice type: a single_select/status/user/rating
      // holds one value, a multi_select holds many, and "any of" is overlap
      // either way. Filter values travel as strings, so a rating 4 matches "4".
      const held = Array.isArray(value) ? value : [value];
      return held.some((entry) => {
        const literal = filterLiteral(entry);
        return literal !== null && filter.values.includes(literal);
      });
    }
    case 'is': {
      const wanted = filter.values[0];
      if (wanted === undefined) return false;
      return filterLiteral(value) === wanted;
    }
    default:
      return false;
  }
}

export const fieldFiltersSchema = z.array(customFieldFilterSchema).max(MAX_FIELD_FILTERS);

export type FieldFiltersParse =
  | { ok: true; filters: CustomFieldFilter[] }
  | { ok: false; reason: string };

/** The `fieldFilters` query param: a JSON array of filters. */
export function serializeFieldFilters(filters: readonly CustomFieldFilter[]): string {
  return JSON.stringify(filters);
}

/**
 * Strict on purpose. A malformed filter that is silently dropped returns MORE
 * assets than the caller asked for, which reads as "nothing matched your other
 * filters either" — the one failure mode a filter UI must never have.
 */
export function parseFieldFiltersParam(raw: string | null | undefined): FieldFiltersParse {
  if (!raw || raw.trim().length === 0) return { ok: true, filters: [] };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'fieldFilters is not valid JSON' };
  }

  const parsed = fieldFiltersSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: parsed.error.message };
  return { ok: true, filters: parsed.data };
}

const customFieldResponseSchema = z.object({ field: customFieldSchema }).strict();
const assetFieldValueResponseSchema = z.object({ value: assetFieldValueSchema }).strict();

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return `${fallback} (${response.status})`;
}

export async function listCustomFields(params: { brandId: string }): Promise<CustomField[]> {
  const query = new URLSearchParams({ brandId: params.brandId });
  const response = await fetch(`/api/library/custom-fields?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Loading custom fields failed'));
  }
  const parsed = listCustomFieldsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Custom fields response was malformed');
  return parsed.data.fields;
}

async function writeCustomField(
  method: 'POST' | 'PATCH',
  request: CreateCustomFieldRequest | UpdateCustomFieldRequest,
  fallback: string,
): Promise<CustomField> {
  const response = await fetch('/api/library/custom-fields', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response, fallback));
  const parsed = customFieldResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Custom field response was malformed');
  return parsed.data.field;
}

export function createCustomField(request: CreateCustomFieldRequest): Promise<CustomField> {
  return writeCustomField('POST', request, 'Creating the field failed');
}

export function updateCustomField(request: UpdateCustomFieldRequest): Promise<CustomField> {
  return writeCustomField('PATCH', request, 'Updating the field failed');
}

// Query params, not a body: a DELETE body is legal but proxies and fetch
// polyfills drop it, and a silently-empty delete request is a 422 nobody can
// explain.
export async function deleteCustomField(request: DeleteCustomFieldRequest): Promise<void> {
  const query = new URLSearchParams({ brandId: request.brandId, fieldId: request.fieldId });
  const response = await fetch(`/api/library/custom-fields?${query.toString()}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Deleting the field failed'));
  }
}

export async function listAssetFieldValues(params: {
  brandId: string;
  assetId: string;
}): Promise<AssetFieldValue[]> {
  const query = new URLSearchParams({ brandId: params.brandId, assetId: params.assetId });
  const response = await fetch(`/api/library/asset-fields?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Loading field values failed'));
  }
  const parsed = listAssetFieldValuesResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Field values response was malformed');
  return parsed.data.values;
}

export async function setAssetFieldValue(
  request: SetAssetFieldValueRequest,
): Promise<AssetFieldValue> {
  const response = await fetch('/api/library/asset-fields', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Saving the field value failed'));
  }
  const parsed = assetFieldValueResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Field value response was malformed');
  return parsed.data.value;
}

const fieldValuesByAssetSchema = z
  .object({ values: z.array(z.object({ assetId: z.string(), value: customFieldValueSchema })) })
  .strict();

/** Every asset's stored value for one field — the board's lane map in one read. */
export async function listFieldValuesByAsset(params: {
  brandId: string;
  fieldId: string;
}): Promise<Map<string, CustomFieldValue>> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/library/asset-fields?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Loading field values failed'));
  }
  const parsed = fieldValuesByAssetSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Field values response was malformed');
  return new Map(parsed.data.values.map((entry) => [entry.assetId, entry.value]));
}
