import { describe, expect, mock, test } from 'bun:test';
import type { LibraryBrowseQuery } from '@continuum/contracts';

// The route's own decisions only: which query reaches the browse read.
mock.module('server-only', () => ({}));
mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));
mock.module('@/lib/media/brand-access.server', () => ({
  callerHasBrandAccess: async () => true,
}));
const plainCalls: LibraryBrowseQuery[] = [];
mock.module('@/lib/media/browse.server', () => ({
  fetchLibraryBrowsePage: async (_client: unknown, query: LibraryBrowseQuery) => {
    plainCalls.push(query);
    return { items: [], nextCursor: null };
  },
}));

const { GET } = await import('./route');

const BRAND = 'b411bba9-d09c-4892-9b86-5ff340ce64e5';
const LEGAL = '4d32bab4-9414-4b8e-a02f-906fff97c4c9';

describe('GET /api/library/browse — base status + custom state', () => {
  test('hands the one browse read BOTH the base statuses and the custom states, with the tags', async () => {
    // The exact request the review grid sends for Approved + Legal on a run-tagged view.
    const response = await GET(
      new Request(
        `http://localhost/api/library/browse?brandId=${BRAND}&tags=bench-review-run&reviewStatuses=approved&destination=home&sort=updated_desc&reviewStateIds=${LEGAL}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(plainCalls).toHaveLength(1);
    expect(plainCalls[0]?.reviewStatuses).toEqual(['approved']);
    expect(plainCalls[0]?.reviewStateIds).toEqual([LEGAL]);
    expect(plainCalls[0]?.tags).toEqual(['bench-review-run']);
  });

  test('reads Format, ranges, technical predicates and thenBy off the URL', async () => {
    plainCalls.length = 0;
    const ranges = encodeURIComponent(JSON.stringify({ resolution: { min: 2160 } }));
    const technical = encodeURIComponent(JSON.stringify({ videoCodecs: ['prores'] }));
    const response = await GET(
      new Request(
        `http://localhost/api/library/browse?brandId=${BRAND}&families=video,design&ranges=${ranges}&technical=${technical}&sort=frame_rate_asc&thenBy=size:desc`,
      ),
    );
    expect(response.status).toBe(200);
    expect(plainCalls[0]).toMatchObject({
      families: ['video', 'design'],
      ranges: { resolution: { min: 2160 } },
      technical: { videoCodecs: ['prores'] },
      sort: 'frame_rate_asc',
      thenBy: [{ key: 'size', dir: 'desc' }],
    });
  });

  test('refuses a range that is not JSON rather than dropping it', async () => {
    const response = await GET(
      new Request(`http://localhost/api/library/browse?brandId=${BRAND}&ranges=4k`),
    );
    expect(response.status).toBe(422);
  });

  test('refuses a malformed state id rather than widening the result', async () => {
    const response = await GET(
      new Request(`http://localhost/api/library/browse?brandId=${BRAND}&reviewStateIds=legal`),
    );
    expect(response.status).toBe(422);
  });
});
