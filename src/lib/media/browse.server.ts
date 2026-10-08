import 'server-only';

import type {
  LibraryBrowseFacets,
  LibraryBrowsePage,
  LibraryBrowseQuery,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  decodeLibraryBrowseCursor,
  encodeLibraryBrowseCursor,
  libraryBrowseAssetsArgs,
  libraryBrowseFacetArgs,
} from './browse-args';
import { buildCarousel, carouselSignablePaths } from './carousel';
import { rowToSignedMediaAsset } from './mapper';
import { buildAssetPreview, loadAssetRenditions, renditionSignablePaths } from './renditions';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from './schema';
import { assetSignablePaths, mintSignedUrls } from './signed-urls';
import { mediaSchema } from './supabase-media';

type BrowseRow = { asset_id: string; sort_keys: unknown[] };

type FacetRow = {
  facet:
    | 'media_type'
    | 'created_with'
    | 'placement'
    | 'tag'
    | 'review_status'
    | 'review_state'
    | 'format';
  value: string;
  result_count: number | string;
};

/**
 * One page of the Library. Every filter — custom review states and custom-field filters and
 * ranges included — is a predicate inside media.library_browse_assets, so a page is full
 * whenever the brand has the rows (it used to scan ahead at most 8 × 96 rows for those).
 */
export async function fetchLibraryBrowsePage(
  client: SupabaseClient,
  query: LibraryBrowseQuery,
): Promise<LibraryBrowsePage> {
  const { data, error } = await mediaSchema(client).rpc(
    'library_browse_assets',
    libraryBrowseAssetsArgs(query, decodeLibraryBrowseCursor(query.cursor)),
  );
  if (error) throw new Error(`Library browse failed: ${error.message}`);

  const ranked = (data ?? []) as unknown as BrowseRow[];
  const hasMore = ranked.length > query.limit;
  const pageRows = ranked.slice(0, query.limit);
  if (pageRows.length === 0) return { items: [], nextCursor: null };
  const last = pageRows[pageRows.length - 1]!;

  return {
    items: await hydrateBrowseItems(
      client,
      pageRows.map((row) => row.asset_id),
    ),
    nextCursor: hasMore
      ? encodeLibraryBrowseCursor({ keys: last.sort_keys, id: last.asset_id })
      : null,
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

export async function fetchLibraryBrowseFacets(
  client: SupabaseClient,
  query: LibraryBrowseQuery,
): Promise<LibraryBrowseFacets> {
  const { data, error } = await mediaSchema(client).rpc(
    'library_browse_facet_counts',
    libraryBrowseFacetArgs(query),
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
    reviewStates: values('review_state'),
    families: values('format'),
  };
}
