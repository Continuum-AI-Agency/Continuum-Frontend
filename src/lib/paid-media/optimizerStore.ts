'use client';

// Client-side cache + view state for the Paid Media Optimizer surface.
//
// The optimizer "graph data" (portfolios, per-portfolio performance reports, CPA
// series, angle matrix, renewals, logs, onboarding suggestions) is read-heavy and
// stable between mounts — switching sub-tabs or leaving and returning to the
// Optimization tab should NOT re-hit the RPC/edge each time. So a single Zustand
// store holds every read dataset keyed by its inputs, each stamped with a
// fetchedAt, and serves it for a 30-minute TTL. Fetches run through the same
// authenticated RPC/edge paths (no parallel data source) — the store only decides
// WHEN to re-fetch. React Query is retained solely for the write mutations; on
// success they mark the affected keys stale here so the next read refreshes.
//
// In-memory per session by design (no localStorage) — a full reload starts clean.

import * as React from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type OptimizerView = 'overview' | 'portfolios' | 'actions' | 'logs';

const TTL_MS = 30 * 60 * 1000;
// A read that neither resolves nor rejects (an unreachable backend that accepts
// the socket but never responds) would otherwise leave the surface on an infinite
// skeleton — bound every read so it fails cleanly instead.
const READ_TIMEOUT_MS = 8_000;
// After a failed read, treat the entry as "fresh" for this long so the effect
// does NOT hot-loop retrying, but DOES retry on the next render past the window
// (so a recovering backend is picked up without a manual refresh).
const ERROR_RETRY_MS = 15_000;

/** Reject if `promise` has not settled within `ms` — the backstop that keeps a
 *  hung request from pinning the UI on a skeleton. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('optimizer_read_timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type CacheEntry = {
  data: unknown;
  fetchedAt: number;
  loading: boolean;
  error: boolean;
};

type OptimizerStore = {
  entries: Record<string, CacheEntry>;
  view: OptimizerView;
  selectedPortfolioId: string | null;
  /** When set, the Portfolios sub-view opens that portfolio as a full-screen detail
   *  workspace (the hero timeline + drill-ins) instead of the inline card list. */
  detailPortfolioId: string | null;
  setView: (view: OptimizerView) => void;
  setSelectedPortfolioId: (id: string | null) => void;
  setDetailPortfolioId: (id: string | null) => void;
  beginFetch: (key: string) => void;
  resolveFetch: (key: string, data: unknown) => void;
  failFetch: (key: string) => void;
  /** Mark every entry whose key satisfies the predicate stale (forces a re-fetch
   *  on next read). Used by write mutations after they land. */
  markStale: (matches: (key: string) => boolean) => void;
};

export const useOptimizerStore = create<OptimizerStore>((set) => ({
  entries: {},
  view: 'overview',
  selectedPortfolioId: null,
  detailPortfolioId: null,
  setView: (view) => set({ view }),
  setSelectedPortfolioId: (selectedPortfolioId) => set({ selectedPortfolioId }),
  setDetailPortfolioId: (detailPortfolioId) => set({ detailPortfolioId }),
  beginFetch: (key) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: {
          data: state.entries[key]?.data,
          fetchedAt: state.entries[key]?.fetchedAt ?? 0,
          loading: true,
          error: false,
        },
      },
    })),
  resolveFetch: (key, data) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: { data, fetchedAt: Date.now(), loading: false, error: false },
      },
    })),
  failFetch: (key) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: {
          data: state.entries[key]?.data,
          // Stamp fetchedAt so an errored entry is briefly "fresh" (ERROR_RETRY_MS
          // window) — without this the effect would immediately re-fetch and
          // hot-loop, which is why reads used to swallow errors into empty.
          fetchedAt: Date.now(),
          loading: false,
          error: true,
        },
      },
    })),
  markStale: (matches) =>
    set((state) => {
      const next: Record<string, CacheEntry> = {};
      for (const [key, entry] of Object.entries(state.entries)) {
        next[key] = matches(key) ? { ...entry, fetchedAt: 0 } : entry;
      }
      return { entries: next };
    }),
}));

export type CachedRead<T> = {
  data: T;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

/** Cache-first read backed by the optimizer store with a 30-minute TTL. When the
 *  cached entry is fresh it is served without a network call; otherwise `fetcher`
 *  runs once and populates the store. `empty` is the fallback until first load. */
export function useCachedRead<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  empty: T,
): CachedRead<T> {
  const entry = useOptimizerStore((state) => (key ? state.entries[key] : undefined));
  const { beginFetch, resolveFetch, failFetch, markStale } = useOptimizerStore(
    useShallow((state) => ({
      beginFetch: state.beginFetch,
      resolveFetch: state.resolveFetch,
      failFetch: state.failFetch,
      markStale: state.markStale,
    })),
  );

  // Keep the latest fetcher without making it an effect dependency (inline
  // closures change identity every render and would thrash the effect).
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  // A successful entry is fresh for the full TTL; a FAILED one only for the short
  // error-retry window, so a recovering backend is picked up without a refresh.
  const staleAfter = entry?.error ? ERROR_RETRY_MS : TTL_MS;
  const isFresh = Boolean(entry && Date.now() - entry.fetchedAt < staleAfter);
  const isLoading = Boolean(key) && !isFresh && (entry?.loading ?? true);

  React.useEffect(() => {
    if (!key) return;
    // Decide from the CURRENT store state, NOT the render-time closure. beginFetch()
    // below flips entry.loading, which triggers a re-render; if `entry?.loading`
    // were an effect dependency the cleanup would fire and cancel this very fetch,
    // leaving the surface stuck loading forever. Read state fresh + re-run only on
    // fetchedAt/error changes (resolve or markStale), and do NOT cancel in-flight.
    const current = useOptimizerStore.getState().entries[key];
    const staleWindow = current?.error ? ERROR_RETRY_MS : TTL_MS;
    const fresh = current ? Date.now() - current.fetchedAt < staleWindow : false;
    if (fresh || current?.loading) return;
    beginFetch(key);
    withTimeout(fetcherRef.current(), READ_TIMEOUT_MS)
      .then((data) => resolveFetch(key, data))
      .catch(() => failFetch(key));
  }, [key, entry?.fetchedAt, entry?.error, beginFetch, resolveFetch, failFetch]);

  const refetch = React.useCallback(() => {
    if (key) markStale((candidate) => candidate === key);
  }, [key, markStale]);

  const data = (entry?.data as T | undefined) ?? empty;
  return { data, isLoading, isError: entry?.error ?? false, refetch };
}
