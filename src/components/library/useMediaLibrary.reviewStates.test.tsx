import { afterEach, describe, expect, it } from 'bun:test';
import { libraryBrowseQuerySchema, type MediaAsset } from '@continuum/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { useMediaLibrary } from './useMediaLibrary';

// Custom review states are not a browse-RPC argument (a new one would be a PostgREST
// overload), so the browse route narrows the ranked rows with them — and every other browse
// filter must still travel with the request ('Approved' + 'Legal' used to return only Legal).
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const BRAND = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const LEGAL = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const query = libraryBrowseQuerySchema.parse({ brandId: BRAND, destination: 'home' });
// Stable across renders, like the RSC seed prop: a fresh [] per render is a new seed each time.
const NO_SEED: MediaAsset[] = [];
const STATES = [LEGAL];

function recordFetches() {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
  }) as typeof fetch;
  return urls;
}

describe('useMediaLibrary — custom review states', () => {
  it('lists through the browse route with the chosen state ids AND every other filter', async () => {
    const urls = recordFetches();
    const filtered = libraryBrowseQuerySchema.parse({
      brandId: BRAND,
      destination: 'home',
      reviewStatuses: ['approved'],
      placements: ['feed'],
      used: true,
      shared: false,
    });
    renderHook(() =>
      useMediaLibrary({
        query: filtered,
        seed: [],
        initialNextCursor: null,
        reviewStateIds: [LEGAL],
      }),
    );
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    const url = new URL(urls[0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/library/browse');
    expect(url.searchParams.get('reviewStateIds')).toBe(LEGAL);
    expect(url.searchParams.get('reviewStatuses')).toBe('approved');
    expect(url.searchParams.get('placements')).toBe('feed');
    expect(url.searchParams.get('used')).toBe('true');
    expect(url.searchParams.get('shared')).toBe('false');
    expect(url.searchParams.get('destination')).toBe('home');
  });

  it('sends exactly the Approved + Legal + tags request the review grid needs', async () => {
    const urls = recordFetches();
    const approvedHome = libraryBrowseQuerySchema.parse({
      brandId: BRAND,
      destination: 'home',
      tags: ['bench-review-run'],
      reviewStatuses: ['approved'],
      sort: 'updated_desc',
    });
    renderHook(() =>
      useMediaLibrary({
        query: approvedHome,
        seed: [],
        initialNextCursor: null,
        reviewStateIds: [LEGAL],
      }),
    );
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    const url = new URL(urls[0] as string, 'http://localhost');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      brandId: BRAND,
      tags: 'bench-review-run',
      reviewStatuses: 'approved',
      destination: 'home',
      sort: 'updated_desc',
      reviewStateIds: LEGAL,
    });
  });

  it('refetches with the base status once its navigation lands after the state was picked', async () => {
    const urls = recordFetches();
    const before = libraryBrowseQuerySchema.parse({ brandId: BRAND, tags: ['run'] });
    const { rerender } = renderHook(
      ({ query: current }) =>
        useMediaLibrary({
          query: current,
          seed: NO_SEED,
          initialNextCursor: null,
          reviewStateIds: STATES,
        }),
      { initialProps: { query: before } },
    );
    await waitFor(() => expect(urls.length).toBe(1));
    rerender({
      query: libraryBrowseQuerySchema.parse({
        brandId: BRAND,
        tags: ['run'],
        reviewStatuses: ['approved'],
      }),
    });
    await waitFor(() => expect(urls.length).toBe(2));
    const last = new URL(urls[1] as string, 'http://localhost');
    expect(last.searchParams.get('reviewStatuses')).toBe('approved');
    expect(last.searchParams.get('reviewStateIds')).toBe(LEGAL);
  });

  it('keeps the server seed and fetches nothing when no state is chosen', async () => {
    const urls = recordFetches();
    const { result } = renderHook(() =>
      useMediaLibrary({ query, seed: [], initialNextCursor: null, reviewStateIds: [] }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(urls).toEqual([]);
    expect(result.current.assets).toEqual([]);
  });
});
