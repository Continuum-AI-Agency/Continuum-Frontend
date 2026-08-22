'use client';

import {
  CAROUSEL_SLIDE_TAG,
  type CustomFieldFilter,
  type LibraryBrowsePage,
  type LibraryBrowseQuery,
  type MediaAsset,
} from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseFieldFiltersParam, serializeFieldFilters } from '@/lib/library/customFields';
import { buildLibraryBrowseParams, buildLibraryQuery, mediaTypeToKind } from '@/lib/media/filters';
import type { MediaAssetRow } from '@/lib/media/schema';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

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
    headVersionId: row.head_version_id ?? null,
    integrityState: row.integrity_state ?? 'unknown',
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
  query: LibraryBrowseQuery;
  fieldFilters?: readonly CustomFieldFilter[];
  seed: MediaAsset[];
  initialNextCursor: string | null;
}): UseMediaLibraryResult {
  const { query, seed, initialNextCursor } = params;
  const brandId = query.brandId;
  const queryKey = buildLibraryBrowseParams(query, {
    includeBrandId: true,
    cursor: null,
  }).toString();
  // Same trick for the custom-field filters: the serialized param IS the key, and
  // parsing it back is what the listing route does with it anyway.
  const fieldFiltersKey = serializeFieldFilters(params.fieldFilters ?? []);
  const activeFieldFilters = useMemo(() => {
    const parsed = parseFieldFiltersParam(fieldFiltersKey);
    return parsed.ok ? parsed.filters : [];
  }, [fieldFiltersKey]);
  const [assets, setAssets] = useState<MediaAsset[]>(seed);
  const [hasMore, setHasMore] = useState(initialNextCursor !== null);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<string | null>(initialNextCursor);
  const legacyOffsetRef = useRef(seed.length);

  const buildLegacyFieldQuery = useCallback(
    (offset: number) => {
      const legacySort = [
        'created_desc',
        'updated_desc',
        'name_asc',
        'name_desc',
        'size_desc',
        'duration_desc',
      ].includes(query.sort)
        ? query.sort
        : 'created_desc';
      const sp = buildLibraryQuery({
        brandId,
        collectionId: query.collectionId,
        source: query.createdWith[0],
        kind: mediaTypeToKind(query.mediaType),
        tags: query.tags,
        sort: legacySort,
        offset,
        limit: PAGE_SIZE,
      });
      if (activeFieldFilters.length > 0) {
        sp.set('fieldFilters', serializeFieldFilters(activeFieldFilters));
      }
      return sp.toString();
    },
    [brandId, query, activeFieldFilters],
  );

  const buildCursorQuery = useCallback(
    (cursor: string | null) =>
      buildLibraryBrowseParams(query, { includeBrandId: true, cursor }).toString(),
    [query],
  );

  // The RSC seed is canonical and facet-aware. Custom fields are still resolved
  // by the legacy route until they join the grouped browse read model.
  useEffect(() => {
    if (activeFieldFilters.length === 0) {
      setAssets(seed);
      cursorRef.current = initialNextCursor;
      setHasMore(initialNextCursor !== null);
      legacyOffsetRef.current = seed.length;
      return;
    }
    let cancelled = false;
    setLoadingMore(true);
    fetch(`/api/library/assets?${buildLegacyFieldQuery(0)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Library field query failed (${r.status})`);
        return r.json();
      })
      .then((data: { items?: MediaAsset[]; nextOffset?: number | null }) => {
        if (cancelled) return;
        const incoming = data.items ?? [];
        setAssets(incoming);
        legacyOffsetRef.current = incoming.length;
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
  }, [seed, initialNextCursor, queryKey, activeFieldFilters, buildLegacyFieldQuery]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const request =
      activeFieldFilters.length > 0
        ? fetch(`/api/library/assets?${buildLegacyFieldQuery(legacyOffsetRef.current)}`).then(
            async (response) => {
              if (!response.ok) throw new Error(`Library field query failed (${response.status})`);
              const page = (await response.json()) as {
                items?: MediaAsset[];
                nextOffset?: number | null;
              };
              return {
                items: page.items ?? [],
                nextCursor: page.nextOffset == null ? null : String(page.nextOffset),
              } satisfies LibraryBrowsePage;
            },
          )
        : fetch(`/api/library/browse?${buildCursorQuery(cursorRef.current)}`).then(
            async (response) => {
              if (!response.ok) throw new Error(`Library browse failed (${response.status})`);
              return (await response.json()) as LibraryBrowsePage;
            },
          );

    request
      .then((data) => {
        const incoming = data.items ?? [];
        setAssets((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...incoming.filter((a) => !seen.has(a.id))];
        });
        if (activeFieldFilters.length > 0) {
          legacyOffsetRef.current += incoming.length;
        } else {
          cursorRef.current = data.nextCursor;
        }
        setHasMore(data.nextCursor !== null);
      })
      .catch((err: unknown) => {
        console.error('[useMediaLibrary] loadMore failed', err);
        setHasMore(false);
      })
      .finally(() => setLoadingMore(false));
  }, [activeFieldFilters, buildCursorQuery, buildLegacyFieldQuery, hasMore, loadingMore]);

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

    const scoped = { schema: 'media', table: 'assets', filter: `brand_id=eq.${brandId}` } as const;

    return subscribeToPostgresChanges({
      label: `media-assets-${brandId}`,
      bindings: [
        {
          ...scoped,
          event: 'UPDATE',
          onRow: (row) => {
            const partial = rowToPartial(row as MediaAssetRow);
            setAssets((prev) => prev.map((a) => (a.id === partial.id ? { ...a, ...partial } : a)));
          },
        },
        {
          ...scoped,
          event: 'INSERT',
          onRow: (row) => {
            // Only auto-surface inserts in the unfiltered "All Media" view; a
            // collection view shows only its members, which a raw insert is not.
            // Likewise respect active source/type/tag chips so a filtered view
            // never gains a non-matching row. A custom-field filter cannot be
            // answered from the asset row at all (the values live in their own
            // table, and a brand-new asset holds none), so an insert under one is
            // left to the next fetch rather than guessed at.
            if (query.collectionId || activeFieldFilters.length > 0) return;
            if (query.sort !== 'created_desc') return;
            if (
              query.placements.length > 0 ||
              query.campaignIds.length > 0 ||
              query.usageRights.length > 0 ||
              query.used != null ||
              query.shared != null ||
              query.leadingOnly ||
              query.search
            ) {
              return;
            }
            const inserted = row as MediaAssetRow;
            const insertedTags = inserted.tags ?? [];
            // Carousel slide rows never render as grid tiles — the cover row
            // (which follows in the same batch) represents the group.
            if (insertedTags.includes(CAROUSEL_SLIDE_TAG)) return;
            if (query.createdWith.length > 0 && !query.createdWith.includes(inserted.source)) {
              return;
            }
            const kind = mediaTypeToKind(query.mediaType);
            if (kind && inserted.kind !== kind) return;
            if (query.mediaType === 'carousel') return;
            if (
              query.reviewStatuses.length > 0 &&
              !query.reviewStatuses.includes(inserted.review_status ?? 'none')
            ) {
              return;
            }
            if (query.tags.length > 0 && !query.tags.every((tag) => insertedTags.includes(tag))) {
              return;
            }
            setAssets((prev) => {
              if (prev.some((a) => a.id === inserted.id)) return prev;
              return [rowToStub(inserted), ...prev];
            });
            void hydrateSignedUrl(inserted.id);
          },
        },
        {
          ...scoped,
          event: 'DELETE',
          onRow: (row) => {
            const removedId = (row as { id?: string }).id;
            if (removedId) setAssets((prev) => prev.filter((a) => a.id !== removedId));
          },
        },
      ],
    });
  }, [brandId, queryKey, query, activeFieldFilters, hydrateSignedUrl]);

  return useMemo(
    () => ({ assets, hasMore, loadingMore, loadMore }),
    [assets, hasMore, loadingMore, loadMore],
  );
}
