import { describe, expect, it, mock } from 'bun:test';
import { TIKTOK_ADVERTISER_ID, TIKTOK_DOC_SHAPED_ENVELOPE } from './__fixtures__/tiktokSnapshots';

// The edge is the boundary under test: what the page sends to paid-media-metrics and what it
// does with the answer. The client is replaced; the parsing and the fold are the real ones.
type Invoke = (
  name: string,
  options: { body: Record<string, unknown> },
) => Promise<{ data: unknown; error: unknown }>;
let invoke: Invoke = async () => ({ data: null, error: null });
const calls: { name: string; body: Record<string, unknown> }[] = [];
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: (name: string, options: { body: Record<string, unknown> }) => {
        calls.push({ name, body: options.body });
        return invoke(name, options);
      },
    },
  }),
}));

const { fetchTikTokAdsOverview, tiktokOverviewStateOf } = await import('./useTikTokAdsOverview');

describe('fetchTikTokAdsOverview', () => {
  it('reads tiktok_snapshots for the advertiser, never forcing a refresh', async () => {
    calls.length = 0;
    invoke = async () => ({ data: TIKTOK_DOC_SHAPED_ENVELOPE, error: null });
    const overview = await fetchTikTokAdsOverview('brand-1', TIKTOK_ADVERTISER_ID);
    expect(calls).toEqual([
      {
        name: 'paid-media-metrics',
        body: {
          platform: 'tiktok-ads',
          scope: 'tiktok_snapshots',
          brandId: 'brand-1',
          accountId: TIKTOK_ADVERTISER_ID,
        },
      },
    ]);
    expect(overview.spend).toBe(8542.46);
    expect(overview.topAdGroups).toHaveLength(3);
  });

  it("surfaces the edge's own error message", async () => {
    invoke = async () => ({
      data: null,
      error: new Error('TikTok Ads advertiser not connected or access token missing'),
    });
    await expect(fetchTikTokAdsOverview('brand-1', TIKTOK_ADVERTISER_ID)).rejects.toThrow(
      'TikTok Ads advertiser not connected or access token missing',
    );
  });

  it('refuses a payload it does not know rather than print zeros', async () => {
    invoke = async () => ({ data: { entities: 'nope' }, error: null });
    await expect(fetchTikTokAdsOverview('brand-1', TIKTOK_ADVERTISER_ID)).rejects.toThrow(
      'shape this page does not know',
    );
  });
});

describe('tiktokOverviewStateOf', () => {
  const idle = { data: undefined, error: null, isError: false };

  it('is not connected without an advertiser, whatever the query says', () => {
    expect(tiktokOverviewStateOf(null, idle)).toEqual({ status: 'not-connected' });
  });

  it('is loading, failed or ready from the query', () => {
    expect(tiktokOverviewStateOf('1', idle)).toEqual({ status: 'loading' });
    expect(
      tiktokOverviewStateOf('1', { data: undefined, error: new Error('down'), isError: true }),
    ).toEqual({ status: 'error', message: 'down' });
  });
});
