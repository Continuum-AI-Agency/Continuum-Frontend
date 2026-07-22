import { beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetApiBaseUrl = mock(() => 'http://localhost:3001');

mock.module('@/lib/api/config', () => ({
  getApiBaseUrl: mockGetApiBaseUrl,
}));

import { POST } from '@/app/api/agents/jaina/chat/stop/route';

describe('POST /api/agents/jaina/chat/stop', () => {
  const mockFetch = mock(() => Promise.resolve(new Response()));
  global.fetch = mockFetch as typeof global.fetch;

  beforeEach(() => {
    mockGetApiBaseUrl.mockClear();
    mockFetch.mockClear();
  });

  it('returns 401 when bearer token is missing', async () => {
    const request = new Request('http://localhost/api/agents/jaina/chat/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_account_id: 'act_123',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON request bodies', async () => {
    const request = new Request('http://localhost/api/agents/jaina/chat/stop', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: '{',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 400 when request body does not match either supported payload shape', async () => {
    const request = new Request('http://localhost/api/agents/jaina/chat/stop', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context: { adAccountId: 'act_123' } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid stop payload' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('forwards brand-scoped payload to upstream and returns typed response', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'stopped', stopped_runs: 3 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const request = new Request('http://localhost/api/agents/jaina/chat/stop', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context: {
          adAccountId: 'act_123',
          brandId: 'brand_456',
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'stopped', stopped_runs: 3 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [upstreamUrl, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(upstreamUrl).toBe('http://localhost:3001/api/agents/jaina/chat/stop');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(JSON.parse(options.body as string)).toEqual({
      context: {
        adAccountId: 'act_123',
        brandId: 'brand_456',
      },
    });
  });

  it('forwards ad-account payload to upstream and returns idle response', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'idle', stopped_runs: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const request = new Request('http://localhost/api/agents/jaina/chat/stop', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ad_account_id: 'act_123',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'idle', stopped_runs: 0 });
  });

  it('passes through upstream error status and message', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(new Response('Backend unavailable', { status: 503 })),
    );

    const request = new Request('http://localhost/api/agents/jaina/chat/stop', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ad_account_id: 'act_123',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Backend unavailable' });
  });

  it('returns 502 when upstream returns an invalid contract response', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 'stopped' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const request = new Request('http://localhost/api/agents/jaina/chat/stop', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ad_account_id: 'act_123',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Invalid stop response from backend.',
    });
  });
});
