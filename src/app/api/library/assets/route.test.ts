import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { CustomFieldFilter } from '@continuum/contracts';
import { serializeFieldFilters } from '@/lib/library/customFields';
import { createFakeSupabaseClient, FakeDb, type FakeRow } from '../__tests__/fakeSupabase';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
  __testMintSignedUrls?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));
mock.module('@/lib/media/signed-urls', () => ({
  mintSignedUrl: () => Promise.resolve(null),
  mintSignedUrls: (...args: unknown[]) => hooks.__testMintSignedUrls?.(...args),
  assetSignablePaths: () => [],
}));

import { GET } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const COLLECTION_ID = '6f7a8b9c-0d1e-42f3-a4b5-c6d7e8f9a0b1';
const RATING_ID = '7c2cc78f-6d3b-4d10-8e37-4fa03fabab21';
const SEASON_ID = '2d3e4f50-6172-4839-9a0b-1c2d3e4f5061';

function assetRow(id: string, overrides: FakeRow = {}): FakeRow {
  return {
    id,
    brand_id: BRAND_ID,
    created_by: 'user-1',
    kind: 'image',
    bucket: 'media-library',
    storage_path: `${BRAND_ID}/${id}/original.png`,
    file_name: 'original.png',
    mime_type: 'image/png',
    size_bytes: 100,
    width: 10,
    height: 10,
    duration_ms: null,
    source: 'upload',
    origin_ref: null,
    status: 'ready',
    review_status: 'none',
    checksum: null,
    progress_step: null,
    error_code: null,
    error_message: null,
    title: null,
    description: null,
    tags: [],
    ad_creative_analysis: null,
    detected_objects: null,
    thumbnail_path: null,
    embedding_model: null,
    has_image_embedding: false,
    deleted_at: null,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    ...overrides,
  };
}

function valueRow(assetId: string, fieldId: string, value: unknown): FakeRow {
  return { asset_id: assetId, field_id: fieldId, brand_id: BRAND_ID, value };
}

// asset-a: rating r5, season [summer] · asset-b: rating r3 · asset-c: nothing
function seedDb(): FakeDb {
  return new FakeDb({
    'media.assets': [assetRow('asset-a'), assetRow('asset-b'), assetRow('asset-c')],
    'media.asset_field_values': [
      valueRow('asset-a', RATING_ID, 'r5'),
      valueRow('asset-a', SEASON_ID, ['summer']),
      valueRow('asset-b', RATING_ID, 'r3'),
    ],
    'media.collections': [],
    'media.collection_items': [],
  });
}

function useDb(db: FakeDb) {
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve(createFakeSupabaseClient({ db, userId: 'user-1' }));
  return db;
}

function listRequest(params: Record<string, string>) {
  return new Request(`http://localhost/api/library/assets?${new URLSearchParams(params)}`);
}

async function idsFrom(response: Response): Promise<string[]> {
  const body = (await response.json()) as { items: { id: string }[] };
  return body.items.map((item) => item.id).sort();
}

function filters(...list: CustomFieldFilter[]): string {
  return serializeFieldFilters(list);
}

beforeEach(() => {
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
  hooks.__testMintSignedUrls = () => Promise.resolve(new Map());
  useDb(seedDb());
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
  hooks.__testMintSignedUrls = undefined;
});

