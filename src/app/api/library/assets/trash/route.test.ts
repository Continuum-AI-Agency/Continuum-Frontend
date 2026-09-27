import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

type Hooks = {
  __testTrashClient?: () => unknown;
  __testTrashBrandAccess?: () => Promise<boolean>;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(hooks.__testTrashClient?.()),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: () => hooks.__testTrashBrandAccess?.(),
}));
mock.module('@/lib/media/signed-urls', () => ({
  mintSignedUrl: () => Promise.resolve(null),
  mintSignedUrls: () => Promise.resolve(new Map()),
  assetSignablePaths: () => [],
}));

import { GET } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';

function deletedRow(id: string, deletedAt: string, originRef: Record<string, unknown> | null) {
  return {
    id,
    brand_id: BRAND_ID,
    created_by: 'user-1',
    kind: 'image',
    bucket: 'media-library',
    storage_path: `${BRAND_ID}/${id}/original.png`,
    file_name: `${id}.png`,
    mime_type: 'image/png',
    size_bytes: 100,
    width: 10,
    height: 10,
    duration_ms: null,
    source: 'upload',
    origin_ref: originRef,
    status: 'ready',
    review_status: 'none',
    tags: [],
    detected_objects: null,
    thumbnail_path: null,
    has_image_embedding: false,
    deleted_at: deletedAt,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };
}

// Records the filter chain the route builds and answers with `rows`, so the test
// checks both what was asked of PostgREST and what the route did with the answer.
function stubClient(rows: unknown[], calls: string[]) {
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => (calls.push(`eq ${column}=${value}`), chain),
    gte: (column: string) => (calls.push(`gte ${column}`), chain),
    order: (column: string, options: { ascending: boolean }) => (
      calls.push(`order ${column} ${options.ascending ? 'asc' : 'desc'}`), chain
    ),
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
    schema: () => ({ from: () => chain }),
  };
}

const request = () => new Request(`http://localhost/api/library/assets/trash?brandId=${BRAND_ID}`);

let calls: string[] = [];

beforeEach(() => {
  calls = [];
  hooks.__testTrashBrandAccess = () => Promise.resolve(true);
});

afterEach(() => {
  hooks.__testTrashClient = undefined;
  hooks.__testTrashBrandAccess = undefined;
});

describe('GET /api/library/assets/trash', () => {
  it('lists deleted assets inside the window, newest first, without stacked ones', async () => {
    hooks.__testTrashClient = () =>
      stubClient(
        [
          deletedRow('a2b0f2de-0000-4000-8000-000000000001', '2026-09-26T10:00:00Z', null),
          deletedRow('a2b0f2de-0000-4000-8000-000000000002', '2026-09-25T10:00:00Z', {
            stackedInto: 'a2b0f2de-0000-4000-8000-000000000009',
          }),
          deletedRow('a2b0f2de-0000-4000-8000-000000000003', '2026-09-24T10:00:00Z', {
            importedFrom: 'drive',
          }),
        ],
        calls,
      );

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: { asset: { id: string }; deletedAt: string }[];
    };

    expect(body.items.map((item) => item.asset.id)).toEqual([
      'a2b0f2de-0000-4000-8000-000000000001',
      'a2b0f2de-0000-4000-8000-000000000003',
    ]);
    expect(body.items[0]?.deletedAt).toBe('2026-09-26T10:00:00Z');
    expect(calls).toEqual([`eq brand_id=${BRAND_ID}`, 'gte deleted_at', 'order deleted_at desc']);
  });

  it('refuses a caller without access to the brand', async () => {
    hooks.__testTrashClient = () => stubClient([], calls);
    hooks.__testTrashBrandAccess = () => Promise.resolve(false);
    expect((await GET(request())).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('rejects a missing brand id', async () => {
    hooks.__testTrashClient = () => stubClient([], calls);
    const response = await GET(new Request('http://localhost/api/library/assets/trash'));
    expect(response.status).toBe(422);
  });
});
