import { beforeEach, describe, expect, it, mock } from 'bun:test';

let edgeResponse: unknown = {};

const invokeMock = mock(async (..._args: unknown[]) => ({ data: edgeResponse, error: null }));

mock.module('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ functions: { invoke: invokeMock } }),
}));

import { POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/paid-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const batchRequest = {
  brandId: 'b1',
  platform: 'meta',
  accountId: 'act_1',
  scope: 'campaign_daily_trends',
  range: { preset: 'last_7d' },
};

const batchPayload = {
  scope: 'campaign_daily_trends',
  range: { since: '2026-07-02', until: '2026-07-09', preset: 'last_7d' },
  campaigns: [
    {
      id: 'c1',
      metrics: { spend: 10, roas: 2, impressions: 100, clicks: 10, ctr: 10, cpc: 1 },
      comparison: {},
      trends: [{ date: '2026-07-02', spend: 10, roas: 2 }],
    },
  ],
};

const singlePayload = {
  metrics: { spend: 10, roas: 2, impressions: 100, clicks: 10, ctr: 10, cpc: 1 },
  comparison: {},
  trends: [{ date: '2026-07-02', spend: 10, roas: 2 }],
  range: { since: '2026-07-02', until: '2026-07-09', preset: 'last_7d' },
};

describe('POST /api/paid-metrics', () => {
  beforeEach(() => invokeMock.mockClear());

  it('accepts the campaign_daily_trends scope and validates it as a batch', async () => {
    edgeResponse = batchPayload;
    const response = await post(batchRequest);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.campaigns).toHaveLength(1);
    expect(invokeMock.mock.calls[0][0]).toBe('paid-media-reporting/metrics');
  });

  it('502s when an edge without the scope answers with an account_overview payload', async () => {
    // The deployed edge really does this: scope=campaign_daily_trends normalizes to undefined,
    // falls through to inferred account_overview, and returns top-level metrics/trends. Painting
    // that onto every campaign row is the silent-wrong render this branch exists to prevent.
    edgeResponse = { scope: 'account_overview', ...singlePayload };
    const response = await post(batchRequest);

    expect(response.status).toBe(502);
  });

  it('still validates a legacy per-campaign payload against the single-entity schema', async () => {
    edgeResponse = singlePayload;
    const response = await post({
      brandId: 'b1',
      platform: 'meta',
      accountId: 'act_1',
      campaignId: 'c1',
      range: { preset: 'last_7d' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metrics.spend).toBe(10);
  });

  it('200s a Google campaign whose result basis is ambiguous, CPA null and the basis kept', async () => {
    // The deployed Google edge answers an ambiguous basis with these nulls (handler.ts daily
    // scopes); the route used to 502 them as "Invalid response format from backend".
    edgeResponse = {
      scope: 'campaign',
      currency: 'MXN',
      metrics: {
        spend: 812.3,
        roas: 0,
        impressions: 20110,
        clicks: 640,
        ctr: 3.1825,
        cpc: 1.2692,
        cpa: null,
      },
      result_basis: { rule: 'google_conversion_rule_v1', bucket: null, unambiguous: false },
      limitations: [
        'Current conversion-action metadata is applied to historical windows; historical goal-setting changes are not reconstructed.',
      ],
      coverage: {
        requested: { since: '2026-10-20', until: '2026-10-26' },
        read: { since: '2026-10-20', until: '2026-10-26' },
        truncated: false,
        reason: null,
      },
      comparison: {
        spend: { current: 812.3, previous: 700, percentageChange: 16.0429 },
        cpa: null,
      },
      trends: [
        {
          date: '2026-10-20',
          spend: 120.5,
          clicks: 95,
          impressions: 3010,
          conversions: null,
          roas: 0,
          cpa: null,
        },
      ],
      range: { since: '2026-10-20', until: '2026-10-26', preset: 'last_7d' },
      previous_range: { since: '2026-10-13', until: '2026-10-19' },
    };
    const response = await post({
      brandId: 'b1',
      platform: 'google-ads',
      accountId: '3710693645',
      campaignId: '2211',
      range: { preset: 'last_7d' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metrics.cpa).toBeNull();
    expect(body.trends[0].cpa).toBeNull();
    expect(body.comparison.cpa).toBeUndefined();
    expect(body.comparison.spend.percentageChange).toBe(16.0429);
    expect(body.result_basis).toEqual({
      rule: 'google_conversion_rule_v1',
      bucket: null,
      unambiguous: false,
    });
  });

  it('400s an unknown scope before it ever reaches the edge', async () => {
    edgeResponse = batchPayload;
    const response = await post({ ...batchRequest, scope: 'not_a_scope' });

    expect(response.status).toBe(400);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
