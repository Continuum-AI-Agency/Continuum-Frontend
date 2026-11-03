// What the four Meta views share: one row shape for the ranking reads (campaigns, ad sets and
// ads from paid-media-reporting/metrics over the last 30 days), the result that counts on the
// account with the goal it is measured against, and how a cost reads against that goal.
//
// The result is chosen from the figures, never assumed. Among the results the account's
// portfolios buy (purchases, leads, messaging conversations), it is the deepest one the
// campaigns recorded: a purchase is deeper than a lead and a lead deeper than a conversation, so
// an account whose conversations exist to book tours is read by its tours. The goal is the cost
// goal of the portfolio that buys that result (the one with the largest daily budget when
// several do), and it is named, so the reader can see where it came from.
//
// A count the read did not carry is null, never 0: an uncounted event and zero events are two
// different facts, and a view that printed the first as the second would invent a failure.

import type { PaidRankedEntity, PortfolioListItem } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { currencySymbol, formatCurrency } from '@/components/paid-media/optimizer/format';

/** One ranked entity (campaign, ad set or ad), reduced to what the views read. */
export type MetaRankRow = {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  spend: number;
  impressions: number;
  /** Meta's purchase count (the edge's `conversions`). */
  purchases: number | null;
  /** What those purchases are worth (the edge's `conversionValue`). */
  purchaseValue: number | null;
  /** Messaging conversations started. */
  conversations: number | null;
  leads: number | null;
};

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function rankRowOf(entity: PaidRankedEntity): MetaRankRow {
  const metrics = entity.metrics;
  const hierarchy = entity.hierarchy;
  return {
    id: entity.id,
    name: entity.name.trim() || entity.id,
    campaignId: hierarchy?.campaign?.id ?? null,
    campaignName: hierarchy?.campaign?.name ?? entity.labels?.campaign ?? null,
    adsetId: hierarchy?.adset?.id ?? null,
    adsetName: hierarchy?.adset?.name ?? entity.labels?.adset ?? null,
    spend: finite(metrics.spend) ?? 0,
    impressions: finite(metrics.impressions) ?? 0,
    purchases: finite(metrics.conversions),
    purchaseValue: finite(metrics.conversionValue),
    conversations: finite(metrics.conversations),
    leads: finite(metrics.leads),
  };
}

/** The results a Meta ranking row counts. */
export type MetaResultKind = 'purchases' | 'leads' | 'conversations';

const FUNNEL_DEPTH: Record<MetaResultKind, number> = { purchases: 3, leads: 2, conversations: 1 };

export type ResultWords = { one: string; many: string };

/** Product chrome (English). */
export const RESULT_WORDS_EN: Record<MetaResultKind, ResultWords> = {
  purchases: { one: 'purchase', many: 'purchases' },
  leads: { one: 'lead', many: 'leads' },
  conversations: { one: 'conversation', many: 'conversations' },
};

export function resultCount(row: MetaRankRow, kind: MetaResultKind): number | null {
  return row[kind];
}

/** The ranking result a portfolio buys, or null when the ranking cannot count it (a custom
 *  conversion, clicks, views…). */
export function portfolioResultKind(
  portfolio: Pick<PortfolioListItem, 'objective' | 'target_metric'>,
): MetaResultKind | null {
  if (portfolio.objective === 'custom') return null;
  const field = getOptimizationMetricDefinition(
    portfolio.target_metric ?? portfolio.objective,
  ).kpiField;
  return field === 'purchases' || field === 'leads' || field === 'conversations' ? field : null;
}

export type AccountResult = {
  kind: MetaResultKind;
  /** Product chrome; the account's own words come from contracts (metaResultWords). */
  en: ResultWords;
  /** The cost goal of the portfolio that buys this result; null when none sets one. */
  goal: number | null;
  /** That portfolio's name, as stored. */
  goalPortfolio: string | null;
};

export type ResultTotals = {
  spend: number;
  impressions: number;
  /** Null when no row carried the count. */
  results: number | null;
  /** What the results are worth; null when no row carried a value. */
  value: number | null;
};

function sumKnown(values: readonly (number | null)[]): number | null {
  let total: number | null = null;
  for (const value of values) {
    if (value == null) continue;
    total = (total ?? 0) + value;
  }
  return total;
}

export function totalsOf(rows: readonly MetaRankRow[], kind: MetaResultKind | null): ResultTotals {
  return {
    spend: rows.reduce((sum, row) => sum + row.spend, 0),
    impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    results: kind ? sumKnown(rows.map((row) => resultCount(row, kind))) : null,
    value: kind === 'purchases' ? sumKnown(rows.map((row) => row.purchaseValue)) : null,
  };
}

