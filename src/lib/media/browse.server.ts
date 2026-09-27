import 'server-only';

import type {
  LibraryBrowseFacets,
  LibraryBrowsePage,
  LibraryBrowseQuery,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  browseNarrowingPredicate,
  type LibraryBrowseNarrowing,
  libraryBrowseRpcArgs,
  libraryBrowseSortArg,
  reviewPrefilterStatuses,
} from './browse-args';
import { buildCarousel, carouselSignablePaths } from './carousel';
import { rowToSignedMediaAsset } from './mapper';
import { buildAssetPreview, loadAssetRenditions, renditionSignablePaths } from './renditions';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from './schema';
import { assetSignablePaths, mintSignedUrls } from './signed-urls';
import { mediaSchema } from './supabase-media';

type BrowseRow = {
  asset_id: string;
  sort_time: string | null;
  sort_text: string | null;
  sort_number: number | string | null;
  usage_count: number;
  performance_score: number | string | null;
};

type FacetRow = {
  facet: 'media_type' | 'created_with' | 'placement' | 'tag' | 'review_status';
  value: string;
  result_count: number | string;
};

function decodeCursor(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    throw new Error('Invalid Library cursor');
  }
}

function encodeCursor(row: BrowseRow): string {
  return Buffer.from(
    JSON.stringify({
      id: row.asset_id,
      ...(row.sort_time ? { time: row.sort_time } : {}),
      ...(row.sort_text ? { text: row.sort_text } : {}),
      ...(row.sort_number !== null ? { number: String(row.sort_number) } : {}),
    }),
  ).toString('base64url');
}

export async function fetchLibraryBrowsePage(
  client: SupabaseClient,
  query: LibraryBrowseQuery,
): Promise<LibraryBrowsePage> {
  const { data, error } = await mediaSchema(client).rpc('library_browse_page', {
    ...libraryBrowseRpcArgs(query),
    p_sort: libraryBrowseSortArg(query),
    p_cursor: decodeCursor(query.cursor),
    p_limit: query.limit,
  });
  if (error) throw new Error(`Library browse failed: ${error.message}`);

  const ranked = (data ?? []) as unknown as BrowseRow[];
  const hasMore = ranked.length > query.limit;
  const pageRows = ranked.slice(0, query.limit);
  if (pageRows.length === 0) return { items: [], nextCursor: null };

  return {
    items: await hydrateBrowseItems(
      client,
      pageRows.map((row) => row.asset_id),
    ),
    nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]!) : null,
  };
}

async function hydrateBrowseItems(
  client: SupabaseClient,
  ids: string[],
): Promise<LibraryBrowsePage['items']> {
  if (ids.length === 0) return [];
  const { data: assets, error: assetsError } = await mediaSchema(client)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .in('id', ids);
  if (assetsError) throw new Error(`Library hydration failed: ${assetsError.message}`);
  const rows = (assets ?? []) as unknown as MediaAssetRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const renditions = await loadAssetRenditions(
    client,
    ordered.flatMap((row) => (row.head_version_id ? [row.head_version_id] : [])),
  );
  const signedUrlMap = await mintSignedUrls([
    ...assetSignablePaths(ordered),
    ...carouselSignablePaths(ordered),
    ...renditionSignablePaths(renditions),
  ]);
  const items = ordered.map((row) => {
    const preview = buildAssetPreview(row, renditions, signedUrlMap);
    const asset = rowToSignedMediaAsset(row, signedUrlMap, preview);
    const carousel = buildCarousel(row, signedUrlMap);
    return carousel ? { ...asset, carousel } : asset;
  });

  return items;
}

// ponytail: a bounded scan — a narrow custom state on a huge brand can return a short (even
// empty) page with a cursor; a review-state RPC argument would make it exact.
const NARROWED_SCAN_PAGE = 96;
const NARROWED_SCAN_ROUNDS = 8;

/**
 * A browse page with custom review states and/or custom-field filters on: the browse RPC
 * ranks with EVERY other filter, and the narrowing is applied to its rows, scanning ahead by
 * cursor until the page is full.
 */
