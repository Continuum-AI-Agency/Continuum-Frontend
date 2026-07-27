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

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      auth: {
        getUser: getUserMock,
        getSession: getSessionMock,
      },
    }),
}));

mock.module('@/lib/api/config', () => ({
  getApiBaseUrl: () => 'https://api.example.com',
}));

import { DELETE, PATCH } from './route';

describe('Jaina conversation delete proxy route', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getUserMock.mockClear();
    getSessionMock.mockClear();

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('proxies delete request with bearer token', async () => {
    const request = new Request(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123',
      { method: 'DELETE' },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ sessionId: 'chat_abc123' }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ deleted: true });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    expect(fetchMock.mock.calls.length).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/agents/jaina/chat/conversations/chat_abc123');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer session-token',
      Accept: 'application/json',
    });
  });

  it('tries fallback route when primary delete path returns 404', async () => {
    const fetchMock = mock((url: string) => {
      if (url.includes('/api/agents/jaina/chat/conversations/chat_abc123')) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const request = new Request(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123',
      { method: 'DELETE' },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ sessionId: 'chat_abc123' }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/api/agents/jaina/conversations/chat_abc123',
    );
  });

  it('returns 401 when no authenticated user exists', async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const request = new Request(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123',
      { method: 'DELETE' },
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ sessionId: 'chat_abc123' }),
    });

    expect(response.status).toBe(401);
  });
});


describe('Jaina conversation tags proxy route', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getUserMock.mockClear();
    getSessionMock.mockClear();
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ sessionId: 'chat_abc123', tags: ['q4'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const patch = (url: string, body: unknown) =>
    PATCH(new Request(url, { method: 'PATCH', body: JSON.stringify(body) }), {
      params: Promise.resolve({ sessionId: 'chat_abc123' }),
    });

  it('forwards normalized tags with the bearer token and brand scope', async () => {
    const response = await patch(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123?brandId=brand-1',
      { tags: [' Q4 ', 'q4'] },
    );

    expect(response.status).toBe(200);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/agents/jaina/chat/conversations/chat_abc123?brand_id=brand-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ tags: ['q4'] });
    expect(await response.json()).toEqual({ sessionId: 'chat_abc123', tags: ['q4'] });
  });

  it('requires a brand id', async () => {
    const response = await patch(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123',
      { tags: [] },
    );
    expect(response.status).toBe(400);
    expect((globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  it('rejects a non-array tags payload', async () => {
    const response = await patch(
      'http://localhost/api/agents/jaina/chat/conversations/chat_abc123?brandId=brand-1',
      { tags: 'q4' },
    );
    expect(response.status).toBe(400);
  });
});
