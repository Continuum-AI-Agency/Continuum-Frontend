import 'server-only';

import type {
  CustomFieldFilter,
  LibrarySort,
  MediaAsset,
  MediaCollection,
  MediaKind,
  MediaSource,
} from '@continuum/contracts';
import { DEFAULT_LIBRARY_SORT } from '@continuum/contracts';
import { resolveFieldFilterAssetIds } from '@/lib/library/customFields.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildCarousel, carouselSignablePaths, EXCLUDE_CAROUSEL_SLIDES_FILTER } from './carousel';
import { getLibrarySortOrder, kindMatchOrFilter, paginateByMembership } from './filters';
import { rowToSignedMediaAsset } from './mapper';
import { buildAssetPreview, loadAssetRenditions, renditionSignablePaths } from './renditions';
import { MEDIA_ASSET_SELECT, type MediaAssetRow, type MediaCollectionRow } from './schema';
import { assetSignablePaths, mintSignedUrls } from './signed-urls';
import { resolveSmartQueryFilter } from './smart-collections';
import { sumActiveMediaAssetBytes } from './storage-usage';
import { mediaSchema } from './supabase-media';

const PAGE_SIZE = 48;

// Page 0 of the library grid (the RSC seed). Filter semantics, ordering, and
// offset math MUST stay identical to GET /api/library/assets (page N>0) — the
// useMediaLibrary loadMore seam counts returned rows to continue from here.
export async function fetchMediaAssets(
  brandId: string,
  options: {
    assetId?: string;
    collectionId?: string;
    limit?: number;
    source?: MediaSource;
    kind?: MediaKind;
    tags?: readonly string[];
    sort?: LibrarySort;
  } = {},
): Promise<MediaAsset[]> {
  const client = await createSupabaseServerClient();
  const limit = options.limit ?? PAGE_SIZE;

  let effectiveSource = options.source;
  let effectiveKind = options.kind;
  let assetIds: string[] | null = null;
  let smartFieldFilters: readonly CustomFieldFilter[] = [];

  if (options.collectionId) {
    const { data: collection, error: collectionError } = await mediaSchema(client)
      .from('collections')
      .select('kind, smart_query')
      .eq('id', options.collectionId)
      .eq('brand_id', brandId)
      .maybeSingle();
    if (collectionError) {
      console.error('[media/fetchers] collection query failed', collectionError);
      return [];
    }
    const col = collection as { kind: string; smart_query: Record<string, unknown> | null } | null;

    if (col?.kind === 'smart') {
      // Smart collection: derive by filter, not membership.
      const smart = resolveSmartQueryFilter(col.smart_query);
      effectiveSource = smart.source ?? options.source;
      effectiveKind = smart.kind ?? options.kind;
      // A saved field filter must bite on page 0 too. Resolving it only in the
      // API route (page N>0) would render an unfiltered first page and then
      // filter every page after it — the grid would show assets that the
      // collection, by its own definition, excludes.
      smartFieldFilters = smart.fieldFilters ?? [];
    } else {
      // Manual collection: constrain by collection_items membership,
      // position-ordered (same ordering the API route paginates by).
      const { data: items, error: itemsError } = await mediaSchema(client)
        .from('collection_items')
        .select('asset_id')
        .eq('collection_id', options.collectionId)
        .order('position', { ascending: true });

      if (itemsError) {
        console.error('[media/fetchers] collection_items query failed', itemsError);
        return [];
      }

      assetIds = (items ?? []).map((r: { asset_id: string }) => r.asset_id);
      if (assetIds.length === 0) return [];
    }
  }

  // Hide non-cover carousel slides — the cover tile carries the whole group.
  let query = mediaSchema(client)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .not('tags', 'cs', EXCLUDE_CAROUSEL_SLIDES_FILTER);

  if (options.assetId) query = query.eq('id', options.assetId);
  if (effectiveSource) query = query.eq('source', effectiveSource);
  // Row kind OR a cover row's slide kind — mixed carousels surface under both.
  if (effectiveKind) query = query.or(kindMatchOrFilter(effectiveKind));
  if (options.tags && options.tags.length > 0) query = query.contains('tags', options.tags);

  if (smartFieldFilters.length > 0) {
    try {
      const resolution = await resolveFieldFilterAssetIds(client, brandId, smartFieldFilters);
      if (resolution.kind === 'ids') {
        // An empty allowlist means nothing matched — say so, rather than letting
        // a `.in('id', [])` degrade into "no constraint" and show everything.
        if (resolution.ids.length === 0) return [];
        query = query.in('id', resolution.ids);
      } else if (resolution.kind === 'exclude' && resolution.ids.length > 0) {
        query = query.not('id', 'in', `(${resolution.ids.join(',')})`);
      }
    } catch (err) {
      // Fail CLOSED. A collection defined by a field filter must never fall back
      // to rendering the unfiltered library — showing assets the collection
      // excludes by definition is worse than showing an empty page.
      console.error('[media/fetchers] field filter resolution failed', err);
      return [];
    }
  }

  let rows: MediaAssetRow[];
  if (assetIds) {
    const { data, error } = await query.in('id', assetIds);
    if (error) {
      console.error('[media/fetchers] assets query failed', error);
      return [];
    }
    const members = (data ?? []) as unknown as MediaAssetRow[];
    rows = paginateByMembership(members, assetIds, 0, limit).page;
  } else {
    const order = getLibrarySortOrder(options.sort ?? DEFAULT_LIBRARY_SORT);
    const { data, error } = await query
      .order(order.column, { ascending: order.ascending })
      .order('id', { ascending: true })
      .limit(limit);
    if (error) {
      console.error('[media/fetchers] assets query failed', error);
      return [];
    }
    rows = (data ?? []) as unknown as MediaAssetRow[];
  }
  const renditions = await loadAssetRenditions(
    client,
    rows.flatMap((row) => (row.head_version_id ? [row.head_version_id] : [])),
  );
  const signedUrlMap = await mintSignedUrls([
    ...assetSignablePaths(rows),
    ...carouselSignablePaths(rows),
    ...renditionSignablePaths(renditions),
  ]);

  return rows.map((row) => {
    const preview = buildAssetPreview(row, renditions, signedUrlMap);
    const asset = rowToSignedMediaAsset(row, signedUrlMap, preview);
    const carousel = buildCarousel(row, signedUrlMap);
    return carousel ? { ...asset, carousel } : asset;
  });
}

export async function fetchMediaCollections(brandId: string): Promise<MediaCollection[]> {
  const client = await createSupabaseServerClient();

  const { data, error } = await mediaSchema(client)
    .from('collections')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .returns<MediaCollectionRow[]>();

  if (error) {
    console.error('[media/fetchers] collections query failed', error);
    return [];
  }

  return (data ?? []).map(
    (row): MediaCollection => ({
      id: row.id,
      brandId: row.brand_id,
      name: row.name,
      kind: row.kind,
      smartQuery: row.smart_query,
      coverAssetId: row.cover_asset_id,
      itemCount: 0,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );
}

export async function fetchStorageUsedBytes(brandId: string): Promise<number> {
  const client = await createSupabaseServerClient();
  try {
    return await sumActiveMediaAssetBytes(client, brandId);
  } catch (error) {
    console.error('[media/fetchers] storage usage query failed', error);
    return 0;
  }
}
