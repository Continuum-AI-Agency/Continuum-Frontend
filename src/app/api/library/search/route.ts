import type { MediaSearchResponse, MediaSearchResultItem } from '@continuum/contracts';
import { mediaSearchRequestSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveFieldFilterAssetIds } from '@/lib/library/customFields.server';
import { buildCarousel, carouselSignablePaths } from '@/lib/media/carousel';
import { embedSearchQuery } from '@/lib/media/embedQuery.server';
import { toSearchRpcFilters } from '@/lib/media/filters';
import { rowToSignedMediaAsset } from '@/lib/media/mapper';
import {
  buildAssetPreview,
  loadAssetRenditions,
  renditionSignablePaths,
} from '@/lib/media/renditions';
import { type MatchAssetRow, MEDIA_ASSET_SELECT, type MediaAssetRow } from '@/lib/media/schema';
import { assetSignablePaths, mintSignedUrls } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// search_assets_ranked scores by field priority (title 3 / tags 2 / description 1).
// Normalized so a lexical hit and a cosine hit both land in the contract's [0,1].
const LEXICAL_MAX_SCORE = 3;

// Which ranking produced the results. Returned alongside the response contract so
// the search bar can tell the user honestly when it fell back to keywords (a brand
// whose media was never analyzed has no embeddings at all).
// 'hybrid' = meaning-matched hits plus keyword-only hits the vector search could
// not see (assets whose analysis has not run yet).
type SearchStrategy = 'semantic' | 'lexical' | 'hybrid';

function clamp01(value: number | null | undefined): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

// Hydrates the ranked id list into full assets + signed URLs, preserving rank order.
async function hydrateMatches(
  supabase: SupabaseClient,
  matches: readonly MatchAssetRow[],
): Promise<MediaSearchResultItem[]> {
  const ids = matches.map((match) => match.id);
  if (ids.length === 0) return [];

  const { data: assetRows, error } = await mediaSchema(supabase)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .in('id', ids);
  if (error) throw new Error(`media.assets hydration failed: ${error.message}`);

  const rows = (assetRows ?? []) as unknown as MediaAssetRow[];
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const renditions = await loadAssetRenditions(
    supabase,
    rows.flatMap((row) => (row.head_version_id ? [row.head_version_id] : [])),
  );
  const signedUrlMap = await mintSignedUrls([
    ...assetSignablePaths(rows),
    ...carouselSignablePaths(rows),
    ...renditionSignablePaths(renditions),
  ]);

  return matches.flatMap((match) => {
    const row = rowMap.get(match.id);
    if (!row) return [];
    const preview = buildAssetPreview(row, renditions, signedUrlMap);
    const asset = rowToSignedMediaAsset(row, signedUrlMap, preview);
    const carousel = buildCarousel(row, signedUrlMap);
    return [
      {
        asset: carousel ? { ...asset, carousel } : asset,
        similarity: clamp01(match.similarity),
      },
    ];
  });
}

