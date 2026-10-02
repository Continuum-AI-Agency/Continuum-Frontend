// The Google tab's figures, composed from two real reads of the paid-media-metrics edge
// (platform 'google-ads'): `account_overview` for the account's spend against the window before,
// and `top_campaigns` for each campaign's spend and conversions with its channel type. Money
// arrives in MAJOR units — the handler's compute divides cost_micros by 1e6 — so nothing here
// divides again. Nothing is synthesised: a figure the reads did not carry is absent, never zero.
//
// The tiles follow the O1 rules (docs/performance-plus-redesign/overview.html) and MP2
// (docs/optimizer-multiplatform/frontend.html §2): four to six, each naming its entity, its
// figure and what that figure is compared with; grouped by campaign type — Search, Performance
// Max, YouTube/Demand Gen — because that is the unit a Google buyer decides in.

import { z } from 'zod';
import type { FigureWindow } from '../../format';

const ComparisonValueSchema = z.object({
  current: z.number(),
  previous: z.number(),
  percentageChange: z.number().nullable().optional(),
});

const RangeSchema = z.object({ since: z.string(), until: z.string() });

export const GoogleAccountOverviewSchema = z.object({
  metrics: z.object({
    spend: z.number(),
    impressions: z.number(),
    clicks: z.number(),
    ctr: z.number(),
    cpa: z.number(),
  }),
  comparison: z.object({ spend: ComparisonValueSchema }).partial().optional(),
  range: RangeSchema,
});
export type GoogleAccountOverview = z.infer<typeof GoogleAccountOverviewSchema>;

export const GoogleTopCampaignsSchema = z.object({
  rows: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      labels: z.record(z.string(), z.string()).optional(),
      metrics: z.object({
        spend: z.number(),
        impressions: z.number(),
        clicks: z.number(),
        conversions: z.number(),
      }),
    }),
  ),
  range: RangeSchema,
});
export type GoogleTopCampaigns = z.infer<typeof GoogleTopCampaignsSchema>;

export type CampaignTypeKey = 'search' | 'pmax' | 'video' | 'display' | 'shopping' | 'other';

const CAMPAIGN_TYPE_LABELS: Record<CampaignTypeKey, string> = {
  search: 'Search',
  pmax: 'Performance Max',
  video: 'YouTube / Demand Gen',
  display: 'Display',
  shopping: 'Shopping',
  other: 'Other campaigns',
};

/** Google's `advertising_channel_type` → the group a tile is about. YouTube video and Demand
 *  Gen share a tile: Demand Gen is where Google moved YouTube's conversion inventory. */
export function campaignTypeOf(channelType: string | undefined): CampaignTypeKey | null {
  if (!channelType) return null;
  switch (channelType) {
    case 'SEARCH':
      return 'search';
    case 'PERFORMANCE_MAX':
      return 'pmax';
    case 'VIDEO':
    case 'DEMAND_GEN':
    case 'DISCOVERY':
      return 'video';
    case 'DISPLAY':
      return 'display';
    case 'SHOPPING':
      return 'shopping';
    default:
      return 'other';
  }
}

export type CampaignGroup = {
  key: string;
  /** The entity the tile names: a campaign type, or one campaign when the read carried no type. */
  label: string;
  campaigns: number;
  spend: number;
  conversions: number;
  impressions: number;
  /** Share of the Google spend in the window, 0–100. */
  sharePct: number;
};

export type GoogleOverview = {
  since: string;
  until: string;
  days: number;
  spend: number;
  /** Null when the prior-window read came back empty or failed — there is nothing to compare. */
  priorSpend: number | null;
  conversions: number;
  costPerConversion: number | null;
  clicks: number;
  ctr: number;
  /** True when every spending campaign carried its channel type, so the tiles are by type. */
  byType: boolean;
  groups: CampaignGroup[];
};

function daysBetween(since: string, until: string): number {
  const ms = Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) + 1 : 0;
}

/** The provenance window a figure was measured over, for `figureProps`. */
export function figureWindowOf(days: number): FigureWindow {
  if (days === 7 || days === 8) return 'd7';
  if (days === 14 || days === 15) return 'd14';
  if (days === 30 || days === 31) return 'd30';
  return 'none';
}

/**
 * Folds the two reads into the tab's figures. Campaigns are grouped by type when the edge
 * reported one for every campaign that spent; otherwise each campaign is its own entity, because
 * guessing a type from a campaign's name is exactly the synthesis this page refuses.
 */
export function buildGoogleOverview(
  account: GoogleAccountOverview,
  campaigns: GoogleTopCampaigns,
): GoogleOverview {
  const spending = campaigns.rows.filter((row) => row.metrics.spend > 0);
  const byType =
    spending.length > 0 && spending.every((row) => campaignTypeOf(row.labels?.channel_type));
  const totalSpend = account.metrics.spend;

  const groups = new Map<string, CampaignGroup>();
  for (const row of spending) {
    const type = byType ? campaignTypeOf(row.labels?.channel_type) : null;
    const key = type ?? `campaign:${row.id}`;
    const group = groups.get(key) ?? {
      key,
      label: type ? CAMPAIGN_TYPE_LABELS[type] : row.name,
      campaigns: 0,
      spend: 0,
      conversions: 0,
      impressions: 0,
      sharePct: 0,
    };
    group.campaigns += 1;
    group.spend += row.metrics.spend;
    group.conversions += row.metrics.conversions;
    group.impressions += row.metrics.impressions;
    groups.set(key, group);
  }
  const ordered = [...groups.values()]
    .map((group) => ({
      ...group,
      sharePct: totalSpend > 0 ? Math.round((group.spend / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  const conversions = spending.reduce((sum, row) => sum + row.metrics.conversions, 0);
  const prior = account.comparison?.spend?.previous;
  return {
    since: account.range.since,
    until: account.range.until,
    days: daysBetween(account.range.since, account.range.until),
    spend: totalSpend,
    priorSpend: prior != null && prior > 0 ? prior : null,
    conversions,
    costPerConversion: conversions > 0 ? totalSpend / conversions : null,
    clicks: account.metrics.clicks,
    ctr: account.metrics.ctr,
    byType,
    groups: ordered,
  };
}

/** Room for six tiles: spend, conversions, and up to four campaign groups. */
export const MAX_GROUP_TILES = 4;
/** O1's floor. Under it, the clicks tile fills in rather than leaving a half-empty row. */
export const MIN_TILES = 4;

export function costPerConversion(group: CampaignGroup): number | null {
  return group.conversions > 0 ? group.spend / group.conversions : null;
}

/** Signed % of `value` against `base`, rounded; null when there is no base to compare with. */
export function percentAgainst(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base === 0) return null;
  return Math.round(((value - base) / base) * 100);
}

/** Conversions are fractional in Google (data-driven attribution splits them). */
export function formatConversions(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** "Sep 1 – Sep 30" from the read's own window. */
export function windowRangeLabel(since: string, until: string): string {
  const format = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${format(since)} – ${format(until)}`;
}
