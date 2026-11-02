'use client';

import type { AgentSessionListFilters } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_SESSION_FILTERS,
  isSessionFilterActive,
  type SessionFilterState,
  toSessionListFilters,
} from '@/lib/agents/session-filters';
import { loadFailureWhy } from '@/lib/api/loadFailure';

// Server-side chat-history search for a conversation sidebar.
//
// While no facet is set the sidebar keeps rendering the list its parent already
// owns (unfiltered, live, with streaming markers). The moment a facet is set,
// this hook owns the visible list instead — filtering must happen in Postgres
// (trgm over title+preview, `tags @>` containment), never over the truncated
// page the sidebar happens to hold.

/** Why the last search failed, as the sidebar says it. */
export type SessionSearchFailure = {
  /** The bearer was refused (401): the session ended, and only signing in again helps. */
  sessionEnded: boolean;
  message: string;
};

export type UseSessionSearchResult<TSession> = {
  filters: SessionFilterState;
  setFilters: (next: SessionFilterState) => void;
  clearFilters: () => void;
  /** True while any facet narrows the list — the caller renders `results` then. */
  isActive: boolean;
  isSearching: boolean;
  results: TSession[];
  /** Set when the last search failed: `results` is then empty because nothing was read, not
   *  because nothing matched, and the sidebar must say which. */
  failure: SessionSearchFailure | null;
  /** Runs the current filter again. */
  retry: () => void;
};

/** A failed search in words. A 401 is an ended session, not an empty result. */
export function sessionSearchFailure(cause: unknown): SessionSearchFailure {
  const status =
    typeof cause === 'object' && cause !== null ? Reflect.get(cause, 'status') : undefined;
  if (status === 401) {
    return {
      sessionEnded: true,
      message: 'Your session ended — sign in again to see your conversations.',
    };
  }
  return {
    sessionEnded: false,
    message: `Couldn't search conversations — ${loadFailureWhy(cause) ?? 'it did not go through.'}`,
  };
}

export function useSessionSearch<TSession>(params: {
  isEnabled: boolean;
  /** Must be referentially stable (useCallback) — it is an effect dependency. */
  fetchSessions: (filters: AgentSessionListFilters) => Promise<TSession[]>;
}): UseSessionSearchResult<TSession> {
  const { isEnabled, fetchSessions } = params;
  const [filters, setFilters] = useState<SessionFilterState>(EMPTY_SESSION_FILTERS);
  const [results, setResults] = useState<TSession[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [failure, setFailure] = useState<SessionSearchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Monotonic request id: a slower earlier query must never overwrite a newer one.
  const requestIdRef = useRef(0);

  const isActive = isSessionFilterActive(filters);

  useEffect(() => {
    if (!isEnabled || !isActive) {
      setResults([]);
      setIsSearching(false);
      setFailure(null);
      return;
    }

    // Read so a Retry (a new attempt) runs this effect again with the same filters.
    void attempt;
    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    setFailure(null);

    void fetchSessions(toSessionListFilters(filters))
      .then((sessions) => {
        if (requestIdRef.current !== requestId) return;
        setResults(sessions);
      })
      .catch((cause: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setResults([]);
        setFailure(sessionSearchFailure(cause));
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setIsSearching(false);
      });
  }, [attempt, fetchSessions, filters, isActive, isEnabled]);

  const clearFilters = useCallback(() => setFilters(EMPTY_SESSION_FILTERS), []);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  return { filters, setFilters, clearFilters, isActive, isSearching, results, failure, retry };
}
