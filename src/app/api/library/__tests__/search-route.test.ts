import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { CAROUSEL_SLIDE_TAG, TEXT_EMBEDDING_DIM } from '@continuum/contracts';

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
}));

const { POST } = await import('../search/route');

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';
const ASSET_ID = '11111111-1111-4111-8111-111111111111';
const VECTOR = Array.from({ length: TEXT_EMBEDDING_DIM }, () => 0.01);

type RpcCall = { fn: string; args: Record<string, unknown> };

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
}) {
  const { rpcResults, rpcCalls } = params;
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
      from: () => ({
        select: () => ({
          in: async () => ({ data: hydrateIds.map((id) => assetRow(id)), error: null }),
        }),
      }),
    }),
  });

  hooks.__testMintSignedUrls = async (...args: unknown[]) => {
    const items = (args[0] ?? []) as { path: string; bucket: string }[];
    return new Map(items.map((item) => [item.path, `https://signed.test/${item.path}`]));
  };
}

function searchRequest(query: string) {
  return new Request('http://localhost/api/library/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brandId: BRAND_ID, mode: 'text', query, limit: 24 }),
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
    expect(vectorCall?.args.filter_exclude_tags).toEqual([CAROUSEL_SLIDE_TAG]);
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
    expect(lexicalCall?.args.filter_exclude_tags).toEqual([CAROUSEL_SLIDE_TAG]);
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
