import 'server-only';

import type {
  LibraryBrowseFacets,
  LibraryBrowsePage,
  LibraryBrowseQuery,
} from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { libraryBrowseRpcArgs } from './browse-args';
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
    p_sort: query.sort,
    p_cursor: decodeCursor(query.cursor),
    p_limit: query.limit,
  });
  if (error) throw new Error(`Library browse failed: ${error.message}`);

  const ranked = (data ?? []) as unknown as BrowseRow[];
  const hasMore = ranked.length > query.limit;
  const pageRows = ranked.slice(0, query.limit);
  if (pageRows.length === 0) return { items: [], nextCursor: null };

  const ids = pageRows.map((row) => row.asset_id);
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

  return {
    items,
    nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]!) : null,
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
