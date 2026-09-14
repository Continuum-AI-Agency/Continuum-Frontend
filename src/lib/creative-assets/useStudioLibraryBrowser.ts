'use client';

import type {
  LibraryBrowseDestination,
  MediaAsset,
  MediaSearchFilters,
  MediaSearchResultItem,
} from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildLibraryBrowseParams,
  type KindFilterValue,
  kindToMediaType,
  type SourceFilterValue,
  toContractKind,
  toContractSource,
} from '@/lib/media/filters';

const PAGE_SIZE = 36;
const SEARCH_DEBOUNCE_MS = 400;

export const STUDIO_LIBRARY_DESTINATIONS: {
  value: LibraryBrowseDestination;
  label: string;
}[] = [
  { value: 'home', label: 'Home' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'elements', label: 'Elements' },
  { value: 'sources', label: 'Sources' },
];

export type StudioLibraryFilters = {
  source: SourceFilterValue;
  kind: KindFilterValue;
  destination: LibraryBrowseDestination;
};

/** Same destination mapping the Library sidebar uses, so Studio Home is not Sources. */
export function buildStudioLibraryBrowseParams(
  brandId: string,
  filters: StudioLibraryFilters,
  cursor: string | null,
  limit = PAGE_SIZE,
): URLSearchParams | null {
  if (filters.destination === 'elements') return null;
  const kind = toContractKind(filters.kind);
  const source = toContractSource(filters.source);
  const destination = filters.destination;
  const mediaType = destination === 'sources' ? 'project_file' : kindToMediaType(kind ?? null);
  const createdWith =
    destination === 'canvas' ? (source ? [source] : ['canvas']) : source ? [source] : [];
  return buildLibraryBrowseParams(
    {
      brandId,
      destination,
      mediaType,
      createdWith,
      placements: [],
      tags: [],
      reviewStatuses: [],
      ownerIds: [],
      campaignIds: [],
      projectIds: [],
      usageRights: [],
      leadingOnly: false,
      templateOnly: false,
      aspectRatios: [],
      ratios: [],
      fonts: [],
      search: '',
      sort: destination === 'home' ? 'updated_desc' : 'created_desc',
      performanceWindow: 'd30',
      layout: 'grid',
      boardGroupBy: 'review_status',
      limit,
      cursor,
    },
    { includeBrandId: true, cursor },
  );
}

export type UseStudioLibraryBrowserResult = {
  assets: MediaAsset[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  /** Re-reads the current filter/search from page one. Used after a write that
   *  adds assets (e.g. an Inspiration pull) so the grid shows them immediately. */
  refresh: () => void;
  query: string;
  setQuery: (value: string) => void;
  filters: StudioLibraryFilters;
  setFilters: (next: Partial<StudioLibraryFilters>) => void;
  // Non-null when the last request failed. The panel renders this distinctly
  // from an empty result so a server error never masquerades as "no assets".
  error: string | null;
};

// Browses the unified media library from inside the ai-studio sheet. Lists via
// GET /api/library/browse (the same RPC /library uses) and switches to POST
// /api/library/search (text mode) when a query is present. Destinations match
// the Library sidebar so Studio Home is not a dump of source files.
export function useStudioLibraryBrowser(
  brandId: string,
  options?: {
    /**
     * Where the browser STARTS, not where it is pinned — the user can still widen it from
     * the filter bar. A caller that only accepts one kind (a render slot typed `image`)
     * opens on that kind so the first screen cannot offer media the slot would refuse.
     */
    initialFilters?: Partial<StudioLibraryFilters>;
    /**
     * Whether to fetch at all. Default true, so every existing caller is unchanged.
     *
     * A caller that mounts this behind a closed surface passes the open state: a canvas
     * holding several pickers would otherwise list the whole Library once per picker on
     * load, for a panel nobody has opened.
     */
    enabled?: boolean;
  },
): UseStudioLibraryBrowserResult {
  const enabled = options?.enabled ?? true;
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQueryState] = useState('');
  const [filters, setFiltersState] = useState<StudioLibraryFilters>({
    source: options?.initialFilters?.source ?? 'all',
    kind: options?.initialFilters?.kind ?? 'all',
    destination: options?.initialFilters?.destination ?? 'home',
  });

  const cursorRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against stale async responses overwriting a newer request.
  const requestIdRef = useRef(0);

  const runListPage = useCallback(
    async (cursor: string | null) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const sp = buildStudioLibraryBrowseParams(brandId, filters, cursor);
        if (!sp) {
          setAssets([]);
          setHasMore(false);
          setError(null);
          return;
        }
        const resp = await fetch(`/api/library/browse?${sp.toString()}`);
        if (!resp.ok) {
          throw new Error(`Library request failed (${resp.status})`);
        }
        const data = (await resp.json()) as {
          items?: MediaAsset[];
          nextCursor?: string | null;
        };
        if (requestId !== requestIdRef.current) return;
        setError(null);
        const incoming = data.items ?? [];
        setAssets((prev) => {
          if (!cursor) return incoming;
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...incoming.filter((a) => !seen.has(a.id))];
        });
        cursorRef.current = data.nextCursor ?? null;
        setHasMore(Boolean(data.nextCursor));
      } catch (err) {
        if (requestId === requestIdRef.current) {
          console.error('[useStudioLibraryBrowser] list failed', err);
          setError("Couldn't load the library. Please try again.");
          setHasMore(false);
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [brandId, filters.source, filters.kind, filters.destination],
  );

  const runSearch = useCallback(
    async (q: string) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const searchFilters: MediaSearchFilters = {};
        const source = toContractSource(filters.source);
        const kind = toContractKind(filters.kind);
        if (source) searchFilters.source = source;
        if (kind) searchFilters.kind = kind;
        const resp = await fetch('/api/library/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            mode: 'text',
            query: q,
            limit: 48,
            ...(Object.keys(searchFilters).length > 0 ? { filters: searchFilters } : {}),
          }),
        });
        if (!resp.ok) {
          throw new Error(`Library search failed (${resp.status})`);
        }
        const data = (await resp.json()) as { items?: MediaSearchResultItem[] };
        if (requestId !== requestIdRef.current) return;
        setError(null);
        setAssets((data.items ?? []).map((item) => item.asset));
        setHasMore(false);
      } catch (err) {
        if (requestId === requestIdRef.current) {
          console.error('[useStudioLibraryBrowser] search failed', err);
          setError("Couldn't search the library. Please try again.");
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [brandId, filters.source, filters.kind, filters.destination],
  );

  // Re-run whenever brand, filters, or the (debounced) query changes.
  useEffect(() => {
    if (!brandId || !enabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      cursorRef.current = null;
      void runListPage(null);
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(trimmed), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // `enabled` is a dependency, not just a guard: a gated caller flips it on when its
    // surface opens, and that transition IS the trigger for the first list.
  }, [brandId, enabled, query, runListPage, runSearch]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore || query.trim()) return;
    void runListPage(cursorRef.current);
  }, [loading, hasMore, query, runListPage]);

  const refresh = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed) {
      void runSearch(trimmed);
      return;
    }
    cursorRef.current = null;
    void runListPage(null);
  }, [query, runListPage, runSearch]);

  const setQuery = useCallback((value: string) => setQueryState(value), []);
  const setFilters = useCallback(
    (next: Partial<StudioLibraryFilters>) => setFiltersState((prev) => ({ ...prev, ...next })),
    [],
  );

  return {
    assets,
    loading,
    hasMore,
    loadMore,
    refresh,
    query,
    setQuery,
    filters,
    setFilters,
    error,
  };
}
