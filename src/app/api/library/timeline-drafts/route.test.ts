import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  getTimelineDraftResponseSchema,
  upsertTimelineDraftResponseSchema,
} from '@continuum/contracts';

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
  mintSignedUrls: (...args: unknown[]) => hooks.__testMintSignedUrls?.(...args),
}));

import { DELETE, GET, PUT } from './route';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';
const EXTRA_ASSET_ID = '7c1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a33';
const GONE_ASSET_ID = '5d1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a44';
const USER_ID = '1e1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a55';

type DbResult = { data: unknown; error: { code?: string; message: string } | null };
type RecordedCall = { method: string; args: unknown[] };

class QueryStub implements PromiseLike<DbResult> {
  readonly calls: RecordedCall[] = [];
  constructor(
    readonly key: string,
    private readonly result: DbResult,
  ) {}
  private chain(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select(...args: unknown[]) {
    return this.chain('select', args);
  }
  upsert(...args: unknown[]) {
    return this.chain('upsert', args);
  }
  delete(...args: unknown[]) {
    return this.chain('delete', args);
  }
  eq(...args: unknown[]) {
    return this.chain('eq', args);
  }
  is(...args: unknown[]) {
    return this.chain('is', args);
  }
  in(...args: unknown[]) {
    return this.chain('in', args);
  }
  single() {
    return this.chain('single', []);
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

// One client stands in for both the auth check and the schema reads, because the
// route deliberately uses a single USER-scoped client for everything.
function createClientStub(plan: Record<string, DbResult[]>) {
  const queries: QueryStub[] = [];
  const client = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }),
    },
    schema: (schemaName: string) => ({
      from(table: string) {
        const key = `${schemaName}.${table}`;
        const next = plan[key]?.shift() ?? { data: null, error: null };
        const query = new QueryStub(key, next);
        queries.push(query);
        return query;
      },
    }),
  };
  return { client, queries };
}

function callArgs(queries: QueryStub[], key: string, method: string): unknown[] | undefined {
  for (const query of queries) {
    if (query.key !== key) continue;
    const call = query.calls.find((entry) => entry.method === method);
    if (call) return call.args;
  }
  return undefined;
}

function eqFilters(queries: QueryStub[], key: string): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  for (const query of queries) {
    if (query.key !== key) continue;
    for (const call of query.calls) {
      if (call.method === 'eq') filters[String(call.args[0])] = call.args[1];
    }
  }
  return filters;
}

const DOCUMENT = {
  schemaVersion: 1 as const,
  sourceAssetId: ASSET_ID,
  pool: [
    { assetId: ASSET_ID, kind: 'video' as const, label: 'Hero' },
    { assetId: GONE_ASSET_ID, kind: 'image' as const, label: 'Logo' },
  ],
  items: [{ id: 'item-1', order: 0, sourceId: ASSET_ID, kind: 'video' as const }],
};

const DRAFT_ROW = {
  id: 'draft-1',
  brand_id: BRAND_ID,
  asset_id: ASSET_ID,
  created_by: USER_ID,
  schema_version: 1,
  document: DOCUMENT,
  status: 'active',
  rendered_asset_id: null,
  last_rendered_at: null,
  created_at: '2026-07-11T00:00:00.000Z',
  updated_at: '2026-07-11T00:05:00.000Z',
};

const HERO_ASSET_ROW = {
  id: ASSET_ID,
  kind: 'video',
  bucket: 'media-library',
  storage_path: `${BRAND_ID}/${ASSET_ID}/hero.mp4`,
  duration_ms: 12_500,
  file_name: 'hero.mp4',
  title: 'Hero cut',
};

function getRequest(params: Record<string, string> = { brandId: BRAND_ID, assetId: ASSET_ID }) {
  const query = new URLSearchParams(params);
  return new Request(`http://localhost/api/library/timeline-drafts?${query.toString()}`);
}

