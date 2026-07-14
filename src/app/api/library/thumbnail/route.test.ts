import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testCreateSupabaseAdminClient?: (...args: unknown[]) => unknown;
  __testCallerHasBrandAccess?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
mock.module('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseAdminClient?.(...args),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: (...args: unknown[]) => hooks.__testCallerHasBrandAccess?.(...args),
}));

import { POST } from './route';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ASSET_ID = '11111111-2222-4333-8444-555555555555';
const USER_ID = 'uploader-1';

type DbResult = { data: unknown; error: { message: string } | null };
type Recorded = { method: string; args: unknown[] };

class QueryStub implements PromiseLike<DbResult> {
  readonly calls: Recorded[] = [];
  constructor(private readonly result: DbResult) {}
  private chain(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...args: unknown[]) {
    return this.chain('select', args);
  }
  update(...args: unknown[]) {
    return this.chain('update', args);
  }
  eq(...args: unknown[]) {
    return this.chain('eq', args);
  }
  is(...args: unknown[]) {
    return this.chain('is', args);
  }
  maybeSingle() {
    return this.chain('maybeSingle', []);
  }
  then<T1 = DbResult, T2 = never>(
    onfulfilled?: ((value: DbResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

type Uploaded = { bucket: string; path: string; blob: Blob; options: { contentType?: string } };

function createAdminStub(rows: DbResult[], uploadError: { message: string } | null = null) {
  const queries: QueryStub[] = [];
  const uploads: Uploaded[] = [];
  const client = {
    schema: () => ({
      from() {
        const query = new QueryStub(rows.shift() ?? { data: null, error: null });
        queries.push(query);
        return query;
      },
    }),
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, blob: Blob, options: { contentType?: string }) => {
            uploads.push({ bucket, path, blob, options });
            return { data: uploadError ? null : { path }, error: uploadError };
          },
        };
      },
    },
  };
  return { client, queries, uploads };
}

function setAuth(user: { id: string } | null) {
  hooks.__testCreateSupabaseServerClient = () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) },
    });
}

function posterRequest(
  fields: { brandId?: string; assetId?: string },
  poster?: { bytes: Uint8Array; type: string; name?: string },
) {
  const form = new FormData();
  if (fields.brandId) form.append('brandId', fields.brandId);
  if (fields.assetId) form.append('assetId', fields.assetId);
  if (poster) {
    form.append(
      'poster',
      new Blob([poster.bytes as unknown as BlobPart], { type: poster.type }),
      poster.name ?? 'thumb.webp',
    );
  }
  return new Request('http://localhost/api/library/thumbnail', { method: 'POST', body: form });
}

const WEBP_BYTES = new Uint8Array(2048).fill(7);
const VIDEO_ROW: DbResult = {
  data: { id: ASSET_ID, bucket: 'media-library', kind: 'video' },
  error: null,
};

beforeEach(() => {
  setAuth({ id: USER_ID });
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCreateSupabaseAdminClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
});

