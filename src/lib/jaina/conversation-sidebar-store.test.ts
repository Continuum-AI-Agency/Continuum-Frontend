import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { JainaConversationSession } from '@/lib/jaina/conversations';
import {
  JAINA_CONVERSATION_SIDEBAR_CACHE_TTL_MS,
  makeJainaConversationScopeKey,
  useJainaConversationSidebarStore,
} from './conversation-sidebar-store';

const scope = {
  brandProfileId: 'brand-1',
  adAccountId: 'act-1',
};

const originalDateNow = Date.now;
let nowMs = 0;

function makeSession(sessionId: string, lastMessageAt: string): JainaConversationSession {
  return {
    sessionId,
    brandId: scope.brandProfileId,
    adAccountId: scope.adAccountId,
    title: null,
    lastMessageRole: 'assistant',
    lastMessagePreview: 'hello',
    lastMessageAt,
    createdAt: '2026-05-05T10:00:00.000Z',
    updatedAt: '2026-05-05T10:00:00.000Z',
  };
}

describe('useJainaConversationSidebarStore', () => {
  beforeEach(() => {
    nowMs = 1_000;
    Date.now = () => nowMs;
    useJainaConversationSidebarStore.getState().clear();
  });

  afterEach(() => {
    Date.now = originalDateNow;
    useJainaConversationSidebarStore.getState().clear();
  });

  it('returns fresh sessions inside the 1 minute TTL', () => {
    const store = useJainaConversationSidebarStore.getState();
    const sessions = [makeSession('s-1', '2026-05-05T10:10:00.000Z')];

    store.setSessions(scope, sessions);
    nowMs += JAINA_CONVERSATION_SIDEBAR_CACHE_TTL_MS - 1;

    expect(store.getFreshSessions(scope)).toEqual(sessions);
  });

  it('returns null after TTL expires', () => {
    const store = useJainaConversationSidebarStore.getState();
    store.setSessions(scope, [makeSession('s-1', '2026-05-05T10:10:00.000Z')]);

    nowMs += JAINA_CONVERSATION_SIDEBAR_CACHE_TTL_MS;

    expect(store.getFreshSessions(scope)).toBeNull();
  });

  it('upserts and removes sessions for the current scope', () => {
    const store = useJainaConversationSidebarStore.getState();

    store.upsertSession(scope, makeSession('s-1', '2026-05-05T10:10:00.000Z'));
    store.upsertSession(scope, makeSession('s-2', '2026-05-05T10:20:00.000Z'));
    store.upsertSession(scope, makeSession('s-1', '2026-05-05T10:30:00.000Z'));

    const key = makeJainaConversationScopeKey(scope);
    expect(
      useJainaConversationSidebarStore
        .getState()
        .sessionsByScope[key]?.map((session) => session.sessionId),
    ).toEqual(['s-1', 's-2']);

    store.removeSession(scope, 's-2');
    expect(
      useJainaConversationSidebarStore
        .getState()
        .sessionsByScope[key]?.map((session) => session.sessionId),
    ).toEqual(['s-1']);
  });
});
