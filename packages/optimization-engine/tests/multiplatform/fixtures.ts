// Builders that turn the recorded multiplatform fixtures into the shapes the engine reads.
// Every Google and TikTok entity goes through MultiPlatformSnapshotSchema.parse, so a
// builder that drifts from the BE1 contract fails here, not in a scenario.
//
// Where a fixture lacks a figure the builder says so instead of inventing it:
//  - TikTok has 7-day, 14-day and today reports but no 3-day one: d3 carries the d7 read
//    (TIKTOK_D3_FROM_D7), and no scenario asserts on a TikTok d3.
//  - The Meta portfolio fixtures hold per-ad-set engine diagnostics, not raw windows: the
//    Meta leg of G27 is priced on the portfolio's own d7 series (optimizer_get_cpa_series).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type BudgetRef,
  fromPlatformBudget,
  type MultiPlatformSnapshot,
  MultiPlatformSnapshotSchema,
  type MultiPlatformWindowMetrics,
} from '@continuum/contracts';
import type { CrossPlatformMember, DeliveryState } from '../../src';

export const FIXTURE_DIR = join(import.meta.dir, '../fixtures/multiplatform');
/** The recording's "today": every fixture was read on 2026-10-01. */
export const AS_OF = '2026-10-01';
export const TIKTOK_D3_FROM_D7 = true;

type Fixture<T = unknown> = { _source: Record<string, unknown>; data: T };

export function loadFixture<T = unknown>(file: string): Fixture<T> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8')) as Fixture<T>;
}

const DAY_MS = 86_400_000;
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.floor((to - from) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Google (REAL, GAQL v25)
// ---------------------------------------------------------------------------

type GaqlCampaignRow = {
  campaign: {
    id: string;
    name: string;
    status: string;
    primaryStatus?: string;
    primaryStatusReasons?: string[];
    advertisingChannelType: string;
    biddingStrategyType: string;
    biddingStrategySystemStatus?: string;
    campaignBudget: string;
  };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    searchBudgetLostImpressionShare?: number;
  };
};
type GaqlBudgetRow = {
  campaignBudget: {
    id: string;
    amountMicros?: string;
    explicitlyShared: boolean;
    referenceCount?: string;
    period: string;
  };
};
type GaqlDailyRow = {
  campaign: { id: string };
  segments: { date: string };
  metrics: {
    costMicros: string;
    impressions: string;
    clicks: string;
    conversions: number;
    searchBudgetLostImpressionShare?: number;
  };
};

export type GoogleCampaign = {
  snapshot: MultiPlatformSnapshot;
  channelType: string;
  status: string;
};

type Window = MultiPlatformWindowMetrics;

function googleWindow(rows: GaqlDailyRow[]): Window {
  const spend = rows.reduce((acc, r) => acc + Number(r.metrics.costMicros), 0) / 1_000_000;
  const lost = rows
    .map((r) => r.metrics.searchBudgetLostImpressionShare)
    .filter((v): v is number => typeof v === 'number');
  return {
    spend,
    purchases: 0,
    addToCarts: 0,
    clicks: rows.reduce((acc, r) => acc + Number(r.metrics.clicks), 0),
    impressions: rows.reduce((acc, r) => acc + Number(r.metrics.impressions), 0),
    leads: rows.reduce((acc, r) => acc + r.metrics.conversions, 0),
    ...(lost.length > 0
      ? { delivery: { budgetLostImpressionShare: lost.reduce((a, b) => a + b, 0) / lost.length } }
      : {}),
  };
}

function since(rows: GaqlDailyRow[], fromIso: string): GaqlDailyRow[] {
  return rows.filter((r) => r.segments.date >= fromIso);
}

/**
 * One MultiPlatformSnapshot per campaign of a recorded Google customer.
 *
 * Windows come from the 14-day daily read (GAQL omits days with no activity, so a missing
 * day is a zero day). Without a daily file, the 30-day totals must be all zero — a 30-day
 * zero is a zero in every window inside it — and anything else throws rather than guess.
 */
