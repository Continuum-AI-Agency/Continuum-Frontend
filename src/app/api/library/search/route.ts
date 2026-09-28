import type {
  MediaSearchMatchReason,
  MediaSearchResponse,
  MediaSearchResultItem,
} from '@continuum/contracts';
import { mediaSearchRequestSchema } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { resolveFieldFilterAssetIds } from '@/lib/library/customFields.server';
import { buildCarousel, carouselSignablePaths } from '@/lib/media/carousel';
import { embedSearchQuery } from '@/lib/media/embedQuery.server';
import {
  type MediaSearchRpcFilters,
  searchReviewFilter,
  toSearchRpcFilters,
} from '@/lib/media/filters';
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

// A comment hit is text a person wrote ABOUT the asset — ranked like a
// description hit, behind title and tag hits.
const COMMENT_HIT_SIMILARITY = 1 / LEXICAL_MAX_SCORE;

// ponytail: a date range resolves to at most this many newest ids, passed to the
// ranking RPCs as filter_asset_ids; add created_at args to the RPCs when a brand
// uploads more than this inside one searched window.
const DATE_RANGE_ID_CAP = 1_000;

const MAX_COMMENT_WORDS = 6;

// Text→image cosine runs an order of magnitude below image→image, so similar
// mode's 0.2 would drop every hit. Measured 2026-09-27 on 3 real brands (~320
// image embeddings each): true matches scored 0.10–0.14 ("gym" → gym photos,
// "a dog" → golden retrievers) while the best hit for an absent subject
// ("zebra", "food") topped out at 0.03–0.06.
const VISUAL_MATCH_THRESHOLD = 0.08;
// ponytail: generic queries ("text on a white background") clear the floor for a
// whole brand, so visual hits are rank-capped; add a relative-gap cut if they crowd.
const VISUAL_MATCH_CAP = 12;

// Which ranking produced the results. Returned alongside the response contract so
// the search bar can tell the user honestly when it fell back to keywords (a brand
// whose media was never analyzed has no embeddings at all).
// 'hybrid' = meaning-matched hits plus keyword-only hits the vector search could
// not see (assets whose analysis has not run yet).
// 'filters' = no words to rank, only filters: the filtered assets, newest first.
type SearchStrategy = 'semantic' | 'lexical' | 'hybrid' | 'filters';

type RankedMatch = { id: string; similarity: number; matchedOn: MediaSearchMatchReason[] };

function clamp01(value: number | null | undefined): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

// Hydrates the ranked id list into full assets + signed URLs, preserving rank order.
async function hydrateMatches(
  supabase: SupabaseClient,
  matches: readonly RankedMatch[],
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
        ...(match.matchedOn.length > 0 ? { matchedOn: match.matchedOn } : {}),
      },
    ];
  });
}

// Which of the fields the keyword RPC returns actually hold the query. A hit
// found only by fuzzy match, file name or transcript names no field here.
function lexicalReasons(match: MatchAssetRow, query: string): MediaSearchMatchReason[] {
  const needle = query.trim().toLowerCase();
  const reasons: MediaSearchMatchReason[] = [];
  if (match.title?.toLowerCase().includes(needle)) reasons.push('title');
  if (match.tags?.some((tag) => tag.toLowerCase().includes(needle))) reasons.push('tags');
  if (match.description?.toLowerCase().includes(needle)) reasons.push('description');
  return reasons;
}

