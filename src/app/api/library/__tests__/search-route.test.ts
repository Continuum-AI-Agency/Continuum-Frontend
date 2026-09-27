import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { CAROUSEL_SLIDE_TAG, HIDDEN_LIBRARY_TAGS, TEXT_EMBEDDING_DIM } from '@continuum/contracts';

// bun's mock.module is process-wide, and the sibling library route specs replace
// these same modules. Delegating through the shared globalThis hooks they already
// use keeps this spec correct no matter which registration wins the batch run.
type Hooks = {
  __testCreateSupabaseServerClient?: (...args: unknown[]) => unknown;
  __testMintSignedUrl?: (...args: unknown[]) => unknown;
  __testMintSignedUrls?: (...args: unknown[]) => unknown;
};
const hooks = globalThis as Hooks;

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    hooks.__testCreateSupabaseServerClient?.(...args),
}));
mock.module('@/lib/media/signed-urls', () => ({
  mintSignedUrl: (...args: unknown[]) => hooks.__testMintSignedUrl?.(...args),
  mintSignedUrls: (...args: unknown[]) => hooks.__testMintSignedUrls?.(...args),
  // The search route also imports assetSignablePaths; a partial mock makes the
  // module fail to link with "Export named ... not found" rather than a clear
  // failure. The sibling assets/route.test.ts mock already carries it.
  assetSignablePaths: (rows: { bucket: string; storage_path: string }[]) =>
    rows.map((row) => ({ bucket: row.bucket, path: row.storage_path })),
}));

const { POST } = await import('../search/route');

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const VECTOR = Array.from({ length: TEXT_EMBEDDING_DIM }, () => 0.01);

type RpcCall = { fn: string; args: Record<string, unknown> };
type QueryOp = [method: string, ...args: unknown[]];
type FromCall = { table: string; ops: QueryOp[] };

function assetRow(id: string) {
  return {
    id,
    brand_id: BRAND_ID,
    created_by: null,
    kind: 'image',
    bucket: 'media-library',
    storage_path: `${BRAND_ID}/${id}.jpg`,
    file_name: 'hero.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 1024,
    width: 1200,
    height: 800,
    duration_ms: null,
    source: 'upload',
    origin_ref: null,
    status: 'ready',
    review_status: 'none',
    checksum: null,
    progress_step: null,
    error_code: null,
    error_message: null,
    title: 'Olive oil drizzle over a garden salad',
    description: 'Overhead shot of olive oil poured onto fresh greens.',
    tags: ['food', 'overhead'],
    ad_creative_analysis: null,
    detected_objects: null,
    embedding_model: 'gemini-embedding-2',
    has_image_embedding: false,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    deleted_at: null,
  };
}

// Chainable stub of the surface the route touches: auth, the brand-access RPC on
// the brand_profiles schema, and the ranking RPCs + asset hydration on the media
// schema. Signed URLs come from the mocked signed-urls module.
function installSupabaseStub(params: {
  rpcResults: Record<string, unknown[]>;
  rpcCalls: RpcCall[];
  // The query embedding is minted by the embed-search-query edge function — the
  // Frontend holds no model key. `null` simulates the function being
  // unavailable, which must degrade to keyword search.
  embedding?: number[] | null;
  hydrateIds?: string[];
  fromCalls?: FromCall[];
  // Rows answered by the plain selects (not hydration): comment hits and the
  // filtered id select.
  commentRows?: { asset_id: string }[];
  filteredIds?: string[];
}) {
  const { rpcResults, rpcCalls } = params;
  const fromCalls = params.fromCalls ?? [];
  const embedding = params.embedding === undefined ? VECTOR : params.embedding;
  const hydrateIds = params.hydrateIds ?? [ASSET_ID];

  hooks.__testCreateSupabaseServerClient = async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    functions: {
      invoke: async () =>
        embedding
          ? { data: { embedding }, error: null }
          : { data: null, error: { message: 'Embedding unavailable' } },
    },
    schema: (name: string) => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        if (name === 'brand_profiles' && fn === 'has_brand_access') {
          return { data: true, error: null };
        }
        return { data: rpcResults[fn] ?? [], error: null };
      },
      from: (table: string) => {
        const call: FromCall = { table, ops: [] };
        fromCalls.push(call);
        const result = () => {
          if (table === 'comments') return params.commentRows ?? [];
          const columns = call.ops[0]?.[1];
          if (columns === 'id') return (params.filteredIds ?? []).map((id) => ({ id }));
          return hydrateIds.map((id) => assetRow(id));
        };
        const builder: Record<string, unknown> = {
          then: (resolve: (value: unknown) => unknown) => resolve({ data: result(), error: null }),
        };
        for (const method of [
          'select',
          'eq',
          'is',
          'not',
          'in',
          'ilike',
          'contains',
          'gte',
          'lt',
          'order',
          'limit',
        ]) {
          builder[method] = (...args: unknown[]) => {
            call.ops.push([method, ...args]);
            return builder;
          };
        }
        return builder;
      },
    }),
  });

  hooks.__testMintSignedUrls = async (...args: unknown[]) => {
    const items = (args[0] ?? []) as { path: string; bucket: string }[];
    return new Map(items.map((item) => [item.path, `https://signed.test/${item.path}`]));
  };
}

