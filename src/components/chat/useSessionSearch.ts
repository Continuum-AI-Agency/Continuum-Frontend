'use client';

import type { AgentSessionListFilters } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_SESSION_FILTERS,
  isSessionFilterActive,
  type SessionFilterState,
  toSessionListFilters,
} from '@/lib/agents/session-filters';

// Server-side chat-history search for a conversation sidebar.
//
// While no facet is set the sidebar keeps rendering the list its parent already
// owns (unfiltered, live, with streaming markers). The moment a facet is set,
// this hook owns the visible list instead — filtering must happen in Postgres
// (trgm over title+preview, `tags @>` containment), never over the truncated
// page the sidebar happens to hold.

export type UseSessionSearchResult<TSession> = {
  filters: SessionFilterState;
  setFilters: (next: SessionFilterState) => void;
  clearFilters: () => void;
  /** True while any facet narrows the list — the caller renders `results` then. */
  isActive: boolean;
  isSearching: boolean;
  results: TSession[];
  error: string | null;
};

export function useSessionSearch<TSession>(params: {
  isEnabled: boolean;
  /** Must be referentially stable (useCallback) — it is an effect dependency. */
  fetchSessions: (filters: AgentSessionListFilters) => Promise<TSession[]>;
}): UseSessionSearchResult<TSession> {
  const { isEnabled, fetchSessions } = params;
  const [filters, setFilters] = useState<SessionFilterState>(EMPTY_SESSION_FILTERS);
  const [results, setResults] = useState<TSession[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id: a slower earlier query must never overwrite a newer one.
  const requestIdRef = useRef(0);

  const isActive = isSessionFilterActive(filters);

  useEffect(() => {
    if (!isEnabled || !isActive) {
      setResults([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    setError(null);

    void fetchSessions(toSessionListFilters(filters))
      .then((sessions) => {
        if (requestIdRef.current !== requestId) return;
        setResults(sessions);
      })
      .catch((cause: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setResults([]);
        setError(cause instanceof Error ? cause.message : 'Search failed.');
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setIsSearching(false);
      });
  }, [fetchSessions, filters, isActive, isEnabled]);

  const clearFilters = useCallback(() => setFilters(EMPTY_SESSION_FILTERS), []);

  return { filters, setFilters, clearFilters, isActive, isSearching, results, error };
}