export function googleCampaigns(prefix: 'vivo47' | 'easyfit2026' | 'tangassi'): GoogleCampaign[] {
  const customer = loadFixture<{ customer: { id: string; currencyCode: string } }[]>(
    `google-${prefix}-customer.json`,
  ).data[0]!.customer;
  const currency = customer.currencyCode;
  const campaigns = loadFixture<GaqlCampaignRow[]>(`google-${prefix}-campaigns30d.json`).data;
  const budgets = new Map(
    loadFixture<GaqlBudgetRow[]>(`google-${prefix}-budgets.json`).data.map((r) => [
      r.campaignBudget.id,
      r.campaignBudget,
    ]),
  );
  let daily: GaqlDailyRow[] | null = null;
  try {
    daily = loadFixture<GaqlDailyRow[]>(`google-${prefix}-campaignDaily14d.json`).data;
  } catch {
    daily = null;
  }

  return campaigns.map((row) => {
    const c = row.campaign;
    const budgetId = c.campaignBudget.split('/').pop()!;
    const budget = budgets.get(budgetId);
    if (!budget) throw new Error(`no budget ${budgetId} for campaign ${c.id}`);
    let windows: MultiPlatformSnapshot['windows'];
    if (daily) {
      const rows = daily.filter((r) => r.campaign.id === c.id);
      windows = {
        d3: googleWindow(since(rows, '2026-09-28')),
        d7: googleWindow(since(rows, '2026-09-24')),
        d14: googleWindow(since(rows, '2026-09-17')),
      };
    } else {
      const m = row.metrics ?? {};
      const total = Number(m.costMicros ?? 0) + Number(m.impressions ?? 0) + (m.conversions ?? 0);
      if (total !== 0) throw new Error(`campaign ${c.id} has 30-day activity and no daily read`);
      const zero = googleWindow([]);
      windows = { d3: zero, d7: zero, d14: zero };
    }
    const ownerRef = {
      platform: 'google_ads' as const,
      level: 'campaign' as const,
      nativeLevel: 'campaign' as const,
      id: c.id,
      accountId: customer.id,
      name: c.name,
    };
    const budgetRef: BudgetRef = {
      kind: budget.period === 'DAILY' ? 'daily' : 'total',
      minor: fromPlatformBudget('google_ads', Number(budget.amountMicros ?? 0), currency),
      currency,
      shared: budget.explicitlyShared,
      ownerRef,
      nativeBudgetId: budget.id,
    };
    const snapshot = MultiPlatformSnapshotSchema.parse({
      platform: 'google_ads',
      level: 'campaign',
      native_level: 'campaign',
      id: c.id,
      accountId: customer.id,
      name: c.name,
      campaignId: c.id,
      automation: c.advertisingChannelType === 'PERFORMANCE_MAX' ? 'pmax' : 'manual',
      budget: budgetRef,
      bidding: {
        strategyType: c.biddingStrategyType,
        ...(c.biddingStrategySystemStatus ? { systemStatus: c.biddingStrategySystemStatus } : {}),
      },
      ...(c.primaryStatus ? { primaryStatus: c.primaryStatus } : {}),
      ...(c.primaryStatusReasons ? { primaryStatusReasons: c.primaryStatusReasons } : {}),
      windows,
    });
    return { snapshot, channelType: c.advertisingChannelType, status: c.status };
  });
}

export function googleCampaign(
  prefix: Parameters<typeof googleCampaigns>[0],
  id: string,
): GoogleCampaign {
  const found = googleCampaigns(prefix).find((c) => c.snapshot.id === id);
  if (!found) throw new Error(`no Google campaign ${id} in ${prefix}`);
  return found;
}

// ---------------------------------------------------------------------------
// TikTok (DOC_SHAPED, not live)
// ---------------------------------------------------------------------------

