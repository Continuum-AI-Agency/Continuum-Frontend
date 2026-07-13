import 'server-only';

// The server-side seam for media.custom_fields and media.asset_field_values.
//
// Every read and write here runs on the USER-scoped client: the tables' RLS
// policies (has_brand_access, plus asset_in_brand and a same-brand field check
// on the value writes) are the hard boundary, so a service-role bypass would
// only weaken it. callerHasBrandAccess in the route is the friendly 403 on top.

import {
  type CustomField,
  type CustomFieldFilter,
  customFieldOptionSchema,
  customFieldTypeSchema,
  DEFAULT_CUSTOM_FIELDS,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaSchema } from '@/lib/media/supabase-media';
import { matchesFieldFilter } from './customFields';

const UNIQUE_VIOLATION = '23505';

export const CUSTOM_FIELD_SELECT =
  'id, brand_id, name, type, options, position, is_default, created_at, updated_at';

export type CustomFieldRow = {
  id: string;
  brand_id: string;
  name: string;
  type: string;
  options: unknown;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AssetFieldValueRow = {
  field_id: string;
  value: unknown;
  updated_at: string | null;
};

// The row's type and options columns are cast out of the DB, never parsed by it
// (options is jsonb), so both are narrowed here rather than trusted.
export function rowToCustomField(row: CustomFieldRow): CustomField {
  const type = customFieldTypeSchema.safeParse(row.type);
  const options = customFieldOptionSchema.array().safeParse(row.options);
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    type: type.success ? type.data : 'text',
    options: options.success ? options.data : [],
    position: row.position,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadBrandCustomFields(
  client: SupabaseClient,
  brandId: string,
): Promise<CustomField[]> {
  const { data, error } = await mediaSchema(client)
    .from('custom_fields')
    .select(CUSTOM_FIELD_SELECT)
    .eq('brand_id', brandId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[library/custom-fields] list failed', error);
    throw new Error('Custom field list failed');
  }
  return ((data ?? []) as unknown as CustomFieldRow[]).map(rowToCustomField);
}

export async function loadCustomField(
  client: SupabaseClient,
  brandId: string,
  fieldId: string,
): Promise<CustomField | null> {
  const { data, error } = await mediaSchema(client)
    .from('custom_fields')
    .select(CUSTOM_FIELD_SELECT)
    .eq('id', fieldId)
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) {
    console.error('[library/custom-fields] field lookup failed', error);
    throw new Error('Custom field lookup failed');
  }
  const row = data as CustomFieldRow | null;
  return row ? rowToCustomField(row) : null;
}

/**
 * Seeds DEFAULT_CUSTOM_FIELDS the first time a brand is asked for its fields, so
 * the feature is useful the moment it is switched on instead of showing an empty
 * field manager nobody fills in.
 *
 * Concurrency: two first-readers can both see zero fields and both try to seed.
 * The defaults go in as ONE multi-row insert, so the unique (brand_id,
 * lower(name)) index makes the loser's whole statement fail with 23505 — which
 * is a success for our purpose (the defaults exist), so we swallow it and
 * re-read. Exactly one set of defaults can ever land. Same shape as
 * ensureHeadVersion's v1 backfill.
 */
export async function ensureBrandCustomFields(
  client: SupabaseClient,
  brandId: string,
  createdBy: string,
): Promise<CustomField[]> {
  const existing = await loadBrandCustomFields(client, brandId);
  if (existing.length > 0) return existing;

  const seedRows = DEFAULT_CUSTOM_FIELDS.map((field, index) => ({
    brand_id: brandId,
    name: field.name,
    type: field.type,
    options: field.options,
    position: index,
    is_default: true,
    created_by: createdBy,
  }));

  const { error } = await mediaSchema(client).from('custom_fields').insert(seedRows);
  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error('[library/custom-fields] default seed failed', error);
    throw new Error('Custom field seed failed');
  }

  return loadBrandCustomFields(client, brandId);
}

export async function loadAssetFieldValues(
  client: SupabaseClient,
  brandId: string,
  assetId: string,
): Promise<AssetFieldValueRow[]> {
  const { data, error } = await mediaSchema(client)
    .from('asset_field_values')
    .select('field_id, value, updated_at')
    .eq('brand_id', brandId)
    .eq('asset_id', assetId);
  if (error) {
    console.error('[library/asset-fields] value list failed', error);
    throw new Error('Field value list failed');
  }
  return (data ?? []) as unknown as AssetFieldValueRow[];
}

// What a set of field filters says about which assets may appear.
//   unfiltered — the filters constrain nothing (no filters, or is_empty on a
//                field no asset has filled in).
//   ids        — the exact candidate set (empty means "no asset matches").
//   exclude    — every asset EXCEPT these; only produced by is_empty-only
//                filters, where there is nothing positive to enumerate.
export type FieldFilterResolution =
  | { kind: 'unfiltered' }
  | { kind: 'ids'; ids: string[] }
  | { kind: 'exclude'; ids: string[] };

type ValueRow = { asset_id: string; field_id: string; value: unknown };

/**
 * Turns field filters into an asset-id constraint.
 *
 * Filters AND together. `is_empty` is the awkward one: "has no value for this
 * field" is the absence of a row, which no jsonb predicate can select for, so it
 * is resolved as the complement of the assets that DO hold a non-empty value.
 */
export async function resolveFieldFilterAssetIds(
  client: SupabaseClient,
  brandId: string,
  filters: readonly CustomFieldFilter[],
): Promise<FieldFilterResolution> {
  if (filters.length === 0) return { kind: 'unfiltered' };

  const fieldIds = [...new Set(filters.map((filter) => filter.fieldId))];
  const { data, error } = await mediaSchema(client)
    .from('asset_field_values')
    .select('asset_id, field_id, value')
    .eq('brand_id', brandId)
    .in('field_id', fieldIds);
  if (error) {
    console.error('[library/assets] field filter query failed', error);
    throw new Error('Field filter query failed');
  }

  const byField = new Map<string, ValueRow[]>();
  for (const row of (data ?? []) as unknown as ValueRow[]) {
    const bucket = byField.get(row.field_id);
    if (bucket) bucket.push(row);
    else byField.set(row.field_id, [row]);
  }

  let matched: Set<string> | null = null;
  const occupied = new Set<string>();

  for (const filter of filters) {
    const rows = byField.get(filter.fieldId) ?? [];
    if (filter.operator === 'is_empty') {
      for (const row of rows) {
        if (matchesFieldFilter(row.value, filter)) continue;
        occupied.add(row.asset_id);
      }
      continue;
    }
    const hits = new Set<string>(
      rows.filter((row) => matchesFieldFilter(row.value, filter)).map((row) => row.asset_id),
    );
    if (matched === null) {
      matched = hits;
    } else {
      const intersection = new Set<string>();
      for (const id of matched) {
        if (hits.has(id)) intersection.add(id);
      }
      matched = intersection;
    }
  }

  if (matched !== null) {
    return { kind: 'ids', ids: [...matched].filter((id) => !occupied.has(id)) };
  }
  return occupied.size === 0 ? { kind: 'unfiltered' } : { kind: 'exclude', ids: [...occupied] };
}
