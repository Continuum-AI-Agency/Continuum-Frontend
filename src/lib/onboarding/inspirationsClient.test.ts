import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const getBrowserAccessToken = mock(() => Promise.resolve('access-token'));

mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken,
}));

import { streamGeneration } from './inspirationsClient';

describe('streamGeneration', () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    getBrowserAccessToken.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  it('sends the selected competitor inspiration through the generation boundary', async () => {
    const fetchMock = mock(() =>
      Promise.resolve(
        new Response('', {
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
        }),
      ),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    await streamGeneration({
      brandId: 'brand-1',
      selectedInspiration: {
        competitorName: 'Acme',
        imageUrl: 'https://cdn.example.com/acme.jpg',
      },
      onFrame: () => {},
    });

    const request = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      brandId: 'brand-1',
      referenceAssetId: null,
      referenceImageUrl: 'https://cdn.example.com/acme.jpg',
      competitorName: 'Acme',
    });
  });
});
