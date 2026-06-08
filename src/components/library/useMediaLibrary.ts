"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaAsset, MediaKind, MediaSource } from "@continuum/contracts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildLibraryQuery } from "@/lib/media/filters";
import type { MediaAssetRow } from "@/lib/media/schema";

const PAGE_SIZE = 48;

// Lightweight Realtime-only mapper — signedUrl comes from SSR seed; Realtime
// updates only carry status/progress changes so we merge rather than replace.
function rowToPartial(row: MediaAssetRow): Partial<MediaAsset> & { id: string } {
  return {
    id: row.id,
    status: row.status,
    title: row.title ?? undefined,
    description: row.description ?? undefined,
    tags: row.tags ?? [],
    updatedAt: row.updated_at,
  };
}

function rowToStub(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    brandId: row.brand_id,
    createdBy: row.created_by,
    kind: row.kind,
    bucket: row.bucket,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    source: row.source,
    originRef: row.origin_ref,
    status: row.status,
    title: row.title,
    description: row.description,
    tags: row.tags ?? [],
    detectedObjects: [],
    adCreativeAnalysis: null,
    embeddingModel: row.embedding_model,
    hasImageEmbedding: row.has_image_embedding ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedUrl: null,
    thumbnailUrl: null,
  };
}

export type UseMediaLibraryResult = {
  assets: MediaAsset[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
};

export function useMediaLibrary(params: {
  brandId: string;
  collectionId: string | null;
  source: MediaSource | null;
  kind: MediaKind | null;
  seed: MediaAsset[];
}): UseMediaLibraryResult {
  const { brandId, collectionId, source, kind, seed } = params;
  const [assets, setAssets] = useState<MediaAsset[]>(seed);
  const [hasMore, setHasMore] = useState(seed.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(seed.length);

  // Re-seed when the SSR payload changes (e.g. collection navigation).
  useEffect(() => {
    setAssets(seed);
    setHasMore(seed.length >= PAGE_SIZE);
    offsetRef.current = seed.length;
  }, [seed]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const sp = buildLibraryQuery({
      brandId,
      collectionId,
      source,
      kind,
      offset: offsetRef.current,
      limit: PAGE_SIZE,
    });

    fetch(`/api/library/assets?${sp.toString()}`)
      .then((r) => r.json())
      .then((data: { items?: MediaAsset[]; nextOffset?: number | null }) => {
        const incoming = data.items ?? [];
        setAssets((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...incoming.filter((a) => !seen.has(a.id))];
        });
        offsetRef.current += incoming.length;
        setHasMore(data.nextOffset != null);
      })
      .catch((err: unknown) => {
        console.error("[useMediaLibrary] loadMore failed", err);
        setHasMore(false);
      })
      .finally(() => setLoadingMore(false));
  }, [brandId, collectionId, source, kind, hasMore, loadingMore]);

  // Fills a realtime-inserted asset's signed URL (INSERT payloads carry none).
  const hydrateSignedUrl = useCallback(
    async (assetId: string) => {
      try {
        const resp = await fetch("/api/library/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId, assetId }),
        });
        if (!resp.ok) return;
        const { signedUrl } = (await resp.json()) as { signedUrl?: string };
        if (!signedUrl) return;
        setAssets((prev) =>
          prev.map((a) => (a.id === assetId ? { ...a, signedUrl } : a)),
        );
      } catch (err) {
        console.error("[useMediaLibrary] sign failed", err);
      }
    },
    [brandId],
  );

  useEffect(() => {
    if (!brandId) return;
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel(`media-assets-${brandId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "media", table: "assets", filter: `brand_id=eq.${brandId}` },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            const partial = rowToPartial(payload.new as MediaAssetRow);
            setAssets((prev) => prev.map((a) => (a.id === partial.id ? { ...a, ...partial } : a)));
          } else if (payload.eventType === "INSERT") {
            // Only auto-surface inserts in the unfiltered "All Media" view; a
            // collection view shows only its members, which a raw insert is not.
            // Likewise respect active source/type chips so a filtered view never
            // gains a non-matching row.
            if (collectionId) return;
            const inserted = payload.new as MediaAssetRow;
            if (source && inserted.source !== source) return;
            if (kind && inserted.kind !== kind) return;
            setAssets((prev) => {
              if (prev.some((a) => a.id === inserted.id)) return prev;
              return [rowToStub(inserted), ...prev];
            });
            void hydrateSignedUrl(inserted.id);
          } else if (payload.eventType === "DELETE") {
            const removedId = (payload.old as { id?: string }).id;
            if (removedId) setAssets((prev) => prev.filter((a) => a.id !== removedId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandId, collectionId, source, kind, hydrateSignedUrl]);

  return useMemo(
    () => ({ assets, hasMore, loadingMore, loadMore }),
    [assets, hasMore, loadingMore, loadMore],
  );
}
