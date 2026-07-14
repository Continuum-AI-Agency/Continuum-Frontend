import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { FunctionsHttpError } from '@supabase/supabase-js';

let universe: Array<{ id: string; name: string; status: string }> = [
  { id: 'c1', name: 'Camp 1', status: 'ENABLED' },
];

const invokeMock = mock(async (..._args: unknown[]) => ({
  data: { campaigns: universe },
  error: null,
}));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke: invokeMock } }),
}));

import {
  CampaignPerformanceLoadError,
  fetchCampaignPerformanceRows,
  shouldBatchCampaignMetrics,
  widenedSpanDays,
} from './campaign-performance-loader';

const manyCampaigns = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    name: `Camp ${i + 1}`,
    status: 'ENABLED',
  }));

/** Records every /api/paid-metrics request body so a fan-out cannot hide as a batch. */
function stubFetch(handler: (body: Record<string, unknown>) => unknown, ok = true) {
  const bodies: Array<Record<string, unknown>> = [];
  global.fetch = mock(async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    bodies.push(body);
    return { ok, json: async () => handler(body) } as Response;
  }) as unknown as typeof fetch;
  return bodies;
}

describe('widenedSpanDays', () => {
  it('adds the equal-length comparison window on both ends inclusive', () => {
    expect(widenedSpanDays({ preset: 'last_7d' })).toBe(16);
    expect(widenedSpanDays({ preset: 'last_14d' })).toBe(30);
    expect(widenedSpanDays({ preset: 'last_30d' })).toBe(62);
  });

  it('doubles an inclusive custom window', () => {
    expect(widenedSpanDays({ preset: 'custom', since: '2026-06-01', until: '2026-06-01' })).toBe(2);
    expect(widenedSpanDays({ preset: 'custom', since: '2026-06-01', until: '2026-06-10' })).toBe(
      20,
    );
  });
});

describe('shouldBatchCampaignMetrics', () => {
  const meta = { platform: 'meta' as const };

  it('keeps the one measured regression cell on the fan-out (N=11 over a 62-day span)', () => {
    // Measured: 2,795ms fan-out vs ~3,222ms batch. Batching here would be a slowdown.
    expect(
      shouldBatchCampaignMetrics({ ...meta, campaignCount: 11, range: { preset: 'last_30d' } }),
    ).toBe(false);
  });

  it('batches the cells where the batch measurably wins', () => {
    expect(
      shouldBatchCampaignMetrics({ ...meta, campaignCount: 11, range: { preset: 'last_7d' } }),
    ).toBe(true);
    expect(
      shouldBatchCampaignMetrics({ ...meta, campaignCount: 11, range: { preset: 'last_14d' } }),
    ).toBe(true);
    expect(
      shouldBatchCampaignMetrics({ ...meta, campaignCount: 26, range: { preset: 'last_30d' } }),
    ).toBe(true);
  });

  it('batches the 207-campaign account at every preset — a span-only gate would not have', () => {
    // The held fetch-meta-campaigns paging fix reveals 207 campaigns here. Fan-out: 28,245ms.
    for (const preset of ['last_7d', 'last_14d', 'last_30d'] as const) {
      expect(shouldBatchCampaignMetrics({ ...meta, campaignCount: 207, range: { preset } })).toBe(
        true,
      );
    }
  });

  it('never batches google-ads — campaign_daily_trends is a Meta-handler scope', () => {
    expect(
      shouldBatchCampaignMetrics({
        platform: 'google-ads',
        campaignCount: 207,
        range: { preset: 'last_7d' },
      }),
    ).toBe(false);
  });

  it('does not batch an empty universe', () => {
    expect(
      shouldBatchCampaignMetrics({ ...meta, campaignCount: 0, range: { preset: 'last_7d' } }),
    ).toBe(false);
  });
});

