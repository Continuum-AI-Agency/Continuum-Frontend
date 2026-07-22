import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { POST } from '@/app/api/organic/generate-calendar/route';

// Mock dependencies
const mockGetSession = mock(() =>
  Promise.resolve({
    data: {
      session: {
        access_token: 'mock-access-token',
      },
    },
    error: null,
  }),
);

const mockSupabaseClient = {
  auth: {
    getSession: mockGetSession,
  },
};

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve(mockSupabaseClient),
}));

mock.module('@/lib/api/config', () => ({
  getApiUrl: (path: string) => `http://localhost:3001${path}`,
}));

describe('generate-calendar API route', () => {
  const mockFetch = mock(() => {});
  global.fetch = mockFetch;

  beforeEach(() => {
    mockGetSession.mockClear();
    mockFetch.mockClear();
  });

  const createMockRequest = (body: any, options: { signal?: AbortSignal } = {}) => {
    return {
      json: () => Promise.resolve(body),
      signal: options.signal || new AbortController().signal,
    } as any;
  };

  test('returns 400 for invalid JSON', async () => {
    const request = {
      json: () => Promise.reject(new Error('Invalid JSON')),
      signal: new AbortController().signal,
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('Invalid JSON payload');
  });

  test('returns 401 when no session', async () => {
    mockGetSession.mockImplementationOnce(() =>
      Promise.resolve({
        data: { session: null },
        error: null,
      }),
    );

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    const response = await POST(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe('Unauthorized');
  });

  test('transforms payload correctly for backend', async () => {
    const mockUpstreamResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: mock(() => Promise.resolve({ done: true })),
        }),
      },
    };
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockUpstreamResponse));

    const requestBody = {
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'America/New_York',
      placements: [
        {
          placementId: 'placement-1',
          trendId: 'trend-1',
          dayId: '2026-01-26',
          scheduledAt: '2026-01-26T09:00:00.000Z',
          timeLabel: '9:00 AM',
          platform: 'instagram',
          accountId: 'ig-account-1',
          seedSource: 'trend',
          desiredFormat: 'Post',
          metadata: { key: 'value' },
        },
      ],
      platformAccountIds: { instagram: 'ig-account-1' },
      options: {
        schedulePreset: 'beta-launch',
        includeNewsletter: true,
        newsletterDayId: '2026-01-26',
        guidancePrompt: 'Generate engaging content',
        language: 'en',
        preferredPlatforms: ['instagram'],
      },
    };

    const request = createMockRequest(requestBody);
    const response = await POST(request);

    expect(mockFetch).toHaveBeenCalled();
    const [, fetchOptions] = mockFetch.mock.calls[0];
    const upstreamBody = JSON.parse(fetchOptions.body);

    expect(upstreamBody.brandProfileId).toBe('brand-123');
    expect(upstreamBody.weekStart).toBe('2026-01-26');
    expect(upstreamBody.placements).toHaveLength(1);
    expect(upstreamBody.placements[0].placementId).toBe('placement-1');
    expect(upstreamBody.placements[0].trendId).toBe('trend-1');
    expect(upstreamBody.placements[0].metadata).toEqual({ key: 'value' });
    expect(upstreamBody.options.schedulePreset).toBe('beta-launch');
    expect(upstreamBody.options.includeNewsletter).toBe(true);
  });

  test('includes authorization header in upstream request', async () => {
    const mockUpstreamResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: mock(() => Promise.resolve({ done: true })),
        }),
      },
    };
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockUpstreamResponse));

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    await POST(request);

    expect(mockFetch).toHaveBeenCalled();
    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers.Authorization).toBe('Bearer mock-access-token');
    expect(fetchOptions.headers['Content-Type']).toBe('application/json');
    expect(fetchOptions.headers.Accept).toBe('application/x-ndjson');
  });

  test('returns error when upstream returns non-ok response', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Backend error' }),
      }),
    );

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe('Failed to start calendar generation');
    expect(body.detail).toEqual({ error: 'Backend error' });
  });

  test('returns error when upstream returns non-ok with no json body', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.reject(new Error('Not JSON')),
        text: () => Promise.reject(new Error('No text')),
      }),
    );

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    const response = await POST(request);
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.error).toBe('Failed to start calendar generation');
  });

  test('returns streaming response with correct headers', async () => {
    const encoder = new TextEncoder();
    const streamData = encoder.encode(
      JSON.stringify({ type: 'progress', completed: 1, total: 5 }) + '\n',
    );

    const mockUpstreamResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: mock(() => {
              readCount++;
              if (readCount === 1) {
                return Promise.resolve({ done: false, value: streamData });
              }
              return Promise.resolve({ done: true });
            }),
          };
        },
      },
    };
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockUpstreamResponse));

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    const response = await POST(request);

    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  });

  test('handles empty placements array', async () => {
    const mockUpstreamResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: mock(() => Promise.resolve({ done: true })),
        }),
      },
    };
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockUpstreamResponse));

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    const response = await POST(request);

    expect(mockFetch).toHaveBeenCalled();
    const [, fetchOptions] = mockFetch.mock.calls[0];
    const upstreamBody = JSON.parse(fetchOptions.body);
    expect(upstreamBody.placements).toEqual([]);
  });

  test('handles request without options', async () => {
    const mockUpstreamResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: mock(() => Promise.resolve({ done: true })),
        }),
      },
    };
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockUpstreamResponse));

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    await POST(request);

    expect(mockFetch).toHaveBeenCalled();
    const [, fetchOptions] = mockFetch.mock.calls[0];
    const upstreamBody = JSON.parse(fetchOptions.body);
    expect(upstreamBody.options).toBeNull();
  });

  test('handles platformAccountIds being undefined', async () => {
    const mockUpstreamResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: mock(() => Promise.resolve({ done: true })),
        }),
      },
    };
    mockFetch.mockImplementationOnce(() => Promise.resolve(mockUpstreamResponse));

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    await POST(request);

    expect(mockFetch).toHaveBeenCalled();
    const [, fetchOptions] = mockFetch.mock.calls[0];
    const upstreamBody = JSON.parse(fetchOptions.body);
    expect(upstreamBody.platformAccountIds).toEqual({});
  });

  test('handles upstream returning text error', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.reject(new Error('Not JSON')),
        text: () => Promise.resolve('Bad request'),
      }),
    );

    const request = createMockRequest({
      brandProfileId: 'brand-123',
      weekStart: '2026-01-26',
      timezone: 'UTC',
      placements: [],
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('Failed to start calendar generation');
    expect(body.detail).toBe('Bad request');
  });
});
