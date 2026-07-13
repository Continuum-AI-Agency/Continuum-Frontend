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
  type CustomField,
  type CustomFieldFilter,
  type CustomFieldValue,
  customFieldFilterSchema,
  customFieldSchema,
  type DeleteCustomFieldRequest,
  listAssetFieldValuesResponseSchema,
  listCustomFieldsResponseSchema,
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

  const optionIds = new Set(field.options.map((option) => option.id));

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
    default:
      // The row's type column is cast, not parsed, on the way out of the DB.
      return { ok: false, reason: 'Unknown field type' };
  }
}

/** Cleared, in every shape a stored value could take. */
export function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
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
      // One predicate for both select types: a single_select holds one id, a
      // multi_select holds many, and "any of" is overlap either way.
      const held = Array.isArray(value) ? value : [value];
      return held.some((entry) => typeof entry === 'string' && filter.values.includes(entry));
    }
    case 'is': {
      const wanted = filter.values[0];
      if (wanted === undefined) return false;
      return typeof value === 'string' && value === wanted;
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