describe('fetchCampaignPerformanceRows', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    invokeMock.mockClear();
    universe = [{ id: 'c1', name: 'Camp 1', status: 'ENABLED' }];
    stubFetch(() => ({ metrics: {}, comparison: {}, trends: [] }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('invokes the Meta campaign function for the meta platform', async () => {
    await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: 'act_1',
      platform: 'meta',
      range: { preset: 'last_7d' },
    });

    const fnName = invokeMock.mock.calls[0][0] as string;
    expect(fnName.startsWith('paid-media-reporting/campaigns')).toBe(true);
  });

  it('surfaces the typed Edge error instead of the generic FunctionsHttpError message', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(
        new Response(
          JSON.stringify({
            error: 'Meta account lookup is temporarily unavailable.',
            errorCode: 'UPSTREAM_UNAVAILABLE',
            platform: 'meta',
            retryable: true,
            retryAfter: 30,
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    });

    const error = await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: 'act_1',
      platform: 'meta',
      range: { preset: 'last_7d' },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CampaignPerformanceLoadError);
    expect(error).toMatchObject({
      message: 'Meta account lookup is temporarily unavailable.',
      errorCode: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      retryAfter: 30,
      status: 503,
    });
  });

  it('invokes the Google Ads campaign function for the google-ads platform', async () => {
    await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: '123-456',
      platform: 'google-ads',
      range: { preset: 'last_7d' },
    });

    const fnName = invokeMock.mock.calls[0][0] as string;
    expect(fnName.startsWith('fetch-google-ads-campaigns')).toBe(true);
  });

  it('fires exactly ONE /api/paid-metrics call for a batched meta account', async () => {
    universe = manyCampaigns(26);
    const bodies = stubFetch(() => ({
      scope: 'campaign_daily_trends',
      range: { since: 'a', until: 'b', preset: 'last_7d' },
      campaigns: universe.map((c) => ({
        id: c.id,
        metrics: { spend: 5 },
        comparison: {},
        trends: [],
      })),
    }));

    const rows = await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: 'act_1',
      platform: 'meta',
      range: { preset: 'last_7d' },
    });

    expect(bodies).toHaveLength(1);
    expect(bodies[0].scope).toBe('campaign_daily_trends');
    expect(bodies[0].campaignId).toBeUndefined();
    expect(rows).toHaveLength(26);
    expect(rows[0].metrics?.spend).toBe(5);
  });

  it('still fans out per campaign for google-ads', async () => {
    universe = manyCampaigns(26);
    const bodies = stubFetch(() => ({ metrics: { spend: 1 }, comparison: {}, trends: [] }));

    await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: '123-456',
      platform: 'google-ads',
      range: { preset: 'last_7d' },
    });

    expect(bodies).toHaveLength(26);
    expect(bodies.every((b) => typeof b.campaignId === 'string')).toBe(true);
  });

  it('fans out when the gate rejects the batch (N=11 over a 62-day span)', async () => {
    universe = manyCampaigns(11);
    const bodies = stubFetch(() => ({ metrics: { spend: 1 }, comparison: {}, trends: [] }));

    await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: 'act_1',
      platform: 'meta',
      range: { preset: 'last_30d' },
    });

    expect(bodies).toHaveLength(11);
  });

  it('zero-fills a campaign the batch omits, so a non-delivering campaign renders as it does today', async () => {
    universe = manyCampaigns(26);
    stubFetch(() => ({
      scope: 'campaign_daily_trends',
      range: { since: 'a', until: 'b', preset: 'last_7d' },
      campaigns: [{ id: 'c1', metrics: { spend: 42 }, comparison: {}, trends: [{ date: 'd' }] }],
    }));

    const rows = await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: 'act_1',
      platform: 'meta',
      range: { preset: 'last_7d' },
    });

    const delivered = rows.find((r) => r.id === 'c1');
    const silent = rows.find((r) => r.id === 'c2');

    expect(delivered?.metrics?.spend).toBe(42);
    // Zeros, not undefined: the chart must show 0.00 here, not an em dash.
    expect(silent?.metrics?.spend).toBe(0);
    expect(silent?.metrics?.roas).toBe(0);
    expect(silent?.trends).toEqual([]);
    expect(silent?.comparison?.spend).toEqual({ current: 0, previous: 0, percentageChange: 0 });
  });

  it('leaves rows BARE when the batch request fails — a failed read is not zero delivery', async () => {
    universe = manyCampaigns(26);
    stubFetch(() => ({}), false);

    const rows = await fetchCampaignPerformanceRows({
      brandId: 'b1',
      adAccountId: 'act_1',
      platform: 'meta',
      range: { preset: 'last_7d' },
    });

    expect(rows).toHaveLength(26);
    expect(rows[0].metrics).toBeUndefined();
    expect(rows[0].trends).toBeUndefined();
  });
});