function searchRequest(query: string, filters?: Record<string, unknown>) {
  return new Request('http://localhost/api/library/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brandId: BRAND_ID,
      mode: 'text',
      ...(query ? { query } : {}),
      limit: 24,
      ...(filters ? { filters } : {}),
    }),
  });
}

describe('POST /api/library/search — strategy selection', () => {
  let rpcCalls: RpcCall[];

  beforeEach(() => {
    rpcCalls = [];
  });

  afterEach(() => {
    hooks.__testCreateSupabaseServerClient = undefined;
    hooks.__testMintSignedUrls = undefined;
  });

  it('uses the vector match when the query embeds and the vector search hits', async () => {
    installSupabaseStub({
      rpcCalls,
      rpcResults: { match_assets_by_text: [{ id: ASSET_ID, similarity: 0.71 }] },
    });

    const response = await POST(searchRequest('something for a cooking video'));
    const body = (await response.json()) as {
      mode: string;
      strategy: string;
      items: { asset: { id: string }; similarity: number }[];
    };

    expect(response.status).toBe(200);
    expect(body.strategy).toBe('semantic');
    expect(body.mode).toBe('text');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].asset.id).toBe(ASSET_ID);
    expect(body.items[0].similarity).toBeCloseTo(0.71, 5);

    const vectorCall = rpcCalls.find((call) => call.fn === 'match_assets_by_text');
    expect(vectorCall?.args.query_embedding).toEqual(VECTOR);
    expect(vectorCall?.args.filter_brand_id).toBe(BRAND_ID);
    expect(vectorCall?.args.match_count).toBe(24);
    expect(vectorCall?.args.match_threshold).toBe(0.2);
    expect(vectorCall?.args.filter_exclude_tags).toEqual([...HIDDEN_LIBRARY_TAGS]);
    // Keyword ranking runs alongside the vector match (hybrid), so an asset with
    // no embedding yet is never hidden by another asset's semantic hit. It adds
    // nothing here, so the strategy stays 'semantic'.
    expect(rpcCalls.some((call) => call.fn === 'search_assets_ranked')).toBe(true);
  });

  it('unions keyword-only hits behind the semantic hits (a fresh upload stays findable)', async () => {
    const FRESH_ID = '22222222-2222-4222-8222-222222222222';
    installSupabaseStub({
      rpcCalls,
      rpcResults: {
        match_assets_by_text: [{ id: ASSET_ID, similarity: 0.71 }],
        // The just-uploaded asset is not embedded yet, so only the keyword path
        // can see it — it must still be returned.
        search_assets_ranked: [{ id: FRESH_ID, similarity: 3 }],
      },
      hydrateIds: [ASSET_ID, FRESH_ID],
    });

    const response = await POST(searchRequest('hero'));
    const body = (await response.json()) as {
      strategy: string;
      items: { asset: { id: string } }[];
    };

    expect(body.strategy).toBe('hybrid');
    expect(body.items.map((item) => item.asset.id)).toEqual([ASSET_ID, FRESH_ID]);
  });

  it('falls back to keyword ranking when the query cannot be embedded', async () => {
    installSupabaseStub({
      rpcCalls,
      embedding: null,
      rpcResults: { search_assets_ranked: [{ id: ASSET_ID, similarity: 3 }] },
    });

    const response = await POST(searchRequest('olive oil'));
    const body = (await response.json()) as {
      strategy: string;
      items: { similarity: number }[];
    };

    expect(body.strategy).toBe('lexical');
    expect(rpcCalls.some((call) => call.fn === 'match_assets_by_text')).toBe(false);

    const lexicalCall = rpcCalls.find((call) => call.fn === 'search_assets_ranked');
    expect(lexicalCall?.args.q).toBe('olive oil');
    expect(lexicalCall?.args.filter_exclude_tags).toEqual([...HIDDEN_LIBRARY_TAGS]);
    // Field-priority score (title = 3) normalized into the contract's [0,1].
    expect(body.items[0].similarity).toBe(1);
  });

  it('falls back to keyword ranking when the vector search returns zero rows', async () => {
    installSupabaseStub({
      rpcCalls,
      rpcResults: {
        match_assets_by_text: [],
        search_assets_ranked: [{ id: ASSET_ID, similarity: 2 }],
      },
    });

    const response = await POST(searchRequest('olive oil'));
    const body = (await response.json()) as { strategy: string; items: { similarity: number }[] };

    expect(rpcCalls.some((call) => call.fn === 'match_assets_by_text')).toBe(true);
    expect(rpcCalls.some((call) => call.fn === 'search_assets_ranked')).toBe(true);
    expect(body.strategy).toBe('lexical');
    expect(body.items[0].similarity).toBeCloseTo(2 / 3, 5);
  });

  it('reports the lexical strategy even when nothing matches', async () => {
    installSupabaseStub({
      rpcCalls,
      rpcResults: { match_assets_by_text: [], search_assets_ranked: [] },
    });

    const response = await POST(searchRequest('nothing like this exists'));
    const body = (await response.json()) as { strategy: string; items: unknown[] };

    expect(body.strategy).toBe('lexical');
    expect(body.items).toEqual([]);
  });
});

