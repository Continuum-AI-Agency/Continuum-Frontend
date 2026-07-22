'use client';

import { create } from 'zustand';

import type { JainaConversationSession } from '@/lib/jaina/conversations';

export const JAINA_CONVERSATION_SIDEBAR_CACHE_TTL_MS = 60 * 1000;

type ConversationScope = {
  brandProfileId: string;
  adAccountId: string;
};

type JainaConversationSidebarState = {
  sessionsByScope: Record<string, JainaConversationSession[]>;
  updatedAtByScope: Record<string, number>;
  getFreshSessions: (scope: ConversationScope) => JainaConversationSession[] | null;
  setSessions: (scope: ConversationScope, sessions: JainaConversationSession[]) => void;
  upsertSession: (scope: ConversationScope, session: JainaConversationSession) => void;
  removeSession: (scope: ConversationScope, sessionId: string) => void;
  invalidateScope: (scope: ConversationScope) => void;
  clear: () => void;
};

export function makeJainaConversationScopeKey(scope: ConversationScope): string {
  return `${scope.brandProfileId}:${scope.adAccountId}`;
}

function sortConversationSessions(
  sessions: JainaConversationSession[],
): JainaConversationSession[] {
  const sorted = [...sessions];
  sorted.sort((a, b) => {
    const aLast = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bLast = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (aLast !== bLast) return bLast - aLast;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return sorted;
}

function isFresh(updatedAt: number | undefined): boolean {
  return (
    typeof updatedAt === 'number' &&
    Date.now() - updatedAt < JAINA_CONVERSATION_SIDEBAR_CACHE_TTL_MS
  );
}

export const useJainaConversationSidebarStore = create<JainaConversationSidebarState>(
  (set, get) => ({
    sessionsByScope: {},
    updatedAtByScope: {},

    getFreshSessions: (scope) => {
      const key = makeJainaConversationScopeKey(scope);
      const updatedAt = get().updatedAtByScope[key];
      if (!isFresh(updatedAt)) {
        return null;
      }
      return get().sessionsByScope[key] ?? null;
    },

    setSessions: (scope, sessions) => {
      const key = makeJainaConversationScopeKey(scope);
      set((state) => ({
        sessionsByScope: {
          ...state.sessionsByScope,
          [key]: sortConversationSessions(sessions),
        },
        updatedAtByScope: {
          ...state.updatedAtByScope,
          [key]: Date.now(),
        },
      }));
    },

    upsertSession: (scope, session) => {
      const key = makeJainaConversationScopeKey(scope);
      const sessions = get().sessionsByScope[key] ?? [];
      const existingIndex = sessions.findIndex((item) => item.sessionId === session.sessionId);
      const nextSessions =
        existingIndex === -1
          ? [session, ...sessions]
          : sessions.map((item, index) => (index === existingIndex ? session : item));
      get().setSessions(scope, nextSessions);
    },

    removeSession: (scope, sessionId) => {
      const key = makeJainaConversationScopeKey(scope);
      const sessions = get().sessionsByScope[key] ?? [];
      const nextSessions = sessions.filter((session) => session.sessionId !== sessionId);
      get().setSessions(scope, nextSessions);
    },

    invalidateScope: (scope) => {
      const key = makeJainaConversationScopeKey(scope);
      set((state) => ({
        updatedAtByScope: {
          ...state.updatedAtByScope,
          [key]: 0,
        },
      }));
    },

    clear: () => {
      set({
        sessionsByScope: {},
        updatedAtByScope: {},
      });
    },
  }),
);
