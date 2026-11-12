import { afterEach, describe, expect, it } from 'bun:test';
import { loadLibraryStill } from './libraryStills';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('loadLibraryStill', () => {
  it('answers every box that asks in the same tick with one request', async () => {
    const bodies: { brandId: string; assetIds: string[]; edge: number }[] = [];
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      return Response.json({ stills: { a1: 'https://storage.test/a1-96.webp', a2: null } });
    }) as unknown as typeof fetch;

    const stills = await Promise.all([
      loadLibraryStill('brand-1', 'a1', 96),
      loadLibraryStill('brand-1', 'a2', 96),
      loadLibraryStill('brand-1', 'a1', 96),
    ]);

    expect(bodies).toEqual([{ brandId: 'brand-1', assetIds: ['a1', 'a2'], edge: 96 }]);
    expect(stills).toEqual([
      'https://storage.test/a1-96.webp',
      null,
      'https://storage.test/a1-96.webp',
    ]);
  });

  it('fails when the route fails, so a failure is never cached as "no still"', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    await expect(loadLibraryStill('brand-1', 'a3', 160)).rejects.toThrow('stills 500');
  });
});
