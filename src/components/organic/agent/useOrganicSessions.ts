"use client";

import { useState, useEffect, useCallback } from "react";
import {
  deleteOrganicSession,
  fetchOrganicSessions,
  fetchOrganicSessionMessages,
  type OrganicSession,
  type OrganicSessionMessage,
} from "@/lib/organic/agent-sessions";
import { useOrganicSessionStore } from "@/lib/organic/organic-session-store";

export function useOrganicSessions(
  brandId: string,
  userId: string | null
): {
  sessions: OrganicSession[];
  isLoadingSessions: boolean;
  isLoadingMessages: boolean;
  activeSessionId: string | null;
  startNewSession: () => string;
  selectSession: (id: string) => Promise<OrganicSessionMessage[]>;
  refreshSessions: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
} {
  const [sessions, setSessions] = useState<OrganicSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const cached = useOrganicSessionStore.getState().getFreshSessions(brandId);
    if (cached) {
      setSessions(cached);
      setActiveSessionId(cached[0]?.sessionId ?? crypto.randomUUID());
      setIsLoadingSessions(false);
      return;
    }

    setIsLoadingSessions(true);
    fetchOrganicSessions(brandId).then((fetched) => {
      if (cancelled) return;
      useOrganicSessionStore.getState().setSessions(brandId, fetched);
      setSessions(fetched);
      setActiveSessionId(fetched[0]?.sessionId ?? crypto.randomUUID());
      setIsLoadingSessions(false);
    });

    return () => {
      cancelled = true;
    };
  }, [brandId, userId]);

  const startNewSession = useCallback((): string => {
    const id = crypto.randomUUID();
    setActiveSessionId(id);
    return id;
  }, []);

  const selectSession = useCallback(
    async (sessionId: string): Promise<OrganicSessionMessage[]> => {
      setActiveSessionId(sessionId);
      setIsLoadingMessages(true);
      try {
        return await fetchOrganicSessionMessages(sessionId, brandId);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [brandId]
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
    [brandId]
  );

  return {
    sessions,
    isLoadingSessions,
    isLoadingMessages,
    activeSessionId,
    startNewSession,
    selectSession,
    refreshSessions,
    deleteSession,
  };
}
