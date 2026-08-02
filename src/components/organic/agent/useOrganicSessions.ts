'use client';

import type { AgentSessionListFilters } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteOrganicSession,
  fetchOrganicSessionMessagePage,
  fetchOrganicSessions,
  type OrganicMessagePage,
  type OrganicSession,
  updateOrganicSessionTags,
} from '@/lib/organic/agent-sessions';
import { useOrganicSessionStore } from '@/lib/organic/organic-session-store';

export function useOrganicSessions(
  brandId: string,
  userId: string | null,
  initialSessionId?: string | null,
): {
  sessions: OrganicSession[];
  isLoadingSessions: boolean;
  isLoadingMessages: boolean;
  activeSessionId: string | null;
  /**
   * True while the active id is one this hook MINTED and the server has never seen — the
   * cold-start fallback and every `startNewSession()`. The composer needs an id before the
   * first turn is sent, but fetching history for one that does not exist server-side returns
   * an empty page, and callers that treat an empty page as authoritative wipe the transcript.
   */
  activeSessionIsNew: boolean;
  startNewSession: () => string;
  selectSession: (id: string) => Promise<OrganicMessagePage>;
  refreshSessions: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  searchSessions: (filters: AgentSessionListFilters) => Promise<OrganicSession[]>;
  updateSessionTags: (id: string, tags: string[]) => Promise<string[]>;
} {
  const [sessions, setSessions] = useState<OrganicSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionIsNew, setActiveSessionIsNew] = useState(false);
  const deepLinkSessionIdRef = useRef(initialSessionId ?? null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // Deep link (?sessionId=) wins over "most recent" exactly once, on first load.
    const deepLinkSessionId = deepLinkSessionIdRef.current;
    deepLinkSessionIdRef.current = null;

    // A brand with no conversations still needs an id for the composer, so one is minted —
    // and flagged, because it names nothing on the server.
    const adopt = (persistedSessionId: string | undefined) => {
      const resolved = deepLinkSessionId ?? persistedSessionId;
      setActiveSessionIsNew(!resolved);
      setActiveSessionId(resolved ?? crypto.randomUUID());
      setIsLoadingSessions(false);
    };

    const cached = useOrganicSessionStore.getState().getFreshSessions(brandId);
    if (cached) {
      setSessions(cached);
      adopt(cached[0]?.sessionId);
      return;
    }

    setIsLoadingSessions(true);
    fetchOrganicSessions(brandId).then((fetched) => {
      if (cancelled) return;
      useOrganicSessionStore.getState().setSessions(brandId, fetched);
      setSessions(fetched);
      adopt(fetched[0]?.sessionId);
    });

    return () => {
      cancelled = true;
    };
  }, [brandId, userId]);

  const startNewSession = useCallback((): string => {
    const id = crypto.randomUUID();
    setActiveSessionId(id);
    setActiveSessionIsNew(true);
    return id;
  }, []);

  const selectSession = useCallback(
    async (sessionId: string): Promise<OrganicMessagePage> => {
      setActiveSessionId(sessionId);
      // Cleared with the id rather than on resolve: callers switch on this flag in the same
      // render pass, and a flag that lagged the id by one render would make them treat a
      // persisted conversation as brand new and skip restoring it.
      setActiveSessionIsNew(false);
      setIsLoadingMessages(true);
      try {
        return await fetchOrganicSessionMessagePage(sessionId, brandId);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [brandId],
  );

  const refreshSessions = useCallback(async (): Promise<void> => {
    const fetched = await fetchOrganicSessions(brandId);
    useOrganicSessionStore.getState().setSessions(brandId, fetched);
    setSessions(fetched);
  }, [brandId]);

  // Hard-deletes the conversation and drops it from the list + store. The caller
  // (panel) owns active-session reassignment so it can reset the transcript when
  // the deleted session was the open one.
  const deleteSession = useCallback(
    async (sessionId: string): Promise<void> => {
      await deleteOrganicSession(sessionId, brandId);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.sessionId !== sessionId);
        useOrganicSessionStore.getState().setSessions(brandId, remaining);
        return remaining;
      });
    },
    [brandId],
  );

  // Search results are deliberately NOT written to the session store: the store
  // caches the brand's full list, and seeding it with a filtered page would make
  // the unfiltered sidebar look empty on the next mount.
  const searchSessions = useCallback(
    (filters: AgentSessionListFilters): Promise<OrganicSession[]> =>
      fetchOrganicSessions(brandId, filters),
    [brandId],
  );

  const updateSessionTags = useCallback(
    async (sessionId: string, tags: string[]): Promise<string[]> => {
      const stored = await updateOrganicSessionTags(sessionId, brandId, tags);
      setSessions((previous) => {
        const next = previous.map((session) =>
          session.sessionId === sessionId ? { ...session, tags: stored } : session,
        );
        useOrganicSessionStore.getState().setSessions(brandId, next);
        return next;
      });
      return stored;
    },
    [brandId],
  );

  return {
    sessions,
    isLoadingSessions,
    isLoadingMessages,
    activeSessionId,
    activeSessionIsNew,
    startNewSession,
    selectSession,
    refreshSessions,
    deleteSession,
    searchSessions,
    updateSessionTags,
  };
}