describe('GET /api/library/assets — custom-field filters', () => {
  it('returns every asset when no field filter is given', async () => {
    const response = await GET(listRequest({ brandId: BRAND_ID }));
    expect(await idsFrom(response)).toEqual(['asset-a', 'asset-b', 'asset-c']);
  });

  it('any_of narrows to the assets holding one of the option ids', async () => {
    const response = await GET(
      listRequest({
        brandId: BRAND_ID,
        fieldFilters: filters({ fieldId: RATING_ID, operator: 'any_of', values: ['r5'] }),
      }),
    );
    expect(await idsFrom(response)).toEqual(['asset-a']);
  });

  it('is matches the scalar exactly', async () => {
    const response = await GET(
      listRequest({
        brandId: BRAND_ID,
        fieldFilters: filters({ fieldId: RATING_ID, operator: 'is', values: ['r3'] }),
      }),
    );
    expect(await idsFrom(response)).toEqual(['asset-b']);
  });

  it('is_empty returns the assets with no value for that field', async () => {
    const response = await GET(
      listRequest({
        brandId: BRAND_ID,
        fieldFilters: filters({ fieldId: RATING_ID, operator: 'is_empty', values: [] }),
      }),
    );
    expect(await idsFrom(response)).toEqual(['asset-c']);
  });

  it('composes filters — they AND together', async () => {
    const response = await GET(
      listRequest({
        brandId: BRAND_ID,
        fieldFilters: filters(
          { fieldId: RATING_ID, operator: 'any_of', values: ['r5', 'r3'] },
          { fieldId: SEASON_ID, operator: 'is_empty', values: [] },
        ),
      }),
    );
    expect(await idsFrom(response)).toEqual(['asset-b']);
  });

  it('composes with the existing source filter', async () => {
    const db = seedDb();
    db.rows('media.assets').push(assetRow('asset-d', { source: 'ai_generated' }));
    db.rows('media.asset_field_values').push(valueRow('asset-d', RATING_ID, 'r5'));
    useDb(db);

    const response = await GET(
      listRequest({
        brandId: BRAND_ID,
        source: 'upload',
        fieldFilters: filters({ fieldId: RATING_ID, operator: 'any_of', values: ['r5'] }),
      }),
    );
    expect(await idsFrom(response)).toEqual(['asset-a']);
  });

  it('composes with a manual collection’s membership', async () => {
    const db = seedDb();
    db.rows('media.collections').push({
      id: COLLECTION_ID,
      brand_id: BRAND_ID,
      kind: 'manual',
      smart_query: null,
    });
    db.rows('media.collection_items').push(
      { collection_id: COLLECTION_ID, asset_id: 'asset-a', position: 0 },
      { collection_id: COLLECTION_ID, asset_id: 'asset-b', position: 1 },
    );
    useDb(db);

    const response = await GET(
      listRequest({
        brandId: BRAND_ID,
        collectionId: COLLECTION_ID,
        fieldFilters: filters({ fieldId: RATING_ID, operator: 'any_of', values: ['r3'] }),
      }),
    );
    expect(await idsFrom(response)).toEqual(['asset-b']);
  });

  it('resolves a smart collection’s SAVED field filters', async () => {
    const db = seedDb();
    db.rows('media.collections').push({
      id: COLLECTION_ID,
      brand_id: BRAND_ID,
      kind: 'smart',
      smart_query: {
        source: 'upload',
        fieldFilters: [{ fieldId: RATING_ID, operator: 'any_of', values: ['r5'] }],
      },
    });
    useDb(db);

    const response = await GET(listRequest({ brandId: BRAND_ID, collectionId: COLLECTION_ID }));
    expect(await idsFrom(response)).toEqual(['asset-a']);
  });

  it('a smart collection with only source/kind still resolves (no field filters)', async () => {
    const db = seedDb();
    db.rows('media.collections').push({
      id: COLLECTION_ID,
      brand_id: BRAND_ID,
      kind: 'smart',
      smart_query: { source: 'upload' },
    });
    useDb(db);

    const response = await GET(listRequest({ brandId: BRAND_ID, collectionId: COLLECTION_ID }));
    expect(await idsFrom(response)).toEqual(['asset-a', 'asset-b', 'asset-c']);
  });

  it('an unmatchable filter returns nothing, not everything', async () => {
    const response = await GET(
      listRequest({
        brandId: BRAND_ID,
        fieldFilters: filters({ fieldId: RATING_ID, operator: 'any_of', values: ['r1'] }),
      }),
    );
    expect(await idsFrom(response)).toEqual([]);
  });

  it('422s on a malformed fieldFilters param rather than widening the result set', async () => {
    const response = await GET(listRequest({ brandId: BRAND_ID, fieldFilters: '{not json' }));
    expect(response.status).toBe(422);
  });
});