// Every filter the ranking RPCs take, applied as a plain select — for a
// filters-only search, for resolving a date range to ids, and for keeping comment
// hits inside the user's filters. Mirrors the RPCs' WHERE clause.
async function selectFilteredAssetIds(
  supabase: SupabaseClient,
  brandId: string,
  filters: MediaSearchRpcFilters,
  options: {
    ids?: readonly string[];
    createdAfter?: string;
    createdBefore?: string;
    /** The review choice as a PostgREST `or` (statuses OR custom states). */
    reviewOr?: string | null;
    limit: number;
  },
): Promise<string[]> {
  let query = mediaSchema(supabase)
    .from('assets')
    .select('id')
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .not('tags', 'ov', `{${filters.filter_exclude_tags.join(',')}}`);

  if (filters.filter_collection_id) {
    const { data, error } = await mediaSchema(supabase)
      .from('collection_items')
      .select('asset_id')
      .eq('collection_id', filters.filter_collection_id);
    if (error) throw new Error(`media.collection_items read failed: ${error.message}`);
    query = query.in(
      'id',
      ((data ?? []) as { asset_id: string }[]).map((row) => row.asset_id),
    );
  }
  if (options.ids) query = query.in('id', [...options.ids]);
  if (filters.filter_asset_ids) query = query.in('id', filters.filter_asset_ids);
  if (filters.filter_exclude_asset_ids && filters.filter_exclude_asset_ids.length > 0) {
    query = query.not('id', 'in', `(${filters.filter_exclude_asset_ids.join(',')})`);
  }
  if (filters.filter_source) query = query.eq('source', filters.filter_source);
  if (filters.filter_kind) query = query.eq('kind', filters.filter_kind);
  if (filters.filter_tags) query = query.contains('tags', filters.filter_tags);
  if (filters.filter_review_status) query = query.eq('review_status', filters.filter_review_status);
  if (options.createdAfter) query = query.gte('created_at', options.createdAfter);
  if (options.createdBefore) query = query.lt('created_at', options.createdBefore);
  if (options.reviewOr) query = query.or(options.reviewOr);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(options.limit);
  if (error) throw new Error(`media.assets filter select failed: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

// Review comments are searched word-by-word (every word must appear), so
// "logo too small" finds "the logo is too small". Splitting on anything that is
// not a letter or digit also strips LIKE's own wildcards from the needle.
// ponytail: unindexed ilike over the brand's comments — fine at thousands of
// comments per brand; add a trigram/tsvector index when comment search slows.
async function findCommentAssetIds(
  supabase: SupabaseClient,
  brandId: string,
  query: string,
  limit: number,
): Promise<string[]> {
  const words = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 1),
    ),
  ].slice(0, MAX_COMMENT_WORDS);
  if (words.length === 0) return [];

  let commentQuery = mediaSchema(supabase)
    .from('comments')
    .select('asset_id')
    .eq('brand_id', brandId)
    .is('deleted_at', null);
  for (const word of words) commentQuery = commentQuery.ilike('body', `%${word}%`);

  const { data, error } = await commentQuery.order('created_at', { ascending: false }).limit(limit);
  if (error) {
    // Comment matches are a bonus on top of the asset search; never fail it.
    console.error('[library/search] comment search failed', error);
    return [];
  }
  return [...new Set(((data ?? []) as { asset_id: string }[]).map((row) => row.asset_id))];
}

// HYBRID text search. The embedding (minted by the embed-search-query edge
// function — the Frontend holds no model key) vector-matches the Gemini-written
// descriptions, so "something for a cooking video" finds the olive-oil hero that
// shares none of those words. Keyword ranking runs ALONGSIDE it, not merely as a
// fallback: analysis is async and free-tier brands are never analyzed, so an
// asset with no embedding must still be findable by its own name. Running lexical
// only on zero vector hits made such an asset invisible the moment one OTHER
// asset matched semantically. The keyword RPC already reads the transcript, so
// spoken words are found there; review comments are matched here.
function interleaveByRank<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i += 1) {
    if (i < first.length) out.push(first[i] as T);
    if (i < second.length) out.push(second[i] as T);
  }
  return out;
}

async function runTextSearch(
  supabase: SupabaseClient,
  params: {
    brandId: string;
    query: string;
    limit: number;
    threshold: number;
    rpcFilters: MediaSearchRpcFilters;
    visualEmbedding?: number[];
  },
): Promise<{ matches: RankedMatch[]; strategy: SearchStrategy }> {
  const { brandId, query, limit, threshold, rpcFilters, visualEmbedding } = params;

  const embedding = await embedSearchQuery(supabase, query);

  const semantic: RankedMatch[] = [];
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
      for (const match of (data ?? []) as MatchAssetRow[]) {
        semantic.push({ id: match.id, similarity: match.similarity, matchedOn: ['semantic'] });
      }
    }
  }

  // The query embedded into the IMAGE space finds footage whose pixels match
  // even when nobody tagged or described it. Extra recall, never required.
  const visual: RankedMatch[] = [];
  if (visualEmbedding) {
    const { data, error } = await mediaSchema(supabase).rpc('match_similar_assets', {
      query_embedding: visualEmbedding,
      match_threshold: VISUAL_MATCH_THRESHOLD,
      match_count: Math.min(limit, VISUAL_MATCH_CAP),
      filter_brand_id: brandId,
      exclude_asset_id: null,
      ...rpcFilters,
    });
    if (error) {
      console.error('[library/search] visual match_similar_assets failed', error);
    } else {
      for (const match of (data ?? []) as MatchAssetRow[]) {
        visual.push({ id: match.id, similarity: match.similarity, matchedOn: ['visual'] });
      }
    }
    // Footage is matched on its BEST frame: the mean over a video's frames dilutes a subject
    // that is on screen for one shot (measured 0.084 for the mean vs ~0.2 for the frame).
    const { data: frameData, error: frameError } = await mediaSchema(supabase).rpc(
      'match_asset_frames',
      {
        query_embedding: visualEmbedding,
        match_threshold: VISUAL_MATCH_THRESHOLD,
        match_count: Math.min(limit, VISUAL_MATCH_CAP),
        filter_brand_id: brandId,
        exclude_asset_id: null,
        ...rpcFilters,
      },
    );
    if (frameError) {
      console.error('[library/search] visual match_asset_frames failed', frameError);
    } else {
      mergeBestVisual(visual, (frameData ?? []) as MatchAssetRow[]);
    }
  }

  const { data, error } = await mediaSchema(supabase).rpc('search_assets_ranked', {
    filter_brand_id: brandId,
    q: query,
    match_count: limit,
    ...rpcFilters,
  });
  if (error) throw new Error(`media.search_assets_ranked failed: ${error.message}`);

  const lexical: RankedMatch[] = ((data ?? []) as MatchAssetRow[]).map((match) => ({
    id: match.id,
    similarity: clamp01((match.similarity ?? 0) / LEXICAL_MAX_SCORE),
    matchedOn: lexicalReasons(match, query),
  }));

  const commentIds = await findCommentAssetIds(supabase, brandId, query, limit);
  const commentHits: RankedMatch[] =
    commentIds.length === 0
      ? []
      : (await selectFilteredAssetIds(supabase, brandId, rpcFilters, { ids: commentIds, limit }))
          .sort((a, b) => commentIds.indexOf(a) - commentIds.indexOf(b))
          .map((id) => ({ id, similarity: COMMENT_HIT_SIMILARITY, matchedOn: ['comment'] }));

  // Semantic and visual hits are interleaved by rank — their scores live on different
  // scales (text↔text vs text↔image), and appending visual after a full page of
  // semantic hits left untagged footage unreachable (measured: a clip at 0.16 visual
  // similarity missing from 48 results). Keyword and comment hits trail, merged by
  // score. An asset found twice keeps its first place and carries both reasons.
  const byId = new Map(semantic.map((match) => [match.id, match]));
  const merge = (hits: readonly RankedMatch[], into: RankedMatch[]) => {
    for (const hit of hits) {
      const existing = byId.get(hit.id);
      if (existing) {
        existing.similarity = Math.max(existing.similarity, hit.similarity);
        existing.matchedOn = [...new Set([...existing.matchedOn, ...hit.matchedOn])];
        continue;
      }
      const copy = { ...hit, matchedOn: [...hit.matchedOn] };
      byId.set(hit.id, copy);
      into.push(copy);
    }
  };
  const visualExtras: RankedMatch[] = [];
  merge(visual, visualExtras);
  const extras: RankedMatch[] = [];
  merge([...lexical, ...commentHits], extras);
  extras.sort((a, b) => b.similarity - a.similarity);
  const matches = [...interleaveByRank(semantic, visualExtras), ...extras].slice(0, limit);

  // Visual hits are meaning-matched too, so they count as semantic for the
  // "this media hasn't been analyzed" hint.
  const meaningHits = semantic.length + visualExtras.length;
  const strategy: SearchStrategy =
    meaningHits > 0 ? (extras.length > 0 ? 'hybrid' : 'semantic') : 'lexical';
  return { matches, strategy };
}

/** Adds best-frame hits to the visual list, one entry per asset at its best score. */
function mergeBestVisual(visual: RankedMatch[], frameHits: readonly MatchAssetRow[]): void {
  for (const hit of frameHits) {
    const existing = visual.find((match) => match.id === hit.id);
    if (existing) existing.similarity = Math.max(existing.similarity, hit.similarity);
    else visual.push({ id: hit.id, similarity: hit.similarity, matchedOn: ['visual'] });
  }
  visual.sort((a, b) => b.similarity - a.similarity);
  visual.splice(VISUAL_MATCH_CAP);
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

  // Format groups, ranges, technical predicates and custom-field ranges are the browse's own
  // SQL predicates: media.library_matching_asset_ids answers them to an id list, intersected
  // with any field-filter set above, and the ranking RPCs rank inside it.
  const filters = req.filters;
  if (
    (filters?.families?.length ?? 0) > 0 ||
    filters?.ranges ||
    filters?.technical ||
    (filters?.fieldRanges?.length ?? 0) > 0
  ) {
    const { data, error } = await mediaSchema(supabase).rpc('library_matching_asset_ids', {
      p_brand_id: req.brandId,
      p_query: {
        ...(filters?.families?.length ? { families: filters.families } : {}),
        ...(filters?.ranges ? { ranges: filters.ranges } : {}),
        ...(filters?.technical ? { technical: filters.technical } : {}),
        ...(filters?.fieldRanges?.length ? { fieldRanges: filters.fieldRanges } : {}),
      },
      p_limit: DATE_RANGE_ID_CAP,
    });
    if (error) {
      console.error('[library/search] technical filter resolution failed', error);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
    const matched = ((data ?? []) as { asset_id: string }[]).map((row) => row.asset_id);
    const within = rpcFilters.filter_asset_ids ? new Set(rpcFilters.filter_asset_ids) : null;
    const excluded = new Set(rpcFilters.filter_exclude_asset_ids ?? []);
    rpcFilters.filter_asset_ids = matched.filter(
      (id) => (!within || within.has(id)) && !excluded.has(id),
    );
  }

  // A created-at window is resolved to ids the same way, so the ranking RPCs
  // need no new args. It intersects with any field-filter id set because the
  // select below already applies filter_asset_ids / filter_exclude_asset_ids.
  // A review choice wider than one status (several statuses, or any custom state) rides the
  // same id resolution, OR'd inside itself — no new ranking-RPC argument.
  const createdAfter = req.filters?.createdAfter;
  const createdBefore = req.filters?.createdBefore;
  const reviewOr = searchReviewFilter(req.filters).orFilter;
  if (createdAfter || createdBefore || reviewOr) {
    try {
      rpcFilters.filter_asset_ids = await selectFilteredAssetIds(
        supabase,
        req.brandId,
        rpcFilters,
        {
          createdAfter,
          createdBefore,
          reviewOr,
          limit: DATE_RANGE_ID_CAP,
        },
      );
    } catch (err) {
      console.error('[library/search] date range resolution failed', err);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }
  }

  // Read/rank with the user-scoped client: media.assets RLS (has_brand_access)
  // scopes rows to the caller's brands, and authenticated holds EXECUTE on the
  // ranking RPCs — so no service-role bypass is needed.
  try {
    if (req.mode === 'text') {
      const { matches, strategy } = req.query
        ? await runTextSearch(supabase, {
            brandId: req.brandId,
            query: req.query,
            limit: req.limit,
            threshold: req.threshold,
            rpcFilters,
            visualEmbedding: req.visualEmbedding,
          })
        : {
            matches: (
              await selectFilteredAssetIds(supabase, req.brandId, rpcFilters, { limit: req.limit })
            ).map((id): RankedMatch => ({ id, similarity: 1, matchedOn: ['filters'] })),
            strategy: 'filters' as const,
          };

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
      items: await hydrateMatches(
        supabase,
        ((matchRows ?? []) as MatchAssetRow[]).map((match) => ({
          id: match.id,
          similarity: match.similarity,
          matchedOn: [],
        })),
      ),
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
