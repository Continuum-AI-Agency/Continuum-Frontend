"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchOrganicSessions,
  fetchOrganicSessionMessages,
  OrganicSession,
  OrganicSessionMessage,
} from "@/lib/organic/agent-sessions";

export function useOrganicSessions(brandId: string): {
  sessions: OrganicSession[];
  isLoadingSessions: boolean;
  isLoadingMessages: boolean;
  activeSessionId: string | null;
  startNewSession: () => string;
  selectSession: (id: string) => Promise<OrganicSessionMessage[]>;
  refreshSessions: () => Promise<void>;
} {
  const [sessions, setSessions] = useState<OrganicSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSessions(true);
    fetchOrganicSessions(brandId).then((fetched) => {
      if (cancelled) return;
      setSessions(fetched);
      if (fetched.length > 0) {
        setActiveSessionId(fetched[0].sessionId);
      } else {
        setActiveSessionId(crypto.randomUUID());
      }
      setIsLoadingSessions(false);
    });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

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
        const msgs = await fetchOrganicSessionMessages(sessionId, brandId);
        return msgs;
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [brandId]
  );

  const refreshSessions = useCallback(async (): Promise<void> => {
    const fetched = await fetchOrganicSessions(brandId);
    setSessions(fetched);
  }, [brandId]);

  return {
    sessions,
    isLoadingSessions,
    isLoadingMessages,
    activeSessionId,
    startNewSession,
    selectSession,
    refreshSessions,
  };
}