/** spend / results, or null without a result to divide by. */
export function costPer(spend: number, results: number | null): number | null {
  return results != null && results > 0 ? spend / results : null;
}

/** Cost per thousand impressions, or null without impressions. */
export function cpmOf(spend: number, impressions: number): number | null {
  return impressions > 0 ? (spend / impressions) * 1000 : null;
}

/**
 * The result that counts on this account and its goal. Null when the campaigns recorded none of
 * the results a ranking row counts.
 */
export function accountResult(
  rows: readonly MetaRankRow[],
  portfolios: readonly PortfolioListItem[],
): AccountResult | null {
  const recorded = (Object.keys(FUNNEL_DEPTH) as MetaResultKind[]).filter(
    (kind) => (totalsOf(rows, kind).results ?? 0) > 0,
  );
  if (recorded.length === 0) return null;
  const bought = new Set(
    portfolios.flatMap((portfolio) => {
      const kind = portfolioResultKind(portfolio);
      return kind ? [kind] : [];
    }),
  );
  const pool = recorded.some((kind) => bought.has(kind))
    ? recorded.filter((kind) => bought.has(kind))
    : recorded;
  const kind = pool.reduce((deepest, candidate) =>
    FUNNEL_DEPTH[candidate] > FUNNEL_DEPTH[deepest] ? candidate : deepest,
  );
  const owner = portfolios
    .filter(
      (portfolio) =>
        portfolioResultKind(portfolio) === kind &&
        portfolio.cpa_target != null &&
        portfolio.cpa_target > 0,
    )
    .reduce<PortfolioListItem | null>(
      (largest, portfolio) =>
        largest == null || (portfolio.daily_total ?? 0) > (largest.daily_total ?? 0)
          ? portfolio
          : largest,
      null,
    );
  return {
    kind,
    en: RESULT_WORDS_EN[kind],
    goal: owner?.cpa_target ?? null,
    goalPortfolio: owner?.name ?? null,
  };
}

/** What a cost is read against: the goal when there is one, else the account's own average. */
export type CostReference = {
  value: number;
  kind: 'goal' | 'average';
  /** The portfolio the goal belongs to. */
  source: string | null;
};

export function costReference(
  result: AccountResult | null,
  averageCost: number | null,
): CostReference | null {
  if (result?.goal != null) {
    return { value: result.goal, kind: 'goal', source: result.goalPortfolio };
  }
  return averageCost != null ? { value: averageCost, kind: 'average', source: null } : null;
}

/** Where a cost sits against its reference: below (good), within 5% of it, or above (bad). */
export type CostTone = 'below' | 'mid' | 'above';

const ON_REFERENCE = 0.05;

export function costTone(cost: number | null, reference: number | null): CostTone {
  if (cost == null || reference == null || reference <= 0) return 'mid';
  const ratio = cost / reference - 1;
  if (Math.abs(ratio) <= ON_REFERENCE) return 'mid';
  return ratio < 0 ? 'below' : 'above';
}

/** How strongly a cost leans away from its reference, -1 (half of it or less) to 1 (double it
 *  or more), on a log scale so halving and doubling weigh the same. 0 without a reference. */
export function costLean(cost: number | null, reference: number | null): number {
  if (cost == null || reference == null || reference <= 0 || cost <= 0) return 0;
  return Math.max(-1, Math.min(1, Math.log2(cost / reference)));
}

/** "24% over goal", "12% under average", "On goal". Empty without a reference. */
export function vsReferenceText(cost: number | null, reference: CostReference | null): string {
  if (cost == null || reference == null) return '';
  const delta = Math.round((cost / reference.value - 1) * 100);
  const name = reference.kind === 'goal' ? 'goal' : 'average';
  if (delta === 0) return `On ${name}`;
  return `${Math.abs(delta)}% ${delta < 0 ? 'under' : 'over'} ${name}`;
}

/** A share of a whole, 0.243 → "24%"; a sliver reads "<1%", never "0%". */
export function formatShare(share: number | null): string {
  if (share == null || !Number.isFinite(share)) return '—';
  if (share > 0 && share < 0.005) return '<1%';
  return `${Math.round(share * 100)}%`;
}

export function formatRoas(roas: number | null): string {
  return roas == null || !Number.isFinite(roas) ? '—' : roas.toFixed(2);
}

/** "$305–$509 MXN": both ends with the symbol, the code once at the end (M1). */
export function formatMoneyRange(lo: number, hi: number, currency: string | null): string {
  return `${currencySymbol(currency)}${formatCurrency(lo, null)}–${formatCurrency(hi, currency)}`;
}

/** "Oct 15", product chrome. */
export function monthDayEn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Whether a date string parses. */
export function isDate(iso: string | null | undefined): iso is string {
  return typeof iso === 'string' && !Number.isNaN(Date.parse(iso));
}
