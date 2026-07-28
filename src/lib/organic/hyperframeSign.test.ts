import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock((_args: { path: string; method?: string; body?: unknown }) =>
  Promise.resolve<unknown>({
    signedUrl: 'https://signed.example.com/a.png',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }),
);

mock.module('@/lib/api/http', () => ({
  request: requestMock,
  http: { request: requestMock },
}));

const { resetSignedUrlCache, signOrganicMediaAsset, signMediaAsset } = await import(
  './hyperframeSign'
);

const PAIR = { brandId: 'brand-1', bucket: 'brand-profile-assets', path: 'organic/a.png' };

describe('signOrganicMediaAsset', () => {
  beforeEach(() => {
    requestMock.mockClear();
    resetSignedUrlCache();
    requestMock.mockImplementation(() =>
      Promise.resolve({
        signedUrl: 'https://signed.example.com/a.png',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
  });

  afterAll(() => mock.restore());

  it('mints a signed URL from the durable pair', async () => {
    await expect(signOrganicMediaAsset(PAIR)).resolves.toBe('https://signed.example.com/a.png');
    expect(requestMock).toHaveBeenCalledWith({
      path: '/api/organic/agent/hyperframes/sign',
      method: 'POST',
      body: PAIR,
    });
  });

  it('serves a repeat call from the cache instead of a second POST', async () => {
    await signOrganicMediaAsset(PAIR);
    await signOrganicMediaAsset(PAIR);

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  // Two surfaces mounting in the same tick is the normal case, not the exotic one:
  // the month chip and its hover card render together.
  it('collapses concurrent callers onto ONE in-flight request', async () => {
    const [first, second] = await Promise.all([
      signOrganicMediaAsset(PAIR),
      signOrganicMediaAsset(PAIR),
    ]);

    expect(first).toBe('https://signed.example.com/a.png');
    expect(second).toBe('https://signed.example.com/a.png');
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('keys the cache on brand, bucket AND path', async () => {
    await signOrganicMediaAsset(PAIR);
    await signOrganicMediaAsset({ ...PAIR, path: 'organic/b.png' });
    await signOrganicMediaAsset({ ...PAIR, bucket: 'other-bucket' });
    await signOrganicMediaAsset({ ...PAIR, brandId: 'brand-2' });

    expect(requestMock).toHaveBeenCalledTimes(4);
  });

  // An already-expired signature must never be served: that is the exact failure the
  // cache exists to fix, and a cache that outlived the URL would make it permanent.
  it('re-signs once the cached signature has expired', async () => {
    requestMock.mockImplementation(() =>
      Promise.resolve({
        signedUrl: 'https://signed.example.com/stale.png',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    );

    await signOrganicMediaAsset(PAIR);
    await signOrganicMediaAsset(PAIR);

    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure, so the next render can retry', async () => {
    requestMock.mockImplementation(() => Promise.reject(new Error('boom')));

    await expect(signOrganicMediaAsset(PAIR)).resolves.toBeNull();
    await expect(signOrganicMediaAsset(PAIR)).resolves.toBeNull();

    expect(requestMock).toHaveBeenCalledTimes(2);
  });
});

describe('signMediaAsset', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock((_input: unknown, _init?: unknown) =>
    Promise.resolve(
      new Response(JSON.stringify({ signedUrl: 'https://signed.example.com/asset.png' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );

  beforeEach(() => {
    resetSignedUrlCache();
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('caches by asset id under its own key namespace', async () => {
    const params = { brandId: 'brand-1', assetId: 'asset-1' };

    await expect(signMediaAsset(params)).resolves.toBe('https://signed.example.com/asset.png');
    await expect(signMediaAsset(params)).resolves.toBe('https://signed.example.com/asset.png');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
