import { describe, expect, it } from 'bun:test';
import {
  chunkIds,
  fetchAllMatchingAssetIds,
  writeInChunks,
  writeInChunksSkippingVanished,
} from './bulkSelection';

const ids = (n: number) => Array.from({ length: n }, (_, index) => `a${index}`);

describe('chunkIds', () => {
  it('splits 620 ids into 250 + 250 + 120, preserving order', () => {
    const chunks = chunkIds(ids(620));
    expect(chunks.map((chunk) => chunk.length)).toEqual([250, 250, 120]);
    expect(chunks.flat()).toEqual(ids(620));
  });
});

describe('writeInChunks', () => {
  it('writes sequentially and stops at the first failing chunk', async () => {
    const written: number[] = [];
    const run = writeInChunks(ids(600), async (chunk) => {
      if (written.length === 1) throw new Error('boom');
      written.push(chunk.length);
    });
    await expect(run).rejects.toThrow('boom');
    expect(written).toEqual([250]);
  });
});

describe('fetchAllMatchingAssetIds', () => {
  it('follows the cursor, keeps the page filters, and scopes to the collection', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      const cursor = new URL(url, 'http://x').searchParams.get('cursor');
      const page = cursor
        ? { items: [{ id: 'b' }, { id: 'c' }], nextCursor: null }
        : { items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'next' };
      return new Response(JSON.stringify(page));
    }) as unknown as typeof fetch;
    const result = await fetchAllMatchingAssetIds({
      brandId: 'brand',
      search: '?tags=hero&cursor=stale',
      collectionId: 'col',
      fetchImpl,
    });
    expect(result).toEqual(['a', 'b', 'c']);
    const first = new URL(seen[0] ?? '', 'http://x').searchParams;
    expect(first.get('tags')).toBe('hero');
    expect(first.get('collection')).toBe('col');
    expect(first.get('cursor')).toBeNull();
    expect(new URL(seen[1] ?? '', 'http://x').searchParams.get('cursor')).toBe('next');
  });
});

describe('writeInChunksSkippingVanished', () => {
  const vanished = new Set(['a260']);
  const remainingOf = async (chunk: string[]) => chunk.filter((id) => !vanished.has(id));

  it('rewrites a chunk refused for a deleted asset without it, and counts only what was written', async () => {
    const calls: string[][] = [];
    const write = async (chunk: string[]) => {
      calls.push(chunk);
      if (chunk.some((id) => vanished.has(id))) throw new Error('asset_not_found: Asset not found');
    };
    const written = await writeInChunksSkippingVanished(ids(600), write, remainingOf);
    expect(written).toBe(599);
    expect(calls.map((chunk) => chunk.length)).toEqual([250, 250, 249, 100]);
    expect(calls[2]).not.toContain('a260');
  });

  it('rethrows any other refusal, and a not-found that no re-read explains', async () => {
    const denied = async () => {
      throw new Error('insufficient_role: Viewers cannot edit');
    };
    await expect(writeInChunksSkippingVanished(ids(3), denied, remainingOf)).rejects.toThrow(
      'insufficient_role',
    );
    const notFound = async () => {
      throw new Error('asset_not_found: Asset not found');
    };
    await expect(writeInChunksSkippingVanished(ids(3), notFound, remainingOf)).rejects.toThrow(
      'asset_not_found',
    );
  });
});
