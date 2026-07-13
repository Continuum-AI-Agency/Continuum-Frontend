'use client';

import {
  CAROUSEL_SLIDE_TAG,
  type CustomFieldFilter,
  type MediaAsset,
  type MediaKind,
  type MediaSource,
} from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseFieldFiltersParam, serializeFieldFilters } from '@/lib/library/customFields';
import { buildLibraryQuery, parseTagsParam } from '@/lib/media/filters';
import type { MediaAssetRow } from '@/lib/media/schema';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

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
    reviewStatus: row.review_status ?? 'none',
    checksum: row.checksum ?? null,
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
  tags?: readonly string[];
  fieldFilters?: readonly CustomFieldFilter[];
  seed: MediaAsset[];
}): UseMediaLibraryResult {
  const { brandId, collectionId, source, kind, seed } = params;
  // Stable identity keyed on content, so effect/callback deps don't churn when
  // the caller passes a fresh array of the same tags each render.
  const tagsKey = (params.tags ?? []).join(',');
  const activeTags = useMemo(() => parseTagsParam(tagsKey), [tagsKey]);
  // Same trick for the custom-field filters: the serialized param IS the key, and
  // parsing it back is what the listing route does with it anyway.
  const fieldFiltersKey = serializeFieldFilters(params.fieldFilters ?? []);
  const activeFieldFilters = useMemo(() => {
    const parsed = parseFieldFiltersParam(fieldFiltersKey);
    return parsed.ok ? parsed.filters : [];
  }, [fieldFiltersKey]);
  const [assets, setAssets] = useState<MediaAsset[]>(seed);
  const [hasMore, setHasMore] = useState(seed.length >= PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(seed.length);

  const buildQuery = useCallback(
    (offset: number) => {
      const sp = buildLibraryQuery({
        brandId,
        collectionId,
        source,
        kind,
        tags: activeTags,
        offset,
        limit: PAGE_SIZE,
      });
      if (activeFieldFilters.length > 0) {
        sp.set('fieldFilters', serializeFieldFilters(activeFieldFilters));
      }
      return sp.toString();
    },
    [brandId, collectionId, source, kind, activeTags, activeFieldFilters],
  );

  // Re-seed when the SSR payload changes (e.g. collection navigation). The RSC
  // seed is neither tag- nor field-aware, so with either filter active page 0
  // comes from the API instead of the seed.
  useEffect(() => {
    if (activeTags.length === 0 && activeFieldFilters.length === 0) {
      setAssets(seed);
      setHasMore(seed.length >= PAGE_SIZE);
      offsetRef.current = seed.length;
      return;
    }
    let cancelled = false;
    setLoadingMore(true);
    fetch(`/api/library/assets?${buildQuery(0)}`)
      .then((r) => r.json())
      .then((data: { items?: MediaAsset[]; nextOffset?: number | null }) => {
        if (cancelled) return;
        const incoming = data.items ?? [];
        setAssets(incoming);
        offsetRef.current = incoming.length;
        setHasMore(data.nextOffset != null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[useMediaLibrary] filtered page 0 failed', err);
        setAssets([]);
        setHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingMore(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seed, activeTags, activeFieldFilters, buildQuery]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    fetch(`/api/library/assets?${buildQuery(offsetRef.current)}`)
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
        console.error('[useMediaLibrary] loadMore failed', err);
        setHasMore(false);
      })
      .finally(() => setLoadingMore(false));
  }, [buildQuery, hasMore, loadingMore]);

  // Fills a realtime-inserted asset's signed URL (INSERT payloads carry none).
  const hydrateSignedUrl = useCallback(
    async (assetId: string) => {
      try {
        const resp = await fetch('/api/library/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandId, assetId }),
        });
        if (!resp.ok) return;
        const { signedUrl } = (await resp.json()) as { signedUrl?: string };
        if (!signedUrl) return;
        setAssets((prev) => prev.map((a) => (a.id === assetId ? { ...a, signedUrl } : a)));
      } catch (err) {
        console.error('[useMediaLibrary] sign failed', err);
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
        'postgres_changes',
        { event: '*', schema: 'media', table: 'assets', filter: `brand_id=eq.${brandId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const partial = rowToPartial(payload.new as MediaAssetRow);
            setAssets((prev) => prev.map((a) => (a.id === partial.id ? { ...a, ...partial } : a)));
          } else if (payload.eventType === 'INSERT') {
            // Only auto-surface inserts in the unfiltered "All Media" view; a
            // collection view shows only its members, which a raw insert is not.
            // Likewise respect active source/type/tag chips so a filtered view
            // never gains a non-matching row. A custom-field filter cannot be
            // answered from the asset row at all (the values live in their own
            // table, and a brand-new asset holds none), so an insert under one is
            // left to the next fetch rather than guessed at.
            if (collectionId || activeFieldFilters.length > 0) return;
            const inserted = payload.new as MediaAssetRow;
            const insertedTags = inserted.tags ?? [];
            // Carousel slide rows never render as grid tiles — the cover row
            // (which follows in the same batch) represents the group.
            if (insertedTags.includes(CAROUSEL_SLIDE_TAG)) return;
            if (source && inserted.source !== source) return;
            if (kind && inserted.kind !== kind) return;
            if (activeTags.length > 0 && !activeTags.every((t) => insertedTags.includes(t))) {
              return;
            }
            setAssets((prev) => {
              if (prev.some((a) => a.id === inserted.id)) return prev;
              return [rowToStub(inserted), ...prev];
            });
            void hydrateSignedUrl(inserted.id);
          } else if (payload.eventType === 'DELETE') {
            const removedId = (payload.old as { id?: string }).id;
            if (removedId) setAssets((prev) => prev.filter((a) => a.id !== removedId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandId, collectionId, source, kind, activeTags, activeFieldFilters, hydrateSignedUrl]);

  return useMemo(
    () => ({ assets, hasMore, loadingMore, loadMore }),
    [assets, hasMore, loadingMore, loadMore],
  );
}
