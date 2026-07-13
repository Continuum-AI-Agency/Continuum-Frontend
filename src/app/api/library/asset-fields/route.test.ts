import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { listAssetFieldValuesResponseSchema } from '@continuum/contracts';
import { createFakeSupabaseClient, FakeDb, type FakeRow } from '../__tests__/fakeSupabase';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
// bun's mock.module is process-wide: mock what a sibling spec mocks, or its
// stale hook answers here.
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));

import { GET, PUT } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const OTHER_BRAND = '11111111-2222-3333-4444-555555555555';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';
const RATING_ID = '7c2cc78f-6d3b-4d10-8e37-4fa03fabab21';
const SEASON_ID = '2d3e4f50-6172-4839-9a0b-1c2d3e4f5061';
const EXPIRY_ID = '3e4f5061-7283-494a-ab1c-2d3e4f506172';
const FOREIGN_FIELD_ID = '5061728e-3949-4abc-9d3e-4f5061728e39';

function seedDb(): FakeDb {
  return new FakeDb({
    'media.assets': [{ id: ASSET_ID, brand_id: BRAND_ID, deleted_at: null }],
    'media.custom_fields': [
      {
        id: RATING_ID,
        brand_id: BRAND_ID,
        name: 'Rating',
        type: 'single_select',
        options: [
          { id: 'r1', label: '★' },
          { id: 'r5', label: '★★★★★' },
        ],
        position: 0,
        is_default: true,
      },
      {
        id: SEASON_ID,
        brand_id: BRAND_ID,
        name: 'Season',
        type: 'multi_select',
        options: [
          { id: 'spring', label: 'Spring' },
          { id: 'summer', label: 'Summer' },
        ],
        position: 1,
        is_default: false,
      },
      {
        id: EXPIRY_ID,
        brand_id: BRAND_ID,
        name: 'Rights expiry',
        type: 'date',
        options: [],
        position: 2,
        is_default: true,
      },
      // Another tenant's field. A client naming it must never get a write.
      {
        id: FOREIGN_FIELD_ID,
        brand_id: OTHER_BRAND,
        name: 'Rating',
        type: 'single_select',
        options: [{ id: 'r1', label: '★' }],
        position: 0,
        is_default: true,
      },
    ],
    'media.asset_field_values': [],
  });
}

function useDb(db: FakeDb, options: { hasBrandAccess?: boolean } = {}) {
  const hasBrandAccess = options.hasBrandAccess ?? true;
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve(createFakeSupabaseClient({ db, userId: 'user-1', hasBrandAccess }));
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(hasBrandAccess);
  return db;
}

function putRequest(body: unknown) {
  return new Request('http://localhost/api/library/asset-fields', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(params: Record<string, string>) {
  return new Request(`http://localhost/api/library/asset-fields?${new URLSearchParams(params)}`);
}

function valuesOf(db: FakeDb): FakeRow[] {
  return db.rows('media.asset_field_values');
}

let db: FakeDb;

beforeEach(() => {
  db = useDb(seedDb());
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('PUT /api/library/asset-fields', () => {
  it('stores a single_select option the field defines', async () => {
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r5' }),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { value: { fieldId: string; value: unknown } };
    expect(body.value).toMatchObject({ fieldId: RATING_ID, value: 'r5' });
    expect(valuesOf(db)).toHaveLength(1);
    expect(valuesOf(db)[0]).toMatchObject({
      asset_id: ASSET_ID,
      field_id: RATING_ID,
      brand_id: BRAND_ID,
      value: 'r5',
      updated_by: 'user-1',
    });
  });

  it('overwrites the existing value rather than appending a second row', async () => {
    await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r1' }),
    );
    await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r5' }),
    );

    expect(valuesOf(db)).toHaveLength(1);
    expect(valuesOf(db)[0]?.value).toBe('r5');
  });

  it('rejects an option id the field does not define', async () => {
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r9' }),
    );
    expect(response.status).toBe(422);
    expect(valuesOf(db)).toHaveLength(0);
  });

  it('rejects an array on a single_select', async () => {
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: ['r1'] }),
    );
    expect(response.status).toBe(422);
    expect(valuesOf(db)).toHaveLength(0);
  });

  it('rejects a date that is not a date', async () => {
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: EXPIRY_ID, value: 'banana' }),
    );
    expect(response.status).toBe(422);
  });

  it('stores multi_select option ids', async () => {
    const response = await PUT(
      putRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        fieldId: SEASON_ID,
        value: ['spring', 'summer'],
      }),
    );
    expect(response.status).toBe(200);
    expect(valuesOf(db)[0]?.value).toEqual(['spring', 'summer']);
  });

  it('null clears the value by dropping the row', async () => {
    await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r5' }),
    );

    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: null }),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { value: { value: unknown } };
    expect(body.value.value).toBeNull();
    expect(valuesOf(db)).toHaveLength(0);
  });

  it('an empty multi_select selection clears rather than storing an empty list', async () => {
    await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: SEASON_ID, value: ['spring'] }),
    );

    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: SEASON_ID, value: [] }),
    );
    expect(response.status).toBe(200);
    expect(valuesOf(db)).toHaveLength(0);
  });

  it('404s when the named field belongs to another brand', async () => {
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: FOREIGN_FIELD_ID, value: 'r1' }),
    );
    expect(response.status).toBe(404);
    expect(valuesOf(db)).toHaveLength(0);
  });

  it('404s when the asset is not in the brand', async () => {
    useDb(
      new FakeDb({
        'media.assets': [{ id: ASSET_ID, brand_id: OTHER_BRAND, deleted_at: null }],
        'media.custom_fields': seedDb().rows('media.custom_fields'),
        'media.asset_field_values': [],
      }),
    );
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r1' }),
    );
    expect(response.status).toBe(404);
  });

  it('rejects callers without brand access', async () => {
    useDb(seedDb(), { hasBrandAccess: false });
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r1' }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects a malformed payload', async () => {
    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: { r: 1 } }),
    );
    expect(response.status).toBe(422);
  });
});

describe('GET /api/library/asset-fields', () => {
  it('lists every value the asset holds', async () => {
    await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: RATING_ID, value: 'r5' }),
    );
    await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, fieldId: SEASON_ID, value: ['summer'] }),
    );

    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    expect(response.status).toBe(200);

    const body = listAssetFieldValuesResponseSchema.parse(await response.json());
    expect(body.values).toHaveLength(2);
    expect(body.values.find((value) => value.fieldId === RATING_ID)?.value).toBe('r5');
    expect(body.values.find((value) => value.fieldId === SEASON_ID)?.value).toEqual(['summer']);
  });

  it('returns an empty list for an asset nobody has labelled', async () => {
    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: ASSET_ID }));
    const body = listAssetFieldValuesResponseSchema.parse(await response.json());
    expect(body.values).toEqual([]);
  });

  it('rejects a malformed assetId', async () => {
    const response = await GET(getRequest({ brandId: BRAND_ID, assetId: 'nope' }));
    expect(response.status).toBe(422);
  });
});