function putRequest(body: unknown) {
  return new Request('http://localhost/api/library/timeline-drafts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  hooks.__testCallerHasBrandAccess = () => Promise.resolve(true);
  hooks.__testMintSignedUrls = (items: { path: string; bucket: string }[]) =>
    Promise.resolve(new Map(items.map((item) => [item.path, `https://signed/${item.path}`])));
});

afterEach(() => {
  hooks.__testCreateSupabaseServerClient = undefined;
  hooks.__testCallerHasBrandAccess = undefined;
  hooks.__testMintSignedUrls = undefined;
});

describe('GET /api/library/timeline-drafts', () => {
  it("returns the caller's draft with freshly signed pool media", async () => {
    const { client, queries } = createClientStub({
      'media.timeline_drafts': [{ data: DRAFT_ROW, error: null }],
      'media.assets': [{ data: [HERO_ASSET_ROW], error: null }],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = getTimelineDraftResponseSchema.parse(await response.json());

    expect(body.draft?.id).toBe('draft-1');
    expect(body.draft?.document.items[0].sourceId).toBe(ASSET_ID);
    expect(body.poolMedia).toEqual([
      {
        assetId: ASSET_ID,
        signedUrl: `https://signed/${HERO_ASSET_ROW.storage_path}`,
        kind: 'video',
        durationMs: 12_500,
        label: 'Hero cut',
      },
      // Deleted since the draft was saved: kept, never dropped, never signed.
      { assetId: GONE_ASSET_ID, signedUrl: null, kind: null, durationMs: null, label: null },
    ]);

    // Drafts are personal working copies: the read is scoped to the author.
    expect(eqFilters(queries, 'media.timeline_drafts')).toEqual({
      asset_id: ASSET_ID,
      brand_id: BRAND_ID,
      created_by: USER_ID,
    });
  });

  it('resolves pool storage coordinates from the asset ids, scoped to the brand', async () => {
    const { client, queries } = createClientStub({
      'media.timeline_drafts': [{ data: DRAFT_ROW, error: null }],
      'media.assets': [{ data: [HERO_ASSET_ROW], error: null }],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    await GET(getRequest());

    // The client never supplies a bucket/path: the server looks them up, and the
    // lookup is brand-filtered so a foreign asset id can never be signed.
    expect(callArgs(queries, 'media.assets', 'in')).toEqual(['id', [ASSET_ID, GONE_ASSET_ID]]);
    expect(eqFilters(queries, 'media.assets')).toEqual({ brand_id: BRAND_ID });
  });

  it('returns a null draft when the caller has never cut this asset', async () => {
    const { client } = createClientStub({
      'media.timeline_drafts': [{ data: null, error: null }],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = getTimelineDraftResponseSchema.parse(await response.json());
    expect(body).toEqual({ draft: null, poolMedia: [] });
  });

  it('degrades a corrupt stored document to a null draft instead of a 500', async () => {
    const { client } = createClientStub({
      'media.timeline_drafts': [
        { data: { ...DRAFT_ROW, document: { schemaVersion: 99, nope: true } }, error: null },
      ],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = getTimelineDraftResponseSchema.parse(await response.json());
    expect(body.draft).toBeNull();
  });

  it('422s on a malformed query and 403s without brand access', async () => {
    const { client } = createClientStub({});
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    expect((await GET(getRequest({ brandId: 'not-a-uuid', assetId: ASSET_ID }))).status).toBe(422);

    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);
    expect((await GET(getRequest())).status).toBe(403);
  });
});

describe('PUT /api/library/timeline-drafts', () => {
  it('upserts on (asset_id, created_by) and stamps the author server-side', async () => {
    const { client, queries } = createClientStub({
      'media.assets': [{ data: { id: ASSET_ID }, error: null }],
      'media.timeline_drafts': [
        { data: { id: 'draft-1', updated_at: '2026-07-11T00:10:00.000Z' }, error: null },
      ],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, document: DOCUMENT }),
    );
    expect(response.status).toBe(200);
    const body = upsertTimelineDraftResponseSchema.parse(await response.json());
    expect(body).toEqual({ id: 'draft-1', updatedAt: '2026-07-11T00:10:00.000Z' });

    const upsert = callArgs(queries, 'media.timeline_drafts', 'upsert');
    const row = upsert?.[0] as Record<string, unknown>;
    expect(upsert?.[1]).toEqual({ onConflict: 'asset_id,created_by' });
    expect(row).toMatchObject({
      brand_id: BRAND_ID,
      asset_id: ASSET_ID,
      created_by: USER_ID,
      schema_version: 1,
      document: DOCUMENT,
    });
    // An autosave carries no status, so a previous 'rendered' stamp is not reverted.
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('rendered_asset_id');
  });

  it('stamps rendered drafts with their output asset and render time', async () => {
    const { client, queries } = createClientStub({
      'media.assets': [
        { data: { id: ASSET_ID }, error: null },
        { data: { id: EXTRA_ASSET_ID }, error: null },
      ],
      'media.timeline_drafts': [
        { data: { id: 'draft-1', updated_at: '2026-07-11T01:00:00.000Z' }, error: null },
      ],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await PUT(
      putRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        document: DOCUMENT,
        status: 'rendered',
        renderedAssetId: EXTRA_ASSET_ID,
      }),
    );
    expect(response.status).toBe(200);

    const row = callArgs(queries, 'media.timeline_drafts', 'upsert')?.[0] as Record<
      string,
      unknown
    >;
    expect(row.status).toBe('rendered');
    expect(row.rendered_asset_id).toBe(EXTRA_ASSET_ID);
    expect(typeof row.last_rendered_at).toBe('string');
  });

  it('422s on a document the contract rejects', async () => {
    const { client } = createClientStub({});
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await PUT(
      putRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        document: { ...DOCUMENT, items: [{ id: 'item-1', order: 0, sourceId: 'not-a-uuid' }] },
      }),
    );
    expect(response.status).toBe(422);
  });

  it('422s when the envelope points at a different asset than the row', async () => {
    const { client } = createClientStub({});
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await PUT(
      putRequest({
        brandId: BRAND_ID,
        assetId: EXTRA_ASSET_ID,
        document: DOCUMENT,
      }),
    );
    expect(response.status).toBe(422);
  });

  it('404s when the asset does not belong to the claimed brand', async () => {
    const { client } = createClientStub({
      'media.assets': [{ data: null, error: null }],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, document: DOCUMENT }),
    );
    expect(response.status).toBe(404);
  });

  it('404s when the rendered asset does not belong to the claimed brand', async () => {
    const { client } = createClientStub({
      'media.assets': [
        { data: { id: ASSET_ID }, error: null },
        { data: null, error: null },
      ],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await PUT(
      putRequest({
        brandId: BRAND_ID,
        assetId: ASSET_ID,
        document: DOCUMENT,
        status: 'rendered',
        renderedAssetId: EXTRA_ASSET_ID,
      }),
    );
    expect(response.status).toBe(404);
  });

  it('403s a caller without access to the brand', async () => {
    const { client } = createClientStub({});
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);

    const response = await PUT(
      putRequest({ brandId: BRAND_ID, assetId: ASSET_ID, document: DOCUMENT }),
    );
    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/library/timeline-drafts', () => {
  it("deletes only the caller's own draft", async () => {
    const { client, queries } = createClientStub({
      'media.timeline_drafts': [{ data: null, error: null }],
    });
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);

    const response = await DELETE(getRequest());
    expect(response.status).toBe(200);

    expect(callArgs(queries, 'media.timeline_drafts', 'delete')).toEqual([]);
    expect(eqFilters(queries, 'media.timeline_drafts')).toEqual({
      asset_id: ASSET_ID,
      brand_id: BRAND_ID,
      created_by: USER_ID,
    });
  });

  it('403s a caller without access to the brand', async () => {
    const { client } = createClientStub({});
    hooks.__testCreateSupabaseServerClient = () => Promise.resolve(client);
    hooks.__testCallerHasBrandAccess = () => Promise.resolve(false);

    expect((await DELETE(getRequest())).status).toBe(403);
  });
});
