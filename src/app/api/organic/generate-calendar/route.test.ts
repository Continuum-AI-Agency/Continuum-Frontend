import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    (
      globalThis as { __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown }
    ).__testCreateSupabaseServerClient?.(...args),
}));

mock.module('@/lib/api/config', () => ({
  getApiUrl: (...args: unknown[]) =>
    (globalThis as { __testGetApiUrl?: (...params: unknown[]) => unknown }).__testGetApiUrl?.(
      ...args,
    ),
}));

import { POST } from './route';

describe('POST /api/organic/generate-calendar', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    mock.restore();
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock() as unknown as typeof fetch;

    const createSupabaseServerClientMock = mock().mockResolvedValue({
      auth: {
        getSession: mock().mockResolvedValue({
          data: { session: { access_token: 'session-token' } },
          error: null,
        }),
      },
    });
    const getApiUrlMock = mock();

    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = createSupabaseServerClientMock;
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testGetApiUrl = getApiUrlMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testCreateSupabaseServerClient = undefined;
    (
      globalThis as {
        __testCreateSupabaseServerClient?: (...params: unknown[]) => unknown;
        __testGetApiUrl?: (...params: unknown[]) => unknown;
      }
    ).__testGetApiUrl = undefined;
  });

  it('accepts flattened backend batch payload and streams response', async () => {
    const getApiUrlMock = (globalThis as { __testGetApiUrl?: ReturnType<typeof mock> })
      .__testGetApiUrl as ReturnType<typeof mock>;
    getApiUrlMock.mockReturnValue('https://organic.service/api/organic/generate-calendar');

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    fetchMock.mockResolvedValue(
      new Response('{"type":"complete"}\n', {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      }),
    );

    const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    const requestBody = {
      brandProfileId: '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10',
      weekStart: '2026-03-09',
      timezone: 'America/Los_Angeles',
      platformAccountIds: {
        instagram: 'ig_account_123',
      },
      placements: [
        {
          placementId: 'ig-2026-03-09-1',
          trendId: 'trend_abc123',
          dayId: '2026-03-09',
          scheduledAt: '2026-03-09T17:00:00.000Z',
          timeLabel: '10:00 AM',
          platform: 'instagram',
          accountId: 'ig_account_123',
          seedSource: 'trend',
          desiredFormat: null,
          metadata: { batch: 'instagram-weekly' },
        },
      ],
      options: null,
    };

    try {
      const response = await POST(
        new Request('http://localhost/api/organic/generate-calendar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
          },
          body: JSON.stringify(requestBody),
        }) as never,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://organic.service/api/organic/generate-calendar');
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
        Authorization: 'Bearer session-token',
        apikey: 'anon-key',
        'x-supabase-auth': 'session-token',
        'x-auth-token': 'session-token',
        'X-Brand-Profile-Id': '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10',
      });

      const forwarded = JSON.parse(String(init.body));
      expect(forwarded).toEqual(requestBody);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('application/x-ndjson');
      await expect(response.text()).resolves.toBe('{"type":"complete"}\n');
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  });
});