describe('POST /api/library/search — comments and date filters', () => {
  const COMMENTED_ID = '33333333-3333-4333-8333-333333333333';
  let rpcCalls: RpcCall[];
  let fromCalls: FromCall[];

  beforeEach(() => {
    rpcCalls = [];
    fromCalls = [];
  });

  afterEach(() => {
    hooks.__testCreateSupabaseServerClient = undefined;
    hooks.__testMintSignedUrls = undefined;
  });

  it('finds an asset by its review comment, word by word, behind the semantic hits', async () => {
    installSupabaseStub({
      rpcCalls,
      fromCalls,
      rpcResults: { match_assets_by_text: [{ id: ASSET_ID, similarity: 0.71 }] },
      commentRows: [{ asset_id: COMMENTED_ID }, { asset_id: COMMENTED_ID }],
      filteredIds: [COMMENTED_ID],
      hydrateIds: [ASSET_ID, COMMENTED_ID],
    });

    const response = await POST(searchRequest('logo too small'));
    const body = (await response.json()) as {
      strategy: string;
      items: { asset: { id: string }; similarity: number; matchedOn?: string[] }[];
    };

    expect(body.strategy).toBe('hybrid');
    expect(body.items.map((item) => item.asset.id)).toEqual([ASSET_ID, COMMENTED_ID]);
    expect(body.items[0].matchedOn).toEqual(['semantic']);
    expect(body.items[1].matchedOn).toEqual(['comment']);
    expect(body.items[1].similarity).toBeCloseTo(1 / 3, 5);

    const comments = fromCalls.find((call) => call.table === 'comments');
    expect(comments?.ops).toContainEqual(['eq', 'brand_id', BRAND_ID]);
    expect(comments?.ops).toContainEqual(['is', 'deleted_at', null]);
    const needles = comments?.ops.filter((op) => op[0] === 'ilike').map((op) => op[2]);
    expect(needles).toEqual(['%logo%', '%too%', '%small%']);

    // The comment hit is re-checked against the user's filters before it is shown.
    const recheck = fromCalls.find(
      (call) =>
        call.table === 'assets' &&
        call.ops.some(
          (op) => op[0] === 'in' && Array.isArray(op[2]) && op[2].includes(COMMENTED_ID),
        ),
    );
    expect(recheck?.ops).toContainEqual(['select', 'id']);
  });

  it('resolves a date range to an id constraint on the ranking RPCs', async () => {
    const RECENT_ID = '44444444-4444-4444-8444-444444444444';
    installSupabaseStub({
      rpcCalls,
      fromCalls,
      rpcResults: { search_assets_ranked: [{ id: RECENT_ID, similarity: 3 }] },
      filteredIds: [RECENT_ID],
      hydrateIds: [RECENT_ID],
    });

    const range = {
      createdAfter: '2026-09-20T00:00:00.000Z',
      createdBefore: '2026-09-27T00:00:00.000Z',
    };
    const response = await POST(searchRequest('beach', { kind: 'video', ...range }));
    expect(response.status).toBe(200);

    const rangeSelect = fromCalls.find((call) => call.ops.some((op) => op[0] === 'gte'));
    expect(rangeSelect?.ops).toContainEqual(['gte', 'created_at', range.createdAfter]);
    expect(rangeSelect?.ops).toContainEqual(['lt', 'created_at', range.createdBefore]);
    expect(rangeSelect?.ops).toContainEqual(['eq', 'kind', 'video']);

    const lexicalCall = rpcCalls.find((call) => call.fn === 'search_assets_ranked');
    expect(lexicalCall?.args.filter_asset_ids).toEqual([RECENT_ID]);
    expect(lexicalCall?.args.filter_kind).toBe('video');
  });

  it('lists the filtered assets newest-first when the query is only filters', async () => {
    installSupabaseStub({
      rpcCalls,
      fromCalls,
      rpcResults: {},
      filteredIds: [ASSET_ID],
    });

    const response = await POST(searchRequest('', { kind: 'video', tags: ['summer'] }));
    const body = (await response.json()) as {
      strategy: string;
      items: { asset: { id: string }; matchedOn?: string[] }[];
    };

    expect(response.status).toBe(200);
    expect(body.strategy).toBe('filters');
    expect(body.items.map((item) => item.asset.id)).toEqual([ASSET_ID]);
    expect(body.items[0].matchedOn).toEqual(['filters']);
    expect(rpcCalls.some((call) => call.fn === 'search_assets_ranked')).toBe(false);

    const select = fromCalls.find((call) => call.ops[0]?.[1] === 'id');
    expect(select?.ops).toContainEqual(['contains', 'tags', ['summer']]);
    expect(select?.ops).toContainEqual(['order', 'created_at', { ascending: false }]);
  });

  it('still rejects a text search with neither words nor filters', async () => {
    installSupabaseStub({ rpcCalls, fromCalls, rpcResults: {} });
    const response = await POST(searchRequest(''));
    expect(response.status).toBe(422);
  });
});

