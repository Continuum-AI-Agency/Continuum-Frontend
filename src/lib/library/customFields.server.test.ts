import { describe, expect, it } from 'bun:test';
import { type CustomFieldFilter, DEFAULT_CUSTOM_FIELDS } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createFakeSupabaseClient,
  FakeDb,
  type FakeRow,
} from '@/app/api/library/__tests__/fakeSupabase';
import { ensureBrandCustomFields, resolveFieldFilterAssetIds } from './customFields.server';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const OTHER_BRAND = '11111111-2222-3333-4444-555555555555';
const USER_ID = 'user-1';

const RATING = 'field-rating';
const SEASON = 'field-season';
const EXPIRY = 'field-expiry';

function client(db: FakeDb): SupabaseClient {
  return createFakeSupabaseClient({ db, userId: USER_ID }) as unknown as SupabaseClient;
}

function valueRow(assetId: string, fieldId: string, value: unknown, brandId = BRAND_ID): FakeRow {
  return { asset_id: assetId, field_id: fieldId, brand_id: brandId, value };
}

describe('ensureBrandCustomFields', () => {
  it('seeds the defaults on first read, in order', async () => {
    const db = new FakeDb({ 'media.custom_fields': [] });
    const fields = await ensureBrandCustomFields(client(db), BRAND_ID, USER_ID);

    expect(fields.map((field) => field.name)).toEqual(
      DEFAULT_CUSTOM_FIELDS.map((field) => field.name),
    );
    expect(fields.every((field) => field.isDefault)).toBe(true);
    expect(fields.map((field) => field.position)).toEqual([0, 1, 2]);
    expect(fields[0]?.options.length).toBeGreaterThan(0);
  });

  it('does not re-seed once the brand has fields', async () => {
    const db = new FakeDb({ 'media.custom_fields': [] });
    await ensureBrandCustomFields(client(db), BRAND_ID, USER_ID);
    await ensureBrandCustomFields(client(db), BRAND_ID, USER_ID);

    expect(db.rows('media.custom_fields')).toHaveLength(DEFAULT_CUSTOM_FIELDS.length);
  });

  it('seeds exactly once when two readers race — the loser swallows 23505 and re-reads', async () => {
    const db = new FakeDb({ 'media.custom_fields': [] });

    // A rival reader that also saw an empty vocabulary commits its whole seed
    // first. The unique (brand_id, lower(name)) index then rejects OUR statement.
    db.onBeforeInsert((table) => {
      if (table !== 'media.custom_fields') return;
      db.onBeforeInsert(null);
      for (const [index, field] of DEFAULT_CUSTOM_FIELDS.entries()) {
        db.rows(table).push({
          id: `rival-${index}`,
          brand_id: BRAND_ID,
          name: field.name,
          type: field.type,
          options: field.options,
          position: index,
          is_default: true,
          created_at: '2026-07-11T00:00:00Z',
          updated_at: '2026-07-11T00:00:00Z',
        });
      }
    });

    const fields = await ensureBrandCustomFields(client(db), BRAND_ID, USER_ID);

    expect(db.rows('media.custom_fields')).toHaveLength(DEFAULT_CUSTOM_FIELDS.length);
    expect(fields.map((field) => field.id)).toEqual(['rival-0', 'rival-1', 'rival-2']);
  });

  it('never seeds another brand', async () => {
    const db = new FakeDb({ 'media.custom_fields': [] });
    await ensureBrandCustomFields(client(db), BRAND_ID, USER_ID);
    const rows = db.rows('media.custom_fields');
    expect(rows.every((row) => row.brand_id === BRAND_ID)).toBe(true);
    expect(rows.some((row) => row.brand_id === OTHER_BRAND)).toBe(false);
  });
});

describe('resolveFieldFilterAssetIds', () => {
  function seed(): FakeDb {
    return new FakeDb({
      'media.asset_field_values': [
        valueRow('asset-a', RATING, 'r5'),
        valueRow('asset-a', SEASON, ['spring', 'summer']),
        valueRow('asset-a', EXPIRY, '2026-07-12'),
        valueRow('asset-b', RATING, 'r3'),
        valueRow('asset-b', SEASON, ['winter']),
        valueRow('asset-c', RATING, 'r5'),
        // asset-d holds nothing at all.
        // Another brand's row must never leak into a filter result.
        valueRow('asset-x', RATING, 'r5', OTHER_BRAND),
      ],
    });
  }

  const filter = (
    fieldId: string,
    operator: CustomFieldFilter['operator'],
    values: string[] = [],
  ): CustomFieldFilter => ({ fieldId, operator, values });

  it('no filters constrain nothing', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, []);
    expect(resolution).toEqual({ kind: 'unfiltered' });
  });

  it('any_of overlaps a single_select and stays inside the brand', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, [
      filter(RATING, 'any_of', ['r5']),
    ]);
    expect(resolution.kind).toBe('ids');
    expect(resolution.kind === 'ids' && [...resolution.ids].sort()).toEqual(['asset-a', 'asset-c']);
  });

  it('any_of overlaps a multi_select', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, [
      filter(SEASON, 'any_of', ['summer', 'autumn']),
    ]);
    expect(resolution.kind === 'ids' && resolution.ids).toEqual(['asset-a']);
  });

  it('is matches a scalar exactly', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, [
      filter(EXPIRY, 'is', ['2026-07-12']),
    ]);
    expect(resolution.kind === 'ids' && resolution.ids).toEqual(['asset-a']);
  });

  it('is_empty excludes every asset holding a value for that field', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, [
      filter(SEASON, 'is_empty'),
    ]);
    expect(resolution.kind).toBe('exclude');
    expect(resolution.kind === 'exclude' && [...resolution.ids].sort()).toEqual([
      'asset-a',
      'asset-b',
    ]);
  });

  it('is_empty on a field nobody has filled in constrains nothing', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, [
      filter('field-nobody-uses', 'is_empty'),
    ]);
    expect(resolution).toEqual({ kind: 'unfiltered' });
  });

  it('filters AND together, and is_empty subtracts from the positive set', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, [
      filter(RATING, 'any_of', ['r5']),
      filter(SEASON, 'is_empty'),
    ]);
    // asset-a and asset-c are r5; asset-a holds a season, so only asset-c is left.
    expect(resolution.kind === 'ids' && resolution.ids).toEqual(['asset-c']);
  });

  it('an unsatisfiable filter set yields an empty candidate list, not "unfiltered"', async () => {
    const resolution = await resolveFieldFilterAssetIds(client(seed()), BRAND_ID, [
      filter(RATING, 'any_of', ['r1']),
    ]);
    expect(resolution).toEqual({ kind: 'ids', ids: [] });
  });
});
