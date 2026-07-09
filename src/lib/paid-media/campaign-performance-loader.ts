'use client';

import type {
  CampaignPerformanceMetrics,
  CampaignPerformanceRow,
  PaidMediaPlatform,
} from '@/lib/paid-media/performance-types';
import type { PaidCampaignDailyTrendsResponse, PaidMetricsRange } from '@/lib/schemas/paidMetrics';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type CampaignPerformanceParams = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  range: PaidMetricsRange;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const PRESET_DAYS: Record<string, number> = {
  last_7d: 7,
  last_14d: 14,
  last_30d: 30,
};

/**
 * The window the edge actually scans: the selected range plus an equal preceding window for
 * the period-over-period comparison, both ends inclusive. `last_7d` is 8 + 8 = 16 days.
 */
export function widenedSpanDays(range: PaidMetricsRange): number {
  if (range.preset === 'custom') {
    const since = new Date(`${range.since}T00:00:00.000Z`).getTime();
    const until = new Date(`${range.until}T00:00:00.000Z`).getTime();
    const inclusive = Math.max(1, Math.round((until - since) / DAY_MS) + 1);
    return inclusive * 2;
  }
  return (PRESET_DAYS[range.preset] + 1) * 2;
}

/**
 * One edge invocation costs roughly what four one-day Graph shards cost.
 *
 * The two paths have different cost curves: the fan-out pays an edge invocation PER CAMPAIGN,
 * the batch pays a Graph request PER SHARD-DAY. So the batch wins on wide campaign sets and
 * short windows, and loses on narrow sets over long windows. Measured, cold, through the real
 * edge (docs/adr/fetch-latency-baseline-2026-07-09.md §7):
 *
 *   N=11,  16d   2,141ms fan-out   vs ~1,552ms batch    batch
 *   N=11,  30d   2,135ms fan-out   vs ~1,860ms batch    batch
 *   N=11,  62d   2,795ms fan-out   vs ~3,222ms batch    FAN-OUT (the one regression cell)
 *   N=26,  16d   4,811ms fan-out   vs ~1,358ms batch    batch
 *   N=26,  62d   4,754ms fan-out   vs ~4,326ms batch    batch
 *   N=207, 16d  28,245ms fan-out   vs ~1,431ms batch    batch
 *
 * A span-only gate would have kept N=207/last_30d on the 28-second fan-out. The gate has to
 * see both terms.
 */
const SHARD_DAYS_PER_EDGE_CALL = 4;

export function shouldBatchCampaignMetrics(args: {
  platform: PaidMediaPlatform;
  campaignCount: number;
  range: PaidMetricsRange;
}): boolean {
  // `campaign_daily_trends` is a Meta-handler scope; google-ads has no equivalent.
  if (args.platform !== 'meta') return false;
  if (args.campaignCount === 0) return false;
  return args.campaignCount * SHARD_DAYS_PER_EDGE_CALL >= widenedSpanDays(args.range);
}

/** What the edge returns for a campaign with no delivery: zeros, not absence. A campaign the
 *  batch omits never delivered, so it must render exactly as it does today — `0.00`, not `—`. */
const ZERO_METRICS: CampaignPerformanceMetrics = {
  spend: 0,
  roas: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  cpc: 0,
  cpa: 0,
  gaSessions: 0,
  gaConversions: 0,
};

const ZERO_COMPARISON = Object.fromEntries(
  ['spend', 'roas', 'impressions', 'clicks', 'ctr', 'cpc', 'cpa'].map((key) => [
    key,
    { current: 0, previous: 0, percentageChange: 0 },
  ]),
);

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>,
): Promise<U[]> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  const results = new Array<U>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: safeLimit }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index]);
      }
    }),
  );

  return results;
}

async function fetchCampaignUniverse(
  params: CampaignPerformanceParams,
): Promise<CampaignPerformanceRow[]> {
  const supabase = createSupabaseBrowserClient();
  const campaignsFunction =
    params.platform === 'google-ads'
      ? 'fetch-google-ads-campaigns'
      : 'paid-media-reporting/campaigns';
  const { data, error } = await supabase.functions.invoke(
    `${campaignsFunction}?brandId=${params.brandId}&adAccountId=${params.adAccountId}&platform=${params.platform}`,
    {
      method: 'POST',
      body: {
        platform: params.platform,
        brandId: params.brandId,
        adAccountId: params.adAccountId,
      },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data?.campaigns) ? (data.campaigns as CampaignPerformanceRow[]) : [];
}

/** One call for every campaign. Returns null when the request fails, so the caller can leave
 *  rows bare (no data) rather than zero-filling them (delivered nothing) — a real difference. */
async function fetchCampaignBatch(
  params: CampaignPerformanceParams,
): Promise<PaidCampaignDailyTrendsResponse | null> {
  try {
    const response = await fetch('/api/paid-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: params.platform,
        brandId: params.brandId,
        accountId: params.adAccountId,
        scope: 'campaign_daily_trends',
        range: params.range,
      }),
    });

    if (!response.ok) return null;
    return (await response.json()) as PaidCampaignDailyTrendsResponse;
  } catch {
    return null;
  }
}

async function fetchPerCampaign(
  params: CampaignPerformanceParams,
  campaigns: CampaignPerformanceRow[],
): Promise<CampaignPerformanceRow[]> {
  return mapWithConcurrency(campaigns, 6, async (campaign) => {
    try {
      const response = await fetch('/api/paid-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: params.platform,
          brandId: params.brandId,
          accountId: params.adAccountId,
          campaignId: campaign.id,
          range: params.range,
        }),
      });

      if (!response.ok) return campaign;

      const metrics = await response.json();
      return {
        ...campaign,
        metrics: metrics.metrics,
        comparison: metrics.comparison,
        trends: metrics.trends,
      };
    } catch {
      return campaign;
    }
  });
}

export async function fetchCampaignPerformanceRows(
  params: CampaignPerformanceParams,
): Promise<CampaignPerformanceRow[]> {
  const rawCampaigns = await fetchCampaignUniverse(params);

  if (!shouldBatchCampaignMetrics({ ...params, campaignCount: rawCampaigns.length })) {
    return fetchPerCampaign(params, rawCampaigns);
  }

  const batch = await fetchCampaignBatch(params);
  if (!batch) return rawCampaigns;

  const byId = new Map(batch.campaigns.map((campaign) => [campaign.id, campaign]));
  return rawCampaigns.map((campaign) => {
    const measured = byId.get(campaign.id);
    return {
      ...campaign,
      metrics: measured?.metrics ?? ZERO_METRICS,
      comparison: measured?.comparison ?? ZERO_COMPARISON,
      trends: measured?.trends ?? [],
    };
  });
}
