import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import recorded from '../platforms/__fixtures__/google-vivo47-paid-media-metrics.json';

// The edge is the boundary: what each hook sends to paid-media-metrics and what it makes of the
// answer. The client is replaced; the parsers are the real contract schemas.
const sent: Record<string, unknown>[] = [];
let answer: (body: Record<string, unknown>) => unknown = () => null;
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
        sent.push(options.body);
        return { data: answer(options.body), error: null };
      },
    },
  }),
}));

const {
  campaignField,
  NOT_IN_THIS_READ,
  parseGoogleKeywordQuality,
  useGoogleCampaigns,
  useGoogleSignals,
} = await import('./googleReads');

const TARGET = { brandId: 'brand-1', customerId: '3710693645' };
const WINDOW = { since: '2026-10-21', until: '2026-10-27' };
const E1 = {
  status: 'ENABLED',
  bidding_strategy_type: 'MAXIMIZE_CONVERSIONS',
  bidding_strategy_system_status: 'LEARNING_SETTING_CHANGE',
  target_cpa: null,
  target_roas: null,
  budget_per_day: 500,
  search_impression_share: 0.42,
  search_budget_lost_impression_share: 0.1,
  search_rank_lost_impression_share: 0.48,
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  sent.length = 0;
});

describe('useGoogleCampaigns', () => {
  it("reads top_campaigns by spend on the window and keeps each row's E1 block", async () => {
    const [first, ...rest] = recorded.top_campaigns.rows;
    answer = () => ({ ...recorded.top_campaigns, rows: [{ ...first, google: E1 }, ...rest] });
    const { result } = renderHook(() => useGoogleCampaigns({ ...TARGET, window: WINDOW }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(sent).toEqual([
      {
        platform: 'google-ads',
        brandId: 'brand-1',
        accountId: '3710693645',
        scope: 'top_campaigns',
        kpi: 'spend',
        limit: 50,
        range: { preset: 'custom', ...WINDOW },
      },
    ]);
    const rows = result.current.data?.rows ?? [];
    expect(rows[0]?.google?.budget_per_day).toBe(500);
    // A row from a payload cached before E1 parses, and says why its fields read "—".
    expect(rows[1]?.google).toBeUndefined();
    if (rows[1]) {
      expect(campaignField(rows[1], 'search_impression_share')).toEqual({
        value: null,
        reason: NOT_IN_THIS_READ,
      });
    }
  });
});

describe('useGoogleSignals', () => {
  it('asks google_signals for the sorted blocks only, and names a shape it does not know', async () => {
    answer = () => ({ scope: 'google_signals', signals: 'nope' });
    const { result } = renderHook(
      () => useGoogleSignals({ ...TARGET, blocks: ['search_terms', 'asset_groups'] }),
      { wrapper: wrapper() },
    );
    // The hook retries once (about a second) before it gives up.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({
      platform: 'google-ads',
      brandId: 'brand-1',
      accountId: '3710693645',
      scope: 'google_signals',
      blocks: ['asset_groups', 'search_terms'],
    });
    expect(result.current.error?.message).toBe(
      'The Google Ads signals read came back in a shape this page does not know.',
    );
  });
});

describe('campaignField', () => {
  const row = (channel: string, google = E1) => ({
    id: '1',
    name: 'c',
    labels: { channel_type: channel },
    metrics: { spend: 1, impressions: 1, clicks: 0, conversions: null },
    google,
  });

  it('returns what Google reported, and a reason for each kind of "—"', () => {
    expect(campaignField(row('SEARCH'), 'budget_per_day')).toEqual({ value: 500, reason: null });
    expect(
      campaignField(
        row('PERFORMANCE_MAX', { ...E1, search_impression_share: null }),
        'search_impression_share',
      ).reason,
    ).toBe('Google reported no impression share for this window');
    expect(
      campaignField(
        row('DISPLAY', { ...E1, search_impression_share: null }),
        'search_impression_share',
      ).reason,
    ).toBe('Google reports impression share only for campaigns that serve on Search');
    expect(campaignField(row('SEARCH'), 'target_cpa').reason).toContain('portfolio bid strategy');
  });
});

describe('parseGoogleKeywordQuality', () => {
  it('reads the scope and refuses a score outside 1–10', () => {
    const keyword = {
      criterion_id: '77',
      keyword: 'gym',
      match_type: 'EXACT',
      campaign: 'Search',
      ad_group: 'Gyms',
      quality_score: 3,
      ad_relevance: 'AVERAGE',
      landing_page_experience: 'BELOW_AVERAGE',
      expected_ctr: null,
      metrics: { spend: 10, impressions: 100, clicks: 4, conversions: 0 },
    };
    const read = {
      scope: 'keyword_quality',
      range: WINDOW,
      total_keywords: 1,
      scored_keywords: 1,
      average_quality_score: 3,
      keywords: [keyword],
    };
    expect(parseGoogleKeywordQuality(read).keywords[0]?.quality_score).toBe(3);
    expect(() =>
      parseGoogleKeywordQuality({ ...read, keywords: [{ ...keyword, quality_score: 0 }] }),
    ).toThrow('shape this page does not know');
  });
});