type TikTokAdGroup = {
  advertiser_id: string;
  adgroup_id: string;
  adgroup_name: string;
  campaign_id: string;
  campaign_automation_type: string;
  optimization_goal: string;
  budget_mode: string;
  budget: number;
  click_attribution_window: string;
  view_attribution_window: string;
  create_time: string;
  modify_time: string;
};
type TikTokReportRow = {
  dimensions: { adgroup_id: string };
  metrics: {
    spend: string;
    impressions?: string;
    clicks?: string;
    result?: string;
    currency: string;
  };
};
type TikTokList<T> = { data: { data: { list: T[] } } };

const TIKTOK_CURRENCY = 'MXN';

function tiktokReport(file: string): Map<string, TikTokReportRow['metrics']> {
  const rows = loadFixture<TikTokList<TikTokReportRow>['data']>(file).data.data.list;
  return new Map(rows.map((r) => [r.dimensions.adgroup_id, r.metrics]));
}

function tiktokWindow(m: TikTokReportRow['metrics'], kpi: 'leads' | 'conversations'): Window {
  return {
    spend: Number(m.spend),
    purchases: 0,
    addToCarts: 0,
    clicks: Number(m.clicks ?? 0),
    impressions: Number(m.impressions ?? 0),
    [kpi]: Number(m.result ?? 0),
  };
}

/** platform_objective_map for the TikTok goals these fixtures use. ENGAGEMENT · MESSAGE is
 *  still marked "to verify" (portafolio-modelo §B.3), so CONVERSATION has no row: null. */
export function tiktokKpiField(goal: string): 'leads' | null {
  return goal === 'LEAD_GENERATION' ? 'leads' : null;
}

export type TikTokAdGroupRead = {
  snapshot: MultiPlatformSnapshot;
  ageDays: number;
  daysSinceModified: number;
  spendToday: number | null;
  attributionMatches: boolean;
  kpiField: 'leads' | null;
};

export function tiktokAdGroups(): TikTokAdGroupRead[] {
  const groups =
    loadFixture<TikTokList<TikTokAdGroup>['data']>('tiktok-adgroup-get.json').data.data.list;
  const campaigns = new Map(
    loadFixture<TikTokList<{ campaign_id: string; budget: number; budget_mode: string }>['data']>(
      'tiktok-campaign-get.json',
    ).data.data.list.map((c) => [c.campaign_id, c]),
  );
  const d7 = tiktokReport('tiktok-report-adgroup-7d.json');
  const d14 = tiktokReport('tiktok-report-adgroup-14d.json');
  const today = tiktokReport('tiktok-report-adgroup-today.json');
  return groups.map((g) => {
    const kpiField = tiktokKpiField(g.optimization_goal);
    const kpi = kpiField ?? 'conversations';
    const automation =
      g.campaign_automation_type === 'UPGRADED_SMART_PLUS' ? 'upgraded_smart_plus' : 'manual';
    // A group without a daily budget of its own spends its campaign's (CBO / Smart+).
    const ownBudget = g.budget_mode === 'BUDGET_MODE_DAY';
    const campaign = campaigns.get(g.campaign_id)!;
    const ownerRef = ownBudget
      ? {
          platform: 'tiktok_ads' as const,
          level: 'group' as const,
          nativeLevel: 'ad_group' as const,
          id: g.adgroup_id,
          accountId: g.advertiser_id,
          name: g.adgroup_name,
        }
      : {
          platform: 'tiktok_ads' as const,
          level: 'campaign' as const,
          nativeLevel: 'campaign' as const,
          id: g.campaign_id,
          accountId: g.advertiser_id,
        };
    const w7 = tiktokWindow(d7.get(g.adgroup_id)!, kpi);
    const snapshot = MultiPlatformSnapshotSchema.parse({
      platform: 'tiktok_ads',
      level: 'group',
      native_level: 'ad_group',
      id: g.adgroup_id,
      accountId: g.advertiser_id,
      name: g.adgroup_name,
      campaignId: g.campaign_id,
      automation,
      budget: {
        kind: 'daily',
        minor: fromPlatformBudget(
          'tiktok_ads',
          ownBudget ? g.budget : campaign.budget,
          TIKTOK_CURRENCY,
        ),
        currency: TIKTOK_CURRENCY,
        shared: false,
        ownerRef,
      },
      bidding: { strategyType: 'BID_TYPE_NO_BID' },
      windows: {
        d3: w7, // TIKTOK_D3_FROM_D7: no 3-day report exists in the fixtures.
        d7: w7,
        d14: tiktokWindow(d14.get(g.adgroup_id)!, kpi),
      },
    });
    const spend = today.get(g.adgroup_id);
    return {
      snapshot,
      ageDays: daysBetween(g.create_time, AS_OF),
      daysSinceModified: daysBetween(g.modify_time, AS_OF),
      spendToday: spend ? Number(spend.spend) : null,
      attributionMatches:
        g.click_attribution_window === 'SEVEN_DAYS' && g.view_attribution_window === 'ONE_DAY',
      kpiField,
    };
  });
}

