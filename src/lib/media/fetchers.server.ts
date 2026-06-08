import "server-only";

import type { MediaAsset, MediaCollection, MediaKind, MediaSource } from "@continuum/contracts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mediaSchema } from "./supabase-media";
import { rowToMediaAsset } from "./mapper";
import { mintSignedUrls } from "./signed-urls";
import { MEDIA_ASSET_SELECT, type MediaAssetRow, type MediaCollectionRow } from "./schema";

const PAGE_SIZE = 48;

export async function fetchMediaAssets(
  brandId: string,
  options: { collectionId?: string; limit?: number; source?: MediaSource; kind?: MediaKind } = {},
): Promise<MediaAsset[]> {
  const client = await createSupabaseServerClient();
  const limit = options.limit ?? PAGE_SIZE;

  let query = mediaSchema(client)
    .from("assets")
    .select(MEDIA_ASSET_SELECT)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.collectionId) {
    // Join via collection_items to filter by collection
    const { data: items, error: itemsError } = await mediaSchema(client)
      .from("collection_items")
      .select("asset_id")
      .eq("collection_id", options.collectionId)
      .order("position", { ascending: true });

    if (itemsError) {
      console.error("[media/fetchers] collection_items query failed", itemsError);
      return [];
    }

    const assetIds = (items ?? []).map((r: { asset_id: string }) => r.asset_id);
    if (assetIds.length === 0) return [];

    query = mediaSchema(client)
      .from("assets")
      .select(MEDIA_ASSET_SELECT)
      .in("id", assetIds)
      .is("deleted_at", null)
      .limit(limit);
  }

  if (options.source) query = query.eq("source", options.source);
  if (options.kind) query = query.eq("kind", options.kind);

  const { data, error } = await query;
  if (error) {
    console.error("[media/fetchers] assets query failed", error);
    return [];
  }

  const rows = (data ?? []) as unknown as MediaAssetRow[];
  const signedUrlMap = await mintSignedUrls(
    rows.map((r) => ({ path: r.storage_path, bucket: r.bucket })),
  );

  return rows.map((row) =>
    rowToMediaAsset(row, signedUrlMap.get(row.storage_path) ?? null),
  );
}

export async function fetchMediaCollections(
  brandId: string,
): Promise<MediaCollection[]> {
  const client = await createSupabaseServerClient();

  const { data, error } = await mediaSchema(client)
    .from("collections")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .returns<MediaCollectionRow[]>();

  if (error) {
    console.error("[media/fetchers] collections query failed", error);
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
    .from("assets")
    .select("size_bytes")
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .returns<{ size_bytes: number | null }[]>();

  if (error) {
    console.error("[media/fetchers] storage usage query failed", error);
    return 0;
  }

  return (data ?? []).reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);
}
