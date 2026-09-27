import { describe, expect, mock, test } from 'bun:test';
import { libraryBrowseQuerySchema } from '@continuum/contracts';

// browse.server.ts is server-only and signs URLs through the request's client; neither is
// what this test is about — it grades WHICH assets the narrowed page holds.
mock.module('server-only', () => ({}));
mock.module('./signed-urls', () => ({
  assetSignablePaths: () => [],
  mintSignedUrls: async () => new Map(),
}));

const { fetchNarrowedLibraryBrowsePage } = await import('./browse.server');

const BRAND = '11111111-1111-4111-8111-111111111111';
const LEGAL = '44444444-4444-4444-8444-444444444444';
const SIGNED = '55555555-5555-4555-8555-555555555555';
const RUN = 'bench-review-run';

// The review bench's fixtures: the video approved (in the custom state Signed), the still in
// Legal (base in_review), the cut a draft — all tagged with the run.
const assets = [
  { id: 'video', review_status: 'approved', review_state_id: SIGNED },
  { id: 'still', review_status: 'in_review', review_state_id: LEGAL },
  { id: 'cut', review_status: 'draft', review_state_id: null },
];

function fakeClient() {
  const rpcArgs: Array<Record<string, unknown>> = [];
  const hydrated: string[][] = [];
  const client = {
    schema: () => ({
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        rpcArgs.push(args);
        // The RPC ranks with every filter it holds: tags and the review pre-filter.
        const statuses = args.p_review_statuses as string[] | null;
        const ranked = assets
          .filter((asset) => !statuses || statuses.includes(asset.review_status))
          .map((asset) => ({
            asset_id: asset.id,
            sort_time: '2026-09-27T00:00:00Z',
            sort_text: null,
            sort_number: null,
            usage_count: 0,
            performance_score: null,
          }));
        return { data: ranked, error: null };
      },
      from: (table: string) => {
        let columns = '';
        const builder = {
          select: (value: string) => {
            columns = value;
            return builder;
          },
          eq: () => builder,
          in: async (_column: string, ids: string[]) => {
            if (table === 'review_custom_states') {
              return {
                data: ids.includes(LEGAL) ? [{ base_status: 'in_review' }] : [],
                error: null,
              };
            }
            if (columns === 'id, review_status, review_state_id') {
              return { data: assets.filter((asset) => ids.includes(asset.id)), error: null };
            }
            hydrated.push(ids);
            return { data: [], error: null };
          },
        };
        return builder;
      },
    }),
  };
  return { client: client as never, rpcArgs, hydrated };
}

describe('fetchNarrowedLibraryBrowsePage — brand-labelled base status + custom state + tags', () => {
  test('Approved + Legal lists exactly the approved video and the Legal still', async () => {
    const { client, rpcArgs, hydrated } = fakeClient();
    const page = await fetchNarrowedLibraryBrowsePage(
      client,
      libraryBrowseQuerySchema.parse({ brandId: BRAND, tags: [RUN], reviewStatuses: ['approved'] }),
      { reviewStateIds: [LEGAL], fieldConstraint: { kind: 'unfiltered' } },
    );
    expect(rpcArgs[0]?.p_tags).toEqual([RUN]);
    expect(rpcArgs[0]?.p_review_statuses).toEqual(['approved', 'in_review']);
    expect(hydrated).toEqual([['video', 'still']]);
    expect(page.nextCursor).toBeNull();
  });

  test('Legal alone lists only the still', async () => {
    const { client, hydrated } = fakeClient();
    await fetchNarrowedLibraryBrowsePage(
      client,
      libraryBrowseQuerySchema.parse({ brandId: BRAND, tags: [RUN] }),
      { reviewStateIds: [LEGAL], fieldConstraint: { kind: 'unfiltered' } },
    );
    expect(hydrated).toEqual([['still']]);
  });
});