export function tiktokAdGroup(id: string): TikTokAdGroupRead {
  const found = tiktokAdGroups().find((g) => g.snapshot.id === id);
  if (!found) throw new Error(`no TikTok ad group ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// Meta (REAL, prod read RPCs)
// ---------------------------------------------------------------------------

export type MetaItem = {
  adset_id: string;
  adset_name: string;
  current_budget: number;
  final_budget: number;
  diagnostics: {
    status: string;
    currentBudget: number;
    finalBudget: number;
    freezeReason?: string;
    score3d: number;
    score7d: number;
    score14d: number;
    trajectoryState: string;
    ci: { cpa: number; events: number; lo: number; hi: number | null };
    delivery?: { state: DeliveryState; learningStage: string | null };
  };
};
export type MetaPortfolio = {
  portfolio: {
    id: string;
    objective: string;
    mode: string;
    apply_mode: string;
    autopilot_paused: boolean;
    autopilot_scopes: Record<string, boolean>;
    daily_total: number;
    cpa_target: number | null;
    currency: string;
  };
  performance: {
    latest_run: { total_budget: number; pool: number; mode: string } | null;
    latest_items: MetaItem[];
    recommendations: { trigger: string; adset_id: string; adset_name: string; reason: string }[];
  };
  cpaSeries: {
    conv_d7: number;
    spend_d7: number;
    conv_d14: number;
    spend_d14: number;
    cycle_ts: string;
  }[];
};

export function metaPortfolio(slug: string): MetaPortfolio {
  return loadFixture<MetaPortfolio>(`meta-easyfit-portfolio-${slug}.json`).data;
}

/** The portfolio's own d7, as optimizer_get_cpa_series returns it for the latest cycle. */
export function metaPortfolioD7(p: MetaPortfolio): { spend: number; results: number } {
  const latest = p.cpaSeries[p.cpaSeries.length - 1]!;
  return { spend: latest.spend_d7, results: latest.conv_d7 };
}

/** A Meta ad set as G27 sees it, read off the engine's own recorded diagnostics. */
export function metaMember(item: MetaItem): CrossPlatformMember {
  const g = item.diagnostics;
  return {
    id: item.adset_id,
    name: item.adset_name,
    currentBudget: g.currentBudget,
    d7: null, // not in the fixture; the leg is priced on metaPortfolioD7
    costPerResult: g.ci.events > 0 ? g.ci.cpa : null,
    ageDays: null, // not in the fixture
    frozen: g.status === 'frozen' || g.freezeReason != null,
    starved: g.status === 'starved',
    learning: g.status === 'learning',
    learningLimited: g.delivery?.learningStage === 'LEARNING_LIMITED',
    deliveryState: g.delivery?.state ?? null,
    daysSinceBudgetChange: null,
    attributionMatches: true,
    spendToday: null,
  };
}