describe('POST /api/library/search — visual text search', () => {
  const UNTAGGED_ID = '55555555-5555-4555-8555-555555555555';
  const KEYWORD_ID = '66666666-6666-4666-8666-666666666666';
  const VISUAL = Array.from({ length: 1408 }, () => 0.02);
  let rpcCalls: RpcCall[];

  beforeEach(() => {
    rpcCalls = [];
  });

  afterEach(() => {
    hooks.__testCreateSupabaseServerClient = undefined;
    hooks.__testMintSignedUrls = undefined;
  });

  function visualRequest(visualEmbedding: number[]) {
    return new Request('http://localhost/api/library/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId: BRAND_ID,
        mode: 'text',
        query: 'person lifting weights',
        limit: 24,
        visualEmbedding,
        filters: { kind: 'video' },
      }),
    });
  }

  it('ranks image-space hits after semantic hits and before keyword hits', async () => {
    installSupabaseStub({
      rpcCalls,
      rpcResults: {
        match_assets_by_text: [{ id: ASSET_ID, similarity: 0.71 }],
        match_similar_assets: [
          { id: UNTAGGED_ID, similarity: 0.14 },
          { id: ASSET_ID, similarity: 0.12 },
        ],
        search_assets_ranked: [{ id: KEYWORD_ID, similarity: 3 }],
      },
      hydrateIds: [ASSET_ID, UNTAGGED_ID, KEYWORD_ID],
    });

    const response = await POST(visualRequest(VISUAL));
    const body = (await response.json()) as {
      items: { asset: { id: string }; matchedOn?: string[] }[];
    };

    expect(body.items.map((item) => item.asset.id)).toEqual([ASSET_ID, UNTAGGED_ID, KEYWORD_ID]);
    expect(body.items[0].matchedOn).toEqual(['semantic', 'visual']);
    expect(body.items[1].matchedOn).toEqual(['visual']);

    const visualCall = rpcCalls.find((call) => call.fn === 'match_similar_assets');
    expect(visualCall?.args.query_embedding).toEqual(VISUAL);
    expect(visualCall?.args.exclude_asset_id).toBeNull();
    expect(visualCall?.args.match_threshold).toBe(0.08);
    expect(visualCall?.args.match_count).toBe(12);
    expect(visualCall?.args.filter_kind).toBe('video');
  });

  it('keeps an untagged visual hit when semantic hits alone would fill the page', async () => {
    const semanticIds = Array.from(
      { length: 24 },
      (_, i) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`,
    );
    installSupabaseStub({
      rpcCalls,
      rpcResults: {
        match_assets_by_text: semanticIds.map((id, i) => ({ id, similarity: 0.9 - i * 0.01 })),
        match_similar_assets: [{ id: UNTAGGED_ID, similarity: 0.16 }],
        search_assets_ranked: [],
      },
      hydrateIds: [...semanticIds, UNTAGGED_ID],
    });

    const response = await POST(visualRequest(VISUAL));
    const body = (await response.json()) as { items: { asset: { id: string } }[] };

    expect(body.items).toHaveLength(24);
    expect(body.items.map((item) => item.asset.id)).toContain(UNTAGGED_ID);
    expect(body.items[1]?.asset.id).toBe(UNTAGGED_ID);
  });

  it('skips the image-space match when no visual embedding is sent', async () => {
    installSupabaseStub({ rpcCalls, rpcResults: {} });
    await POST(searchRequest('olive oil'));
    expect(rpcCalls.some((call) => call.fn === 'match_similar_assets')).toBe(false);
  });

  it('rejects a visual embedding of the wrong width', async () => {
    installSupabaseStub({ rpcCalls, rpcResults: {} });
    const response = await POST(visualRequest([0.1, 0.2]));
    expect(response.status).toBe(422);
  });
});
