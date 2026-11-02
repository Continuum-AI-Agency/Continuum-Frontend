import { describe, expect, it, mock } from 'bun:test';
import {
  PLATFORM_READ_TIMEOUT_MS,
  READ_TIMEOUT_MS,
  supabaseTimeoutPolicy,
} from '@/lib/api/timeout';

// PP-DT-E-home-google-results-absent, follow-on (deep test 2026-10-31, lane K): a Google Ads read
// runs six or seven GAQL queries, and cold it took 5.7–7.8 s from the deployed edge (Pink
// Elephant's customer, 2026-10-31) against the 8 s read bound. A bound that fires mid-read also
// aborts the edge's own queries, so Retry starts cold again. The policy chooses by URL, so a Google
// read names its platform in the URL and gets the platform-read budget; a Meta read stays a read.

const SUPABASE = 'https://nkejqgyushulohxwtytl.supabase.co';
const names: string[] = [];

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async (name: string) => {
        names.push(name);
        return { data: { metrics: { spend: 1, roas: 0, ctr: 0 }, rows: [] }, error: null };
      },
    },
  }),
}));

const { fetchPaidAccountOverview } = await import('./paid-overview.client');
const { fetchPaidRanking } = await import('./paid-ranking.client');
const { invokeGoogleMetrics } = await import(
  '@/components/paid-media/optimizer/sections/google/googleReads'
);

const range = { since: '2026-10-25', until: '2026-10-31' };
const boundOf = (name: string) => supabaseTimeoutPolicy(`${SUPABASE}/functions/v1/${name}`, 'POST');

describe('a Google Ads read is a platform read', () => {
  it('names Google in the URL of the Home’s reads, and gets the platform-read budget', async () => {
    names.length = 0;
    await fetchPaidAccountOverview({
      brandId: 'b',
      adAccountId: '6619636193',
      platform: 'google-ads',
      range,
    });
    await fetchPaidRanking({
      brandId: 'b',
      adAccountId: '6619636193',
      platform: 'google-ads',
      scope: 'top_campaigns',
      kpi: 'conversions',
      range,
    });
    expect(names).toEqual([
      'paid-media-reporting/metrics?platform=google-ads',
      'paid-media-reporting/metrics?platform=google-ads',
    ]);
    expect(names.map(boundOf)).toEqual([PLATFORM_READ_TIMEOUT_MS, PLATFORM_READ_TIMEOUT_MS]);
  });

  it('names Google in the URL of the Google tab’s reads too', async () => {
    names.length = 0;
    await invokeGoogleMetrics({ brandId: 'b', accountId: '6619636193', scope: 'account_overview' });
    expect(names).toEqual(['paid-media-metrics?platform=google-ads']);
    expect(boundOf(names[0] ?? '')).toBe(PLATFORM_READ_TIMEOUT_MS);
  });

  it('keeps a Meta read on the read budget', async () => {
    names.length = 0;
    await fetchPaidAccountOverview({ brandId: 'b', adAccountId: 'act_1', platform: 'meta', range });
    expect(names).toEqual(['paid-media-reporting/metrics']);
    expect(boundOf(names[0] ?? '')).toBe(READ_TIMEOUT_MS);
    expect(boundOf('paid-media-reporting/metrics?platform=meta')).toBe(READ_TIMEOUT_MS);
  });
});
