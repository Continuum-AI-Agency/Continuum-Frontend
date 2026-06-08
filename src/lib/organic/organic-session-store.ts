"use client";

import { create } from "zustand";
import type { OrganicSession } from "@/lib/organic/agent-sessions";

export const ORGANIC_SESSION_CACHE_TTL_MS = 60 * 1000;

type OrganicSessionStoreState = {
  sessionsByBrand: Record<string, OrganicSession[]>;
  updatedAtByBrand: Record<string, number>;
  getFreshSessions: (brandId: string) => OrganicSession[] | null;
  setSessions: (brandId: string, sessions: OrganicSession[]) => void;
  upsertSession: (brandId: string, session: OrganicSession) => void;
  invalidate: (brandId: string) => void;
  clear: () => void;
};

function isFresh(updatedAt: number | undefined): boolean {
  return (
    typeof updatedAt === "number" &&
    Date.now() - updatedAt < ORGANIC_SESSION_CACHE_TTL_MS
  );
}

export const useOrganicSessionStore = create<OrganicSessionStoreState>(
  (set, get) => ({
    sessionsByBrand: {},
    updatedAtByBrand: {},

    getFreshSessions: (brandId) => {
      if (!isFresh(get().updatedAtByBrand[brandId])) return null;
      return get().sessionsByBrand[brandId] ?? null;
    },

    setSessions: (brandId, sessions) => {
      set((state) => ({
        sessionsByBrand: { ...state.sessionsByBrand, [brandId]: sessions },
        updatedAtByBrand: { ...state.updatedAtByBrand, [brandId]: Date.now() },
      }));
    },

    upsertSession: (brandId, session) => {
      const sessions = get().sessionsByBrand[brandId] ?? [];
      const idx = sessions.findIndex((s) => s.sessionId === session.sessionId);
      const next =
        idx === -1
          ? [session, ...sessions]
          : sessions.map((s, i) => (i === idx ? session : s));
      get().setSessions(brandId, next);
    },

    invalidate: (brandId) => {
      set((state) => ({
        updatedAtByBrand: { ...state.updatedAtByBrand, [brandId]: 0 },
      }));
    },

    clear: () => set({ sessionsByBrand: {}, updatedAtByBrand: {} }),
  })
);
