// The stills route at its boundary: who may ask, which brand's rows it reads, and that what it
// signs is a poster or a resize at the asked edge, never the original.

import { beforeEach, describe, expect, mock, test } from 'bun:test';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b1';
const IMAGE = '11111111-1111-4111-8111-111111111111';
const POSTERED = '11111111-1111-4111-8111-111111111112';
const BARE_VIDEO = '11111111-1111-4111-8111-111111111113';

const state = {
  authed: true,
  hasAccess: true,
  assetFilters: {} as Record<string, unknown>,
  batches: [] as string[][],
  transforms: [] as Array<{ path: string; transform: unknown }>,
};

const rows = [
  { id: IMAGE, bucket: 'b', storage_path: `${BRAND_ID}/render.png`, mime_type: 'image/png' },
  {
    id: POSTERED,
    bucket: 'b',
    storage_path: `${BRAND_ID}/clip.mp4`,
    mime_type: 'video/mp4',
    thumbnail_path: `${BRAND_ID}/poster.webp`,
  },
  { id: BARE_VIDEO, bucket: 'b', storage_path: `${BRAND_ID}/bare.mp4`, mime_type: 'video/mp4' },
].map((row) => ({ thumbnail_path: null, updated_at: 'v1', head_version_id: null, ...row }));

function query(table: string) {
  const builder = {
    select: () => builder,
    in: () => builder,
    eq: (column: string, value: unknown) => {
      if (table === 'assets') state.assetFilters[column] = value;
      return builder;
    },
    is: (column: string, value: unknown) => {
      if (table === 'assets') state.assetFilters[`${column}:is`] = value;
      return builder;
    },
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: table === 'assets' ? rows : [], error: null }),
  };
  return builder;
}

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () =>
        state.authed
          ? { data: { claims: { sub: `user-${state.batches.length}-${Math.random()}` } }, error: null }
          : { data: { claims: null }, error: { message: 'no session' } },
    },
    schema: () => ({ from: (table: string) => query(table) }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[]) => {
          state.batches.push(paths);
          return {
            data: paths.map((path) => ({ path, signedUrl: `https://s.test/object/sign/${bucket}/${path}` })),
            error: null,
          };
        },
        createSignedUrl: async (path: string, _ttl: number, options?: { transform?: unknown }) => {
          state.transforms.push({ path, transform: options?.transform });
          return { data: { signedUrl: `https://s.test/render/image/sign/${bucket}/${path}` }, error: null };
        },
      }),
    },
  }),
}));

mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: async () => state.hasAccess,
}));

const { POST } = await import('./route');

const ask = (body: unknown) =>
  POST(new Request('http://app.test/api/library/stills', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  state.authed = true;
  state.hasAccess = true;
  state.assetFilters = {};
  state.batches = [];
  state.transforms = [];
});

describe('POST /api/library/stills', () => {
  test('refuses a caller with no session, or no access to the brand', async () => {
    state.authed = false;
    expect((await ask({ brandId: BRAND_ID, assetIds: [IMAGE], edge: 96 })).status).toBe(401);
    state.authed = true;
    state.hasAccess = false;
    expect((await ask({ brandId: BRAND_ID, assetIds: [IMAGE], edge: 96 })).status).toBe(403);
  });

  test('only answers the sizes it serves', async () => {
    expect((await ask({ brandId: BRAND_ID, assetIds: [IMAGE], edge: 1080 })).status).toBe(422);
  });

  test('signs a poster or a resize at the asked edge from the brand’s own rows, never an original', async () => {
    const response = await ask({ brandId: BRAND_ID, assetIds: [IMAGE, POSTERED, BARE_VIDEO], edge: 96 });
    const { stills } = (await response.json()) as { stills: Record<string, string | null> };

    expect(state.assetFilters).toMatchObject({ brand_id: BRAND_ID, 'deleted_at:is': null });
    expect(stills[IMAGE]).toBe(`https://s.test/render/image/sign/b/${BRAND_ID}/render.png`);
    expect(state.transforms).toEqual([
      { path: `${BRAND_ID}/render.png`, transform: { width: 96, height: 96, resize: 'contain' } },
    ]);
    expect(stills[POSTERED]).toBe(`https://s.test/object/sign/b/${BRAND_ID}/poster.webp`);
    expect(stills[BARE_VIDEO]).toBeNull();
    expect(state.batches.flat()).not.toContain(`${BRAND_ID}/clip.mp4`);
    expect(state.batches.flat()).not.toContain(`${BRAND_ID}/bare.mp4`);
  });
});
