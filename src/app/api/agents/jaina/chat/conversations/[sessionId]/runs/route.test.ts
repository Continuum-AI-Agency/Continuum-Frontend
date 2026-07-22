import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const getUserMock = mock(() =>
  Promise.resolve({
    data: { user: { id: 'user-1', email: 'analyst@example.com' } },
    error: null,
  }),
);

const getSessionMock = mock(() =>
  Promise.resolve({
    data: { session: { access_token: 'session-token' } },
    error: null,
  }),
);

const fromMock = mock();
const schemaMock = mock(() => ({ from: fromMock }));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        getUser: getUserMock,
        getSession: getSessionMock,
      },
      schema: schemaMock,
    }),
}));

import { GET } from './route';

describe('Jaina conversation runs hydration route', () => {
  beforeEach(() => {
    getUserMock.mockClear();
    getSessionMock.mockClear();
    schemaMock.mockClear();
    fromMock.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('loads run payloads for a session and maps response fields', async () => {
    const queryBuilder = {
      select: mock(() => queryBuilder),
      eq: mock(() => queryBuilder),
      order: mock(() => queryBuilder),
      limit: mock(() =>
        Promise.resolve({
          data: [
            {
              id: 42,
              run_id: 'run-42',
              session_id: 'chat_abc123',
              brand_id: 'brand-1',
              ad_account_id: 'act-1',
              status: 'completed',
              result_type: 'report',
              result_payload: { checkpoint_report: { executive_summary: 'Hydrated summary' } },
              query: 'How are we pacing?',
              created_at: '2026-05-05T20:10:00.000Z',
            },
          ],
          error: null,
        }),
      ),
    };
    fromMock.mockReturnValue(queryBuilder);

    const request = new Request(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123/runs?brandId=brand-1&adAccountId=act-1&limit=40',
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ sessionId: 'chat_abc123' }),
    });

    expect(response.status).toBe(200);
    expect(schemaMock).toHaveBeenCalledWith('brand_profiles');
    expect(fromMock).toHaveBeenCalledWith('jaina_conversation_runs');
    expect(queryBuilder.eq.mock.calls).toEqual(
      expect.arrayContaining([
        ['session_id', 'chat_abc123'],
        ['brand_id', 'brand-1'],
        ['ad_account_id', 'act-1'],
      ]),
    );
    expect(queryBuilder.limit).toHaveBeenCalledWith(40);

    const payload = await response.json();
    expect(payload).toMatchObject({
      sessionId: 'chat_abc123',
      runs: [
        {
          id: 42,
          runId: 'run-42',
          sessionId: 'chat_abc123',
          brandId: 'brand-1',
          adAccountId: 'act-1',
          status: 'completed',
          resultType: 'report',
          query: 'How are we pacing?',
          createdAt: '2026-05-05T20:10:00.000Z',
        },
      ],
    });
  });

  it('returns 401 when no authenticated user exists', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = new Request(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123/runs?brandId=brand-1',
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ sessionId: 'chat_abc123' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 400 when required brand id is missing', async () => {
    const request = new Request(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123/runs',
      { method: 'GET' },
    );

    const response = await GET(request, {
      params: Promise.resolve({ sessionId: 'chat_abc123' }),
    });

    expect(response.status).toBe(400);
  });
});