// HYBRID text search. The embedding (minted by the embed-search-query edge
// function — the Frontend holds no model key) vector-matches the Gemini-written
// descriptions, so "something for a cooking video" finds the olive-oil hero that
// shares none of those words. Keyword ranking runs ALONGSIDE it, not merely as a
// fallback: analysis is async and free-tier brands are never analyzed, so an
// asset with no embedding must still be findable by its own name. Running lexical
// only on zero vector hits made such an asset invisible the moment one OTHER
// asset matched semantically.
async function runTextSearch(
  supabase: SupabaseClient,
  params: {
    brandId: string;
    query: string;
    limit: number;
    threshold: number;
    rpcFilters: Record<string, unknown>;
  },
): Promise<{ matches: MatchAssetRow[]; strategy: SearchStrategy }> {
  const { brandId, query, limit, threshold, rpcFilters } = params;

  const embedding = await embedSearchQuery(supabase, query);

  const semantic: MatchAssetRow[] = [];
  if (embedding) {
    const { data, error } = await mediaSchema(supabase).rpc('match_assets_by_text', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      filter_brand_id: brandId,
      ...rpcFilters,
    });
    if (error) {
      console.error('[library/search] match_assets_by_text failed', error);
    } else {
      semantic.push(...((data ?? []) as MatchAssetRow[]));
    }
  }

  const { data, error } = await mediaSchema(supabase).rpc('search_assets_ranked', {
    filter_brand_id: brandId,
    q: query,
    match_count: limit,
    ...rpcFilters,
  });
  if (error) throw new Error(`media.search_assets_ranked failed: ${error.message}`);

  const lexical = ((data ?? []) as MatchAssetRow[]).map((match) => ({
    ...match,
    similarity: clamp01((match.similarity ?? 0) / LEXICAL_MAX_SCORE),
  }));

  // Semantic hits keep their rank; keyword-only hits trail them. Never dropped.
  const seen = new Set(semantic.map((match) => match.id));
  const extras = lexical.filter((match) => !seen.has(match.id));
  const matches = [...semantic, ...extras].slice(0, limit);

  const strategy: SearchStrategy =
    semantic.length > 0 ? (extras.length > 0 ? 'hybrid' : 'semantic') : 'lexical';
  return { matches, strategy };
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = mediaSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 422 });
  }

  const req = parsed.data;
  // Filters are pushed INTO the ranking RPCs as named args so they participate
  // in ranking — a filtered search fills `limit` instead of dropping ranked
  // rows post-hoc. Hydration below is by id only.
  const rpcFilters = toSearchRpcFilters(req.filters);

  // Verify the caller belongs to the brand. has_brand_access is SECURITY
  // DEFINER and reads auth.uid(), so it must run on the user-scoped client.
  const { data: hasAccess, error: accessError } = await supabase
    .schema('brand_profiles')
    .rpc('has_brand_access', { brand_id: req.brandId });
  if (accessError || !hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // A field's value lives in another table, so it cannot be a predicate on
  // media.assets. Resolve it to ids HERE — after brand access is proven, on the
  // user-scoped client — and push the result into the ranking RPCs alongside
  // every other filter. Dropping field filters on the search path (which is what
  // happened before this) would return the very assets the user filtered out.
  // `is_empty` cannot be selected for in jsonb, so it arrives as its complement.
  const fieldFilters = req.filters?.fieldFilters ?? [];
  if (fieldFilters.length > 0) {
    try {
      const resolution = await resolveFieldFilterAssetIds(supabase, req.brandId, fieldFilters);
      if (resolution.kind === 'ids') {
        rpcFilters.filter_asset_ids = resolution.ids;
      } else if (resolution.kind === 'exclude') {
        rpcFilters.filter_exclude_asset_ids = resolution.ids;
      }
    } catch (err) {
      // Never fall through to an unfiltered search: returning the assets the
      // user filtered out is worse than returning an error.
      console.error('[library/search] field filter resolution failed', err);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
  }

  // Read/rank with the user-scoped client: media.assets RLS (has_brand_access)
  // scopes rows to the caller's brands, and authenticated holds EXECUTE on the
  // ranking RPCs — so no service-role bypass is needed.
  try {
    if (req.mode === 'text') {
      const { matches, strategy } = await runTextSearch(supabase, {
        brandId: req.brandId,
        query: req.query!,
        limit: req.limit,
        threshold: req.threshold,
        rpcFilters,
      });

      const result: MediaSearchResponse = {
        mode: 'text',
        items: await hydrateMatches(supabase, matches),
      };
      return NextResponse.json({ ...result, strategy });
    }

    // similar mode
    const { data: refRow, error: refError } = await mediaSchema(supabase)
      .from('assets')
      .select('embedding_image, brand_id')
      .eq('id', req.similarToAssetId!)
      .single()
      .returns<{ embedding_image: unknown; brand_id: string }>();

    if (refError || !refRow) {
      console.error('[library/search] reference asset not found', refError);
      return NextResponse.json({ error: 'Reference asset not found' }, { status: 404 });
    }

    // The reference asset must belong to the brand the caller is authorized for,
    // so a foreign asset id cannot be used to seed a similarity query.
    if (refRow.brand_id !== req.brandId) {
      return NextResponse.json({ error: 'Reference asset not found' }, { status: 404 });
    }

    const { data: matchRows, error: matchError } = await mediaSchema(supabase).rpc(
      'match_similar_assets',
      {
        query_embedding: refRow.embedding_image,
        match_threshold: req.threshold,
        match_count: req.limit,
        filter_brand_id: req.brandId,
        exclude_asset_id: req.similarToAssetId,
        ...rpcFilters,
      },
    );

    if (matchError) {
      console.error('[library/search] match_similar_assets failed', matchError);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    const result: MediaSearchResponse = {
      mode: 'similar',
      items: await hydrateMatches(supabase, (matchRows ?? []) as MatchAssetRow[]),
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error('[library/search] search failed', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

// Allow preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
