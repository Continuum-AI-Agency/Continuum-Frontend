import { afterEach, describe, expect, it, mock } from 'bun:test';
import { fetchLibraryCollections } from './collections';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  const calls: string[] = [];
  globalThis.fetch = mock((input: RequestInfo | URL) => {
    calls.push(String(input));
    return Promise.resolve({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: () => Promise.resolve(response.body ?? {}),
    } as Response);
  }) as unknown as typeof fetch;
  return calls;
}

describe('fetchLibraryCollections', () => {
  it('reads the brand collections from the Library endpoint', async () => {
    const calls = stubFetch({ ok: true, body: { collections: [{ id: 'col-1', name: 'Brand' }] } });

    const collections = await fetchLibraryCollections(BRAND_ID);

    expect(calls[0]).toBe(`/api/library/collections?brandId=${BRAND_ID}`);
    expect(collections).toEqual([{ id: 'col-1', name: 'Brand' }] as never);
  });

  it('treats a response without collections as an empty list', async () => {
    stubFetch({ ok: true, body: {} });
    expect(await fetchLibraryCollections(BRAND_ID)).toEqual([]);
  });

  it('throws on a failed read so a caller can tell an outage from an empty library', async () => {
    stubFetch({ ok: false, status: 503 });
    expect(fetchLibraryCollections(BRAND_ID)).rejects.toThrow(
      'Unable to load Library collections (503)',
    );
  });
});
