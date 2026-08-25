// The route's whole job at a boundary: WHICH bytes get signed, and whether the caller was
// allowed to ask. Both are decided by the filters it puts on its reads, so the fake
// records them and the assertions read them back.

import { beforeEach, describe, expect, mock, test } from 'bun:test';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b1';
const OTHER_BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ASSET_ID = '11111111-1111-4111-8111-111111111112';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';

type Filters = Record<string, unknown>;

const state = {
  authed: true,
  hasAccess: true,
  assetRow: null as Record<string, unknown> | null,
  versionRow: null as Record<string, unknown> | null,
  assetFilters: {} as Filters,
  versionFilters: null as Filters | null,
  signed: [] as Array<{ path: string; bucket: string }>,
};

function makeQuery(table: string) {
  const filters: Filters = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters[`${column}:is`] = value;
      return builder;
    },
    single: async () => {
      if (table === 'assets') {
        state.assetFilters = filters;
        return state.assetRow
          ? { data: state.assetRow, error: null }
          : { data: null, error: { message: 'no rows' } };
      }
      state.versionFilters = filters;
      const row = state.versionRow;
      const matches =
        row &&
        row.id === filters.id &&
        row.asset_id === filters.asset_id &&
        row.brand_id === filters.brand_id;
      return matches ? { data: row, error: null } : { data: null, error: { message: 'no rows' } };
    },
  };
  return builder;
}

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () =>
        state.authed
          ? { data: { user: { id: 'user-1' } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    schema: () => ({ from: (table: string) => makeQuery(table) }),
  }),
}));

mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: async () => state.hasAccess,
}));

mock.module('@/lib/media/signed-urls', () => ({
  mintSignedUrl: async (path: string, bucket: string) => {
    state.signed.push({ path, bucket });
    return `signed:${bucket}/${path}`;
  },
}));

const { POST } = await import('./route');

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/library/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.authed = true;
  state.hasAccess = true;
  state.assetRow = {
    storage_path: `${BRAND_ID}/${ASSET_ID}/head.png`,
    bucket: 'media-library',
    thumbnail_path: `${BRAND_ID}/${ASSET_ID}/head-thumb.jpg`,
  };
  state.versionRow = {
    id: VERSION_ID,
    asset_id: ASSET_ID,
    brand_id: BRAND_ID,
    storage_path: `${BRAND_ID}/${ASSET_ID}/v3/render.png`,
    bucket: 'media-library',
  };
  state.assetFilters = {};
  state.versionFilters = null;
  state.signed = [];
});

describe('POST /api/library/sign — the asset head (unchanged)', () => {
  test('signs the head and its poster, and reads no version row', async () => {
    const response = await post({ brandId: BRAND_ID, assetId: ASSET_ID });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signedUrl: `signed:media-library/${BRAND_ID}/${ASSET_ID}/head.png`,
      thumbnailUrl: `signed:media-library/${BRAND_ID}/${ASSET_ID}/head-thumb.jpg`,
    });
    expect(state.versionFilters).toBeNull();
  });

  test('an asset with no poster still answers, with a null thumbnail', async () => {
    state.assetRow = { ...state.assetRow, thumbnail_path: null };
    const response = await post({ brandId: BRAND_ID, assetId: ASSET_ID });

    expect(await response.json()).toEqual({
      signedUrl: `signed:media-library/${BRAND_ID}/${ASSET_ID}/head.png`,
      thumbnailUrl: null,
    });
    expect(state.signed.length).toBe(1);
  });

  test('scopes the head read to the brand and to rows that are not soft-deleted', async () => {
    await post({ brandId: BRAND_ID, assetId: ASSET_ID });
    expect(state.assetFilters).toEqual({
      id: ASSET_ID,
      brand_id: BRAND_ID,
      'deleted_at:is': null,
    });
  });
});

describe('POST /api/library/sign — an exact version', () => {
  test('mints from the VERSION row, not the head that has since moved on', async () => {
    const response = await post({ brandId: BRAND_ID, assetId: ASSET_ID, versionId: VERSION_ID });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      signedUrl: `signed:media-library/${BRAND_ID}/${ASSET_ID}/v3/render.png`,
      thumbnailUrl: null,
    });
    // Exactly one thing signed: the version. `thumbnail_path` lives on the head and
    // follows it forward, so returning it here would describe two different sets of
    // bytes as one asset.
    expect(state.signed).toEqual([
      { path: `${BRAND_ID}/${ASSET_ID}/v3/render.png`, bucket: 'media-library' },
    ]);
  });

  test('scopes the version read on all three of id, asset_id and brand_id', async () => {
    await post({ brandId: BRAND_ID, assetId: ASSET_ID, versionId: VERSION_ID });
    expect(state.versionFilters).toEqual({
      id: VERSION_ID,
      asset_id: ASSET_ID,
      brand_id: BRAND_ID,
    });
  });

  test('a version belonging to another asset is not found, and nothing is signed', async () => {
    const response = await post({
      brandId: BRAND_ID,
      assetId: OTHER_ASSET_ID,
      versionId: VERSION_ID,
    });

    expect(response.status).toBe(404);
    expect(state.signed).toEqual([]);
  });

  test('a version belonging to another brand is not found', async () => {
    state.versionRow = { ...state.versionRow, brand_id: OTHER_BRAND_ID };
    const response = await post({ brandId: BRAND_ID, assetId: ASSET_ID, versionId: VERSION_ID });

    expect(response.status).toBe(404);
    expect(state.signed).toEqual([]);
  });

  test('a soft-deleted asset cannot be resurrected through its version', async () => {
    // The head read is the soft-delete gate: `asset_versions` has no `deleted_at`, so a
    // version branch that skipped the head would hand back a deleted asset's bytes.
    state.assetRow = null;
    const response = await post({ brandId: BRAND_ID, assetId: ASSET_ID, versionId: VERSION_ID });

    expect(response.status).toBe(404);
    expect(state.versionFilters).toBeNull();
    expect(state.signed).toEqual([]);
  });
});

describe('POST /api/library/sign — authorization comes first', () => {
  test('no brand access is 403 before any row is read', async () => {
    state.hasAccess = false;
    const response = await post({ brandId: BRAND_ID, assetId: ASSET_ID, versionId: VERSION_ID });

    expect(response.status).toBe(403);
    expect(state.assetFilters).toEqual({});
    expect(state.versionFilters).toBeNull();
  });

  test('an unauthenticated caller is 401', async () => {
    state.authed = false;
    expect((await post({ brandId: BRAND_ID, assetId: ASSET_ID })).status).toBe(401);
  });

  test('a malformed versionId is rejected rather than ignored', async () => {
    const response = await post({ brandId: BRAND_ID, assetId: ASSET_ID, versionId: 'not-a-uuid' });
    expect(response.status).toBe(422);
  });
});
