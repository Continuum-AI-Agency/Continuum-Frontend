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

import {
  GOOGLE_RESULT_BUCKETS,
  type GoogleAccountOverview,
  GoogleAccountOverviewSchema,
  type GoogleResultBucket,
  type GoogleResultCounts,
  type GoogleTopCampaigns,
  GoogleTopCampaignsSchema,
} from '@continuum/contracts';
import type { FigureWindow } from '../../format';

// The two reads' shapes are contracts (paid/google-tab), shared with the tab's own views.
export {
  type GoogleAccountOverview,
  GoogleAccountOverviewSchema,
  type GoogleTopCampaigns,
  GoogleTopCampaignsSchema,
};

export type CampaignTypeKey = 'search' | 'pmax' | 'video' | 'display' | 'shopping' | 'other';

export const CAMPAIGN_TYPE_LABELS: Record<CampaignTypeKey, string> = {
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
  /** Null when no single result is defined for the account (see `resultsDefined`). */
  conversions: number | null;
  /** Each business result counted apart; null when a campaign's read lacks them. */
  byResult: GoogleResultCounts | null;
  impressions: number;
  /** Share of the Google spend in the window, 0–100. */
  sharePct: number;
};

export type GoogleOverview = {
  /** The code the read carried, or null: the tab then says once that the currency is unknown. */
  currency: string | null;
  since: string;
  until: string;
  days: number;
  spend: number;
  /** Null when the prior-window read came back empty or failed — there is nothing to compare. */
  priorSpend: number | null;
  /** False when the account's goals name no single business result, so the edge counted none:
   *  conversions and every cost per conversion are null, never zero. */
  resultsDefined: boolean;
  conversions: number | null;
  costPerConversion: number | null;
  /** With no single result, the result types counted apart, one column each (resultTypesOf). */
  resultTypes: GoogleResultBucket[];
  /** The account's spending campaigns' results, counted apart. */
  byResult: GoogleResultCounts | null;
  clicks: number;
  ctr: number;
  /** True when every spending campaign carried its channel type, so the tiles are by type. */
  byType: boolean;
  groups: CampaignGroup[];
};

/** The currency code a read carries, upper-cased; null when it carries none. */
export function googleCurrencyOf(
  read: { currency?: string | null; currency_code?: string | null } | null | undefined,
): string | null {
  const code = (read?.currency ?? read?.currency_code ?? '').trim().toUpperCase();
  return code === '' ? null : code;
}

/**
 * The `days` complete UTC days ending yesterday — the window the multi-platform producer
 * (optimizer_get_account_platform_metrics) reads. The edge's own `last_7d` runs to TODAY and
 * covers eight days, so a header and a breakdown read that way could never agree.
 */
