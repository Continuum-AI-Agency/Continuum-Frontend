import { describe, expect, mock, test } from 'bun:test';
import type { LibraryBrowseQuery } from '@continuum/contracts';

// The route's own decisions only: which query and narrowing reach the narrowed read.
mock.module('server-only', () => ({}));
mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: async () => true,
}));
const narrowedCalls: Array<{ query: LibraryBrowseQuery; narrowing: unknown }> = [];
const plainCalls: LibraryBrowseQuery[] = [];
mock.module('@/lib/media/browse.server', () => ({
  fetchNarrowedLibraryBrowsePage: async (
    _client: unknown,
    query: LibraryBrowseQuery,
    narrowing: unknown,
  ) => {
    narrowedCalls.push({ query, narrowing });
    return { items: [], nextCursor: null };
  },
  fetchLibraryBrowsePage: async (_client: unknown, query: LibraryBrowseQuery) => {
    plainCalls.push(query);
    return { items: [], nextCursor: null };
  },
}));

const { GET } = await import('./route');

const BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const LEGAL = '4d32bab4-9414-4b8e-a02f-906fff97c4c9';

describe('GET /api/library/browse — base status + custom state', () => {
  test('hands the narrowed read BOTH the base statuses and the custom states, with the tags', async () => {
    // The exact request the review grid sends for Approved + Legal on a run-tagged view.
    const response = await GET(
      new Request(
        `http://localhost/api/library/browse?brandId=${BRAND}&tags=bench-review-run&reviewStatuses=approved&destination=home&sort=updated_desc&reviewStateIds=${LEGAL}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(plainCalls).toEqual([]);
    expect(narrowedCalls).toHaveLength(1);
    expect(narrowedCalls[0]?.query.reviewStatuses).toEqual(['approved']);
    expect(narrowedCalls[0]?.query.tags).toEqual(['bench-review-run']);
    expect(narrowedCalls[0]?.narrowing).toEqual({
      reviewStateIds: [LEGAL],
      fieldConstraint: { kind: 'unfiltered' },
    });
  });

  test('refuses a malformed state id rather than widening the result', async () => {
    const response = await GET(
      new Request(`http://localhost/api/library/browse?brandId=${BRAND}&reviewStateIds=legal`),
    );
    expect(response.status).toBe(422);
  });
});
