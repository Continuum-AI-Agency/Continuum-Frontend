import { beforeEach, describe, expect, it, mock } from 'bun:test';

// agent-sessions imports `{ request }` from @/lib/api/http; mock it so we can
// drive the exact wire payload the Backend conversation store emits.
const requestMock = mock(async (_options: Record<string, unknown>): Promise<unknown> => ({}));

mock.module('@/lib/api/http', () => ({
  request: requestMock,
  http: { request: requestMock },
}));

import {
  fetchOrganicSessionMessages,
  fetchOrganicSessions,
  invalidateMessageCache,
  updateOrganicSessionTags,
} from './agent-sessions';

const lastRequestPath = (): string => String(requestMock.mock.calls.at(-1)?.[0]?.path ?? '');

describe('fetchOrganicSessions', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('parses the Backend camelCase session payload (regression: snake_case parser dropped every row → empty sidebar)', async () => {
    requestMock.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: 'sess_1',
          brandId: 'brand_1',
          userEmail: 'duane@continuumai.agency',
          title: null,
          weekStart: null,
          timezone: 'UTC',
          lastMessageRole: 'assistant',
          lastMessagePreview: 'Here is your plan',
          lastMessageAt: '2026-06-12T04:30:00Z',
          createdAt: '2026-06-12T04:26:00Z',
          // NOTE: the Backend omits updatedAt entirely — must still parse.
        },
      ],
    });

    const sessions = await fetchOrganicSessions('brand_1');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: 'sess_1',
      brandId: 'brand_1',
      lastMessageRole: 'assistant',
      lastMessagePreview: 'Here is your plan',
      createdAt: '2026-06-12T04:26:00Z',
    });
    // updatedAt falls back to lastMessageAt when the Backend omits it.
    expect(sessions[0]!.updatedAt).toBe('2026-06-12T04:30:00Z');
  });

  it('drops legacy snake_case rows (locks the camelCase contract that previously drifted)', async () => {
    requestMock.mockResolvedValueOnce({
      sessions: [
        {
          session_id: 'sess_old',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const sessions = await fetchOrganicSessions('brand_1');
    expect(sessions).toHaveLength(0);
  });

  it('returns [] when the request fails (e.g. 401) instead of throwing', async () => {
    requestMock.mockRejectedValueOnce(new Error('401 Unauthorized'));
    const sessions = await fetchOrganicSessions('brand_1');
    expect(sessions).toEqual([]);
  });

  it('defaults provenance fields so a legacy row still renders as human-initiated', async () => {
    requestMock.mockResolvedValueOnce({
      sessions: [{ sessionId: 'sess_1', createdAt: '2026-06-12T04:26:00Z' }],
    });

    const [session] = await fetchOrganicSessions('brand_1');
    expect(session).toMatchObject({
      initiator: 'user',
      initiatorAgent: null,
      callerRunId: null,
      callerSessionId: null,
      tags: [],
      preview: null,
    });
  });

  it('carries AI-initiated provenance and tags through', async () => {
    requestMock.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: 'xagent_jaina_brand_1',
          createdAt: '2026-06-12T04:26:00Z',
          initiator: 'agent',
          initiatorAgent: 'jaina',
          callerRunId: 'run_caller',
          callerSessionId: 'sess_caller',
          tags: ['q4'],
          preview: 'What is going on in organic?',
        },
      ],
    });

    const [session] = await fetchOrganicSessions('brand_1');
    expect(session).toMatchObject({
      initiator: 'agent',
      initiatorAgent: 'jaina',
      callerRunId: 'run_caller',
      tags: ['q4'],
    });
  });

  it('sends the search/filter params on the wire', async () => {
    requestMock.mockResolvedValueOnce({ sessions: [] });
    await fetchOrganicSessions('brand_1', {
      q: 'launch',
      initiator: 'agent',
      initiatorAgent: 'jaina',
      tags: ['q4', 'budget'],
    });

    const path = lastRequestPath();
    expect(path).toContain('q=launch');
    expect(path).toContain('initiator=agent');
    expect(path).toContain('initiator_agent=jaina');
    expect(path).toContain('tags=q4%2Cbudget');
  });

  it('omits filter params entirely when no filters are given', async () => {
    requestMock.mockResolvedValueOnce({ sessions: [] });
    await fetchOrganicSessions('brand_1');
    expect(lastRequestPath()).toBe('/api/organic/agent/sessions?brand_id=brand_1');
  });
});

describe('updateOrganicSessionTags', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('PATCHes the session and returns the tags as stored', async () => {
    requestMock.mockResolvedValueOnce({ sessionId: 'sess_1', tags: ['q4'] });

    const tags = await updateOrganicSessionTags('sess_1', 'brand_1', [' Q4 ']);

    const call = requestMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(call.method).toBe('PATCH');
    expect(String(call.path)).toBe('/api/organic/agent/sessions/sess_1?brand_id=brand_1');
    expect(call.body).toEqual({ tags: [' Q4 '] });
    expect(tags).toEqual(['q4']);
  });

  it('falls back to the requested tags when the response is unparseable', async () => {
    requestMock.mockResolvedValueOnce({ unexpected: true });
    expect(await updateOrganicSessionTags('sess_1', 'brand_1', ['q4'])).toEqual(['q4']);
  });
});

describe('fetchOrganicSessionMessages', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('maps camelCase messages (role/content/uiCards) and surfaces uiCards as uiCardFrames', async () => {
    invalidateMessageCache('sess_msgs_1');
    requestMock.mockResolvedValueOnce({
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          uiCards: [{ type: 'ui.plan_card', data: { planId: 'plan_1' } }],
        },
      ],
    });

    const messages = await fetchOrganicSessionMessages('sess_msgs_1', 'brand_1');

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'hi' });
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.uiCardFrames).toEqual([
      { type: 'ui.plan_card', data: { planId: 'plan_1' } },
    ]);
  });
});