export function completeDaysWindow(
  days: number,
  now: Date = new Date(),
): {
  since: string;
  until: string;
} {
  const DAY = 86_400_000;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { since: iso(today - days * DAY), until: iso(today - DAY) };
}

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
  const resultsDefined =
    account.result_basis?.unambiguous !== false &&
    campaigns.result_basis?.unambiguous !== false &&
    spending.every((row) => row.metrics.conversions != null);

  const groups = new Map<string, CampaignGroup>();
  for (const row of spending) {
    const type = byType ? campaignTypeOf(row.labels?.channel_type) : null;
    const key = type ?? `campaign:${row.id}`;
    const group = groups.get(key) ?? {
      key,
      label: type ? CAMPAIGN_TYPE_LABELS[type] : row.name,
      campaigns: 0,
      spend: 0,
      conversions: resultsDefined ? 0 : null,
      byResult: {},
      impressions: 0,
      sharePct: 0,
    };
    group.campaigns += 1;
    group.spend += row.metrics.spend;
    if (group.conversions != null) group.conversions += row.metrics.conversions ?? 0;
    group.byResult = addResults(group.byResult, row.metrics.byResult);
    group.impressions += row.metrics.impressions;
    groups.set(key, group);
  }
  const ordered = [...groups.values()]
    .map((group) => ({
      ...group,
      sharePct: totalSpend > 0 ? Math.round((group.spend / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  const conversions = resultsDefined
    ? spending.reduce((sum, row) => sum + (row.metrics.conversions ?? 0), 0)
    : null;
  const prior = account.comparison?.spend?.previous;
  return {
    currency: googleCurrencyOf(account) ?? googleCurrencyOf(campaigns),
    since: account.range.since,
    until: account.range.until,
    days: daysBetween(account.range.since, account.range.until),
    spend: totalSpend,
    priorSpend: prior != null && prior > 0 ? prior : null,
    resultsDefined,
    conversions,
    costPerConversion: conversions != null && conversions > 0 ? totalSpend / conversions : null,
    resultTypes: resultsDefined ? [] : resultTypesOf(spending.map((row) => row.metrics)),
    byResult: spending.reduce<GoogleResultCounts | null>(
      (sum, row) => addResults(sum, row.metrics.byResult),
      {},
    ),
    clicks: account.metrics.clicks,
    ctr: account.metrics.ctr,
    byType,
    groups: ordered,
  };
}

/** Said wherever a conversion count or its cost would sit when the account has no single result. */
export const NO_SINGLE_RESULT = 'No single result defined';

// ── No single result: each result type apart (Ramiro, 2026-10-28) ──────────────────────────
// The tab counts its portfolios' goal result. With no portfolio goal and campaigns whose goals
// name several, each result type gets its own column with its own cost, never "—" throughout.

export const RESULT_WORDS: Readonly<
  Record<GoogleResultBucket, { one: string; many: string; column: string }>
> = {
  leads: { one: 'lead', many: 'leads', column: 'Leads' },
  purchases: { one: 'purchase', many: 'purchases', column: 'Purchases' },
  signups: { one: 'sign-up', many: 'sign-ups', column: 'Sign-ups' },
};

/** Null as soon as one side lacks the counts: a sum over part of the campaigns is not a total. */
export function addResults(
  sum: GoogleResultCounts | null,
  next: GoogleResultCounts | null | undefined,
): GoogleResultCounts | null {
  if (!sum || !next) return null;
  const out: GoogleResultCounts = { ...sum };
  for (const bucket of GOOGLE_RESULT_BUCKETS) {
    if (next[bucket] != null) out[bucket] = (out[bucket] ?? 0) + (next[bucket] ?? 0);
  }
  return out;
}

/** The result types any of the rows counted, in a fixed order. Empty when one row lacks the
 *  counts (a payload cached before the edge sent them): the tab then says NO_SINGLE_RESULT. */
export function resultTypesOf(
  rows: readonly { byResult?: GoogleResultCounts | null }[],
): GoogleResultBucket[] {
  if (rows.some((row) => !row.byResult)) return [];
  return GOOGLE_RESULT_BUCKETS.filter((bucket) =>
    rows.some((row) => (row.byResult?.[bucket] ?? 0) > 0),
  );
}

/** "236 leads", "1 sign-up": whole, as every screen counts conversions. */
export function resultCountLabel(bucket: GoogleResultBucket, count: number): string {
  const shown = formatConversions(count);
  return `${shown} ${shown === '1' ? RESULT_WORDS[bucket].one : RESULT_WORDS[bucket].many}`;
}

/** "236 leads · 2 sign-ups" over `types`; null without counts or types. */
export function resultsApartLabel(
  byResult: GoogleResultCounts | null,
  types: readonly GoogleResultBucket[],
): string | null {
  if (!byResult || types.length === 0) return null;
  return types.map((bucket) => resultCountLabel(bucket, byResult[bucket] ?? 0)).join(' · ');
}

/** One campaign's results apart, the types it counted: "236 leads · 2 sign-ups", or "0" when it
 *  counted none. Null without the counts. */
export function ownResultsLabel(byResult: GoogleResultCounts | null): string | null {
  if (!byResult) return null;
  return resultsApartLabel(byResult, resultTypesOf([{ byResult }])) ?? '0';
}

/** Spend per result of one type; null when there is none to price. */
export function costPerResult(
  spend: number,
  byResult: GoogleResultCounts | null,
  bucket: GoogleResultBucket,
): number | null {
  const count = byResult?.[bucket] ?? 0;
  return count > 0 ? spend / count : null;
}

/** Room for six tiles: spend, conversions, and up to four campaign groups. */
export const MAX_GROUP_TILES = 4;
/** O1's floor. Under it, the clicks tile fills in rather than leaving a half-empty row. */
export const MIN_TILES = 4;

export function costPerConversion(group: CampaignGroup): number | null {
  return group.conversions != null && group.conversions > 0
    ? group.spend / group.conversions
    : null;
}

/** Signed % of `value` against `base`, rounded; null when there is no base to compare with. */
export function percentAgainst(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base === 0) return null;
  return Math.round(((value - base) / base) * 100);
}

/** Conversions are fractional in Google (data-driven attribution splits them), but every
 *  screen counts them whole, as the Overview's leads tile does; the raw value rides on the
 *  figure node. */
export function formatConversions(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
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