describe('POST /api/library/thumbnail', () => {
  it('stores the poster in the asset own bucket and persists thumbnail_path', async () => {
    const { client, queries, uploads } = createAdminStub([VIDEO_ROW, { data: null, error: null }]);
    hooks.__testCreateSupabaseAdminClient = () => client;

    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/webp' },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assetId: ASSET_ID,
      bucket: 'media-library',
      thumbnailPath: `${BRAND_ID}/${ASSET_ID}/thumb.webp`,
    });

    // The path is DERIVED server-side, inside <brandId>/<assetId>/.
    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.bucket).toBe('media-library');
    expect(uploads[0]?.path).toBe(`${BRAND_ID}/${ASSET_ID}/thumb.webp`);
    expect(uploads[0]?.options.contentType).toBe('image/webp');

    const update = queries.flatMap((query) => query.calls).find((call) => call.method === 'update')
      ?.args[0];
    expect(update).toEqual({ thumbnail_path: `${BRAND_ID}/${ASSET_ID}/thumb.webp` });
  });

  it('leaves an existing poster untouched when registration is replayed', async () => {
    const existingPath = `${BRAND_ID}/${ASSET_ID}/thumb.webp`;
    const { client, queries, uploads } = createAdminStub([
      {
        data: {
          id: ASSET_ID,
          bucket: 'media-library',
          kind: 'video',
          thumbnail_path: existingPath,
        },
        error: null,
      },
    ]);
    hooks.__testCreateSupabaseAdminClient = () => client;

    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/webp' },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      assetId: ASSET_ID,
      bucket: 'media-library',
      thumbnailPath: existingPath,
    });
    expect(uploads).toHaveLength(0);
    expect(queries.flatMap((query) => query.calls).some((call) => call.method === 'update')).toBe(
      false,
    );
  });

  it('rejects a caller without brand access before touching storage', async () => {
    const { client, uploads } = createAdminStub([VIDEO_ROW]);
    hooks.__testCreateSupabaseAdminClient = () => client;
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);

    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/webp' },
      ),
    );
    expect(response.status).toBe(403);
    expect(uploads).toHaveLength(0);
  });

  it('rejects an unauthenticated caller', async () => {
    setAuth(null);
    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/webp' },
      ),
    );
    expect(response.status).toBe(401);
  });

  it('refuses a poster that is not a webp/jpeg still', async () => {
    const { client, uploads } = createAdminStub([VIDEO_ROW]);
    hooks.__testCreateSupabaseAdminClient = () => client;

    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/svg+xml', name: 'thumb.svg' },
      ),
    );
    expect(response.status).toBe(415);
    expect(uploads).toHaveLength(0);
  });

  it('refuses a poster for an asset in another brand (row lookup is brand-scoped)', async () => {
    const { client, uploads } = createAdminStub([{ data: null, error: null }]);
    hooks.__testCreateSupabaseAdminClient = () => client;

    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/webp' },
      ),
    );
    expect(response.status).toBe(404);
    expect(uploads).toHaveLength(0);
  });

  it('refuses a poster for a non-video asset', async () => {
    const { client, uploads } = createAdminStub([
      { data: { id: ASSET_ID, bucket: 'media-library', kind: 'image' }, error: null },
    ]);
    hooks.__testCreateSupabaseAdminClient = () => client;

    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/webp' },
      ),
    );
    expect(response.status).toBe(409);
    expect(uploads).toHaveLength(0);
  });

  it('refuses an empty or oversized poster', async () => {
    const { client } = createAdminStub([VIDEO_ROW, VIDEO_ROW]);
    hooks.__testCreateSupabaseAdminClient = () => client;

    const empty = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: new Uint8Array(0), type: 'image/webp' },
      ),
    );
    expect(empty.status).toBe(413);

    const huge = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: new Uint8Array(1_600_000), type: 'image/webp' },
      ),
    );
    expect(huge.status).toBe(413);
  });

  it('422s on a missing poster or malformed ids', async () => {
    const { client } = createAdminStub([VIDEO_ROW]);
    hooks.__testCreateSupabaseAdminClient = () => client;

    expect((await POST(posterRequest({ brandId: BRAND_ID, assetId: ASSET_ID }))).status).toBe(422);
    expect(
      (
        await POST(
          posterRequest(
            { brandId: 'not-a-uuid', assetId: ASSET_ID },
            { bytes: WEBP_BYTES, type: 'image/webp' },
          ),
        )
      ).status,
    ).toBe(422);
  });

  it('reports a storage failure instead of persisting a path that has no bytes', async () => {
    const { client, queries } = createAdminStub([VIDEO_ROW], { message: 'bucket exploded' });
    hooks.__testCreateSupabaseAdminClient = () => client;

    const response = await POST(
      posterRequest(
        { brandId: BRAND_ID, assetId: ASSET_ID },
        { bytes: WEBP_BYTES, type: 'image/webp' },
      ),
    );
    expect(response.status).toBe(500);
    expect(queries.flatMap((query) => query.calls).some((call) => call.method === 'update')).toBe(
      false,
    );
  });
});
