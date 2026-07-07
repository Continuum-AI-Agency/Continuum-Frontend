import 'server-only';

import type { MediaAsset, MediaCollection, MediaKind, MediaSource } from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildCarousel, carouselSignablePaths, EXCLUDE_CAROUSEL_SLIDES_FILTER } from './carousel';
import { rowToMediaAsset } from './mapper';
import { MEDIA_ASSET_SELECT, type MediaAssetRow, type MediaCollectionRow } from './schema';
import { mintSignedUrls } from './signed-urls';
import { resolveSmartQueryFilter } from './smart-collections';
import { mediaSchema } from './supabase-media';

const PAGE_SIZE = 48;

export async function fetchMediaAssets(
  brandId: string,
  options: { collectionId?: string; limit?: number; source?: MediaSource; kind?: MediaKind } = {},
): Promise<MediaAsset[]> {
  const client = await createSupabaseServerClient();
  const limit = options.limit ?? PAGE_SIZE;

  let effectiveSource = options.source;
  let effectiveKind = options.kind;

  let query = mediaSchema(client)
    .from('assets')
    .select(MEDIA_ASSET_SELECT)
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    // Hide non-cover carousel slides — the cover tile carries the whole group.
    .not('tags', 'cs', EXCLUDE_CAROUSEL_SLIDES_FILTER)
    .order('created_at', { ascending: false })
    .limit(limit);

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
    } else {
      // Manual collection: constrain by collection_items membership.
      const { data: items, error: itemsError } = await mediaSchema(client)
        .from('collection_items')
        .select('asset_id')
        .eq('collection_id', options.collectionId)
        .order('position', { ascending: true });

      if (itemsError) {
        console.error('[media/fetchers] collection_items query failed', itemsError);
        return [];
      }

      const assetIds = (items ?? []).map((r: { asset_id: string }) => r.asset_id);
      if (assetIds.length === 0) return [];

      query = mediaSchema(client)
        .from('assets')
        .select(MEDIA_ASSET_SELECT)
        .in('id', assetIds)
        .is('deleted_at', null)
        .limit(limit);
    }
  }

  if (effectiveSource) query = query.eq('source', effectiveSource);
  if (effectiveKind) query = query.eq('kind', effectiveKind);

  const { data, error } = await query;
  if (error) {
    console.error('[media/fetchers] assets query failed', error);
    return [];
  }

  const rows = (data ?? []) as unknown as MediaAssetRow[];
  const signedUrlMap = await mintSignedUrls([
    ...rows.map((r) => ({ path: r.storage_path, bucket: r.bucket })),
    ...carouselSignablePaths(rows),
  ]);

  return rows.map((row) => {
    const asset = rowToMediaAsset(row, signedUrlMap.get(row.storage_path) ?? null);
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
  const { data, error } = await mediaSchema(client)
    .from('assets')
    .select('size_bytes')
    .eq('brand_id', brandId)
    .is('deleted_at', null)
    .returns<{ size_bytes: number | null }[]>();

  if (error) {
    console.error('[media/fetchers] storage usage query failed', error);
    return 0;
  }

  return (data ?? []).reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);
}
