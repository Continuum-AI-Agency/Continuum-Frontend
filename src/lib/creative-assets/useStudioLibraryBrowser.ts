"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MediaAsset,
  MediaSearchFilters,
  MediaSearchResultItem,
} from "@continuum/contracts";
import {
  buildLibraryQuery,
  toContractKind,
  toContractSource,
  type KindFilterValue,
  type SourceFilterValue,
} from "@/lib/media/filters";

const PAGE_SIZE = 36;
const SEARCH_DEBOUNCE_MS = 400;

export type StudioLibraryFilters = {
  source: SourceFilterValue;
  kind: KindFilterValue;
};

export type UseStudioLibraryBrowserResult = {
  assets: MediaAsset[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  query: string;
  setQuery: (value: string) => void;
  filters: StudioLibraryFilters;
  setFilters: (next: Partial<StudioLibraryFilters>) => void;
  // Non-null when the last request failed. The panel renders this distinctly
  // from an empty result so a server error never masquerades as "no assets".
  error: string | null;
};

// Browses the unified media library from inside the ai-studio sheet. Lists via
// GET /api/library/assets (paginated) and switches to POST /api/library/search
// (text mode) when a query is present. Both honor the source/type chips. The
// endpoints already return signed MediaAsset[], so there is no client mapping.
export function useStudioLibraryBrowser(brandId: string): UseStudioLibraryBrowserResult {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQueryState] = useState("");
  const [filters, setFiltersState] = useState<StudioLibraryFilters>({
    source: "all",
    kind: "all",
  });

  const offsetRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against stale async responses overwriting a newer request.
  const requestIdRef = useRef(0);

  const runListPage = useCallback(
    async (offset: number) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const sp = buildLibraryQuery({
          brandId,
          source: filters.source,
          kind: filters.kind,
          offset,
          limit: PAGE_SIZE,
        });
        const resp = await fetch(`/api/library/assets?${sp.toString()}`);
        if (!resp.ok) {
          throw new Error(`Library request failed (${resp.status})`);
        }
        const data = (await resp.json()) as {
          items?: MediaAsset[];
          nextOffset?: number | null;
        };
        if (requestId !== requestIdRef.current) return;
        setError(null);
        const incoming = data.items ?? [];
        setAssets((prev) => {
          if (offset === 0) return incoming;
          const seen = new Set(prev.map((a) => a.id));
          return [...prev, ...incoming.filter((a) => !seen.has(a.id))];
        });
        offsetRef.current = offset + incoming.length;
        setHasMore(data.nextOffset != null);
      } catch (err) {
        if (requestId === requestIdRef.current) {
          console.error("[useStudioLibraryBrowser] list failed", err);
          setError("Couldn't load the library. Please try again.");
          setHasMore(false);
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [brandId, filters.source, filters.kind],
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
        const resp = await fetch("/api/library/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId,
            mode: "text",
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
          console.error("[useStudioLibraryBrowser] search failed", err);
          setError("Couldn't search the library. Please try again.");
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [brandId, filters.source, filters.kind],
  );

  // Re-run whenever brand, filters, or the (debounced) query changes.
  useEffect(() => {
    if (!brandId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      offsetRef.current = 0;
      void runListPage(0);
      return;
    }
    debounceRef.current = setTimeout(() => void runSearch(trimmed), SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [brandId, query, runListPage, runSearch]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore || query.trim()) return;
    void runListPage(offsetRef.current);
  }, [loading, hasMore, query, runListPage]);

  const setQuery = useCallback((value: string) => setQueryState(value), []);
  const setFilters = useCallback(
    (next: Partial<StudioLibraryFilters>) =>
      setFiltersState((prev) => ({ ...prev, ...next })),
    [],
  );

  return { assets, loading, hasMore, loadMore, query, setQuery, filters, setFilters, error };
}
