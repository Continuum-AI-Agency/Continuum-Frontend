import { describe, expect, it, mock } from 'bun:test';

import { createOneShotPost } from './oneShotPost';

const okResponse = () =>
  new Response(
    JSON.stringify({
      status: 'created',
      draftId: 'draft-1',
      jobId: 'inline-job-1',
      caption: 'Engagement grew 42% — one habit did it.',
      scheduledAt: '2026-07-12T15:00:00.000Z',
      platform: 'instagram',
      placement: { placementId: 'p-1' },
      claims: [],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

const baseRequest = {
  brandId: 'brand-1',
  platform: 'instagram' as const,
  scheduledAt: '2026-07-12T15:00:00.000Z',
  direction: 'Show the engagement lift',
  metrics: [],
  insights: [],
  angles: [],
  libraryCreativeRefs: [],
  trendIds: [],
};

describe('createOneShotPost client', () => {
  it('posts a validated body with a bearer token and parses the response', async () => {
    const fetchImpl = mock(async (_url: string, _init: RequestInit) => okResponse());
    const res = await createOneShotPost(baseRequest, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      getToken: async () => 'tok',
      baseUrl: 'http://api',
    });
    expect(res.draftId).toBe('draft-1');
    expect(res.caption).toContain('42%');
    expect(fetchImpl.mock.calls[0][0]).toBe('http://api/api/organic/agent/posts/one-shot');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('rejects a request with neither direction nor a selected angle before any network call', async () => {
    const fetchImpl = mock(async () => okResponse());
    await expect(
      createOneShotPost(
        { ...baseRequest, direction: null },
        {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          getToken: async () => null,
          baseUrl: 'http://api',
        },
      ),
    ).rejects.toThrow();
    expect(fetchImpl.mock.calls.length).toBe(0);
  });

  it('accepts an angle selection in place of a direction', async () => {
    const fetchImpl = mock(async (_url: string, _init: RequestInit) => okResponse());
    const res = await createOneShotPost(
      {
        ...baseRequest,
        direction: null,
        angles: [{ refId: 'angle-1', angle: 'Behind the scenes of the roast' }],
      },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getToken: async () => null,
        baseUrl: 'http://api',
      },
    );
    expect(res.status).toBe('created');
  });

  it('surfaces the server error message on a failed response', async () => {
    const fetchImpl = mock(
      async () =>
        new Response(JSON.stringify({ error: 'generation_failed', message: 'model unavailable' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(
      createOneShotPost(baseRequest, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        getToken: async () => null,
        baseUrl: 'http://api',
      }),
    ).rejects.toThrow('model unavailable');
  });
});