export async function fetchNarrowedLibraryBrowsePage(
  client: SupabaseClient,
  query: LibraryBrowseQuery,
  narrowing: LibraryBrowseNarrowing,
): Promise<LibraryBrowsePage> {
  if (narrowing.fieldConstraint.kind === 'ids' && narrowing.fieldConstraint.ids.length === 0) {
    return { items: [], nextCursor: null };
  }
  let rpcQuery = query;
  if (narrowing.reviewStateIds.length > 0) {
    const { data, error } = await mediaSchema(client)
      .from('review_custom_states')
      .select('base_status')
      .eq('brand_id', query.brandId)
      .in('id', [...narrowing.reviewStateIds]);
    if (error) throw new Error(`Library review states failed: ${error.message}`);
    const bases = ((data ?? []) as Array<{ base_status: string }>).map((row) => row.base_status);
    rpcQuery = {
      ...query,
      reviewStatuses: reviewPrefilterStatuses(
        query.reviewStatuses,
        bases,
      ) as LibraryBrowseQuery['reviewStatuses'],
    };
  }
  const passes = browseNarrowingPredicate(query.reviewStatuses, narrowing);

  const matched: BrowseRow[] = [];
  let cursor = query.cursor ?? null;
  let exhausted = false;
  let lastScanned: BrowseRow | null = null;
  for (
    let round = 0;
    round < NARROWED_SCAN_ROUNDS && !exhausted && matched.length <= query.limit;
    round += 1
  ) {
    const { data, error } = await mediaSchema(client).rpc('library_browse_page', {
      ...libraryBrowseRpcArgs(rpcQuery),
      p_sort: libraryBrowseSortArg(query),
      p_cursor: decodeCursor(cursor),
      p_limit: NARROWED_SCAN_PAGE,
    });
    if (error) throw new Error(`Library browse failed: ${error.message}`);
    const ranked = (data ?? []) as unknown as BrowseRow[];
    exhausted = ranked.length <= NARROWED_SCAN_PAGE;
    const scan = ranked.slice(0, NARROWED_SCAN_PAGE);
    if (scan.length === 0) break;
    const { data: reviewRows, error: reviewError } = await mediaSchema(client)
      .from('assets')
      .select('id, review_status, review_state_id')
      .in(
        'id',
        scan.map((row) => row.asset_id),
      );
    if (reviewError) throw new Error(`Library narrowing failed: ${reviewError.message}`);
    const byId = new Map(
      (
        (reviewRows ?? []) as Array<{
          id: string;
          review_status: string | null;
          review_state_id: string | null;
        }>
      ).map((row) => [row.id, row]),
    );
    for (const row of scan) {
      lastScanned = row;
      const asset = byId.get(row.asset_id);
      if (asset && passes(asset)) matched.push(row);
      if (matched.length > query.limit) break;
    }
    cursor = encodeCursor(lastScanned!);
  }

  const page = matched.slice(0, query.limit);
  const full = matched.length > query.limit;
  const resumeFrom = full ? page[page.length - 1] : lastScanned;
  return {
    items: await hydrateBrowseItems(
      client,
      page.map((row) => row.asset_id),
    ),
    nextCursor: (full || !exhausted) && resumeFrom ? encodeCursor(resumeFrom) : null,
  };
}

export async function fetchLibraryBrowseFacets(
  client: SupabaseClient,
  query: LibraryBrowseQuery,
): Promise<LibraryBrowseFacets> {
  const { data, error } = await mediaSchema(client).rpc(
    'library_browse_facets',
    libraryBrowseRpcArgs(query),
  );
  if (error) throw new Error(`Library facets failed: ${error.message}`);

  const rows = (data ?? []) as unknown as FacetRow[];
  const values = (facet: FacetRow['facet']) =>
    rows
      .filter((row) => row.facet === facet)
      .map((row) => ({ value: row.value, count: Number(row.result_count) }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return {
    mediaTypes: values('media_type'),
    createdWith: values('created_with'),
    placements: values('placement'),
    tags: values('tag'),
    reviewStatuses: values('review_status'),
  };
}
