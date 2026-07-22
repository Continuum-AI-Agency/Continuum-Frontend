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
} from './agent-sessions';

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
