import { describe, expect, it, mock } from 'bun:test';

import { quickCreatePost } from './quickCreatePost';

const okResponse = () =>
  new Response(
    JSON.stringify({
      status: 'queued',
      jobId: 'job-1',
      planId: 'plan-1',
      planItemId: 'item-1',
      platform: 'instagram',
      scheduledAt: '2026-06-20T12:00:00.000Z',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

describe('quickCreatePost client', () => {
  it('posts a validated body with a bearer token and parses the response', async () => {
    const fetchImpl = mock(async (_url: string, _init: RequestInit) => okResponse());
    const res = await quickCreatePost(
      { brandId: 'brand-1', angle: 'Back-to-school hook', trendIds: [], userSuppliedMedia: [] },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getToken: async () => 'tok',
        baseUrl: 'http://api',
      },
    );
    expect(res.jobId).toBe('job-1');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body as string);
    expect(body.angle).toBe('Back-to-school hook');
  });

  it('omits the Authorization header when no token is available', async () => {
    const fetchImpl = mock(async (_url: string, _init: RequestInit) => okResponse());
    await quickCreatePost(
      { brandId: 'brand-1', angle: 'hook' },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getToken: async () => null,
        baseUrl: 'http://api',
      },
    );
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('throws when the request body is invalid (empty angle)', async () => {
    const fetchImpl = mock(async () => okResponse());
    await expect(
      quickCreatePost(
        { brandId: 'brand-1', angle: '' },
        {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          getToken: async () => null,
          baseUrl: 'http://api',
        },
      ),
    ).rejects.toThrow();
    expect(fetchImpl.mock.calls.length).toBe(0);
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = async () => new Response('nope', { status: 502 });
    await expect(
      quickCreatePost(
        { brandId: 'brand-1', angle: 'hook' },
        {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          getToken: async () => null,
          baseUrl: 'http://api',
        },
      ),
    ).rejects.toThrow();
  });
});
