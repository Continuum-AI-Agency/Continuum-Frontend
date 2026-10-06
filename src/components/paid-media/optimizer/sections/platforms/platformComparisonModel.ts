// The MP3 comparison row (frontend.html §7, feature 23; prototipo MP3): one column per connected
// platform, the same four figures in the same order — spend, results, cost per result, share of
// results — for the one result the platforms most often buy together. It is a block of text,
// not a chart: the cheapest platform is NAMED in a sentence and marked with a word in its
// column, never by colour alone.
//
// Read from the multi-platform producer, so it never adds what the producer keeps apart: each
// column is in its own platform's currency, and when two currencies meet there are no totals,
// no shares and no cheapest — the row says why instead.

import type { AccountPlatformMetrics, PlatformTotals } from '@continuum/contracts';
import { formatCurrency } from '../../format';
import {
  connectedTotals,
  kindWords,
  platformSpendFigure,
  rankedKinds,
} from './accountPlatformMetricsModel';
import { AD_PLATFORMS, type AdPlatform, PLATFORM_NAMES } from './platformTabsModel';

export type ComparisonColumn = {
  platform: AdPlatform;
  /** The platform's one currency; null when its accounts bill in several. */
  currency: string | null;
  /** The platform's spend in the window; null when its accounts disagree on currency. */
  spend: number | null;
  /** This result on this platform; null when the platform bought none of it. */
  results: number | null;
  costPerResult: number | null;
  /** results / every column's results — only when the whole row is one currency. */
  shareOfResults: number | null;
  cheapest: boolean;
};

export type PlatformComparison = {
  /** The compared result's KPI field ('leads', 'conversations', …); null when none is bought. */
  kind: string | null;
  columns: ComparisonColumn[];
  /** Every currency the columns bill in, in column order. */
  currencies: string[];
  /** The row's one currency, or null when the columns do not share one. */
  currency: string | null;
  cheapest: { platform: AdPlatform; costPerResult: number } | null;
  /** Only when the row is one currency. */
  totals: {
    currency: string;
    spend: number;
    results: number;
    costPerResult: number | null;
  } | null;
};

function byPlatformOrder(a: PlatformTotals, b: PlatformTotals): number {
  return AD_PLATFORMS.indexOf(a.platform) - AD_PLATFORMS.indexOf(b.platform);
}

/** The result most connected platforms buy; ties go to the account's largest-spend kind. */
function comparedKind(metrics: AccountPlatformMetrics, rows: PlatformTotals[]): string | null {
  const ranked = rankedKinds(metrics).map((kind) => kind.kind);
  const seen: string[] = [];
  for (const row of rows) {
    for (const kind of row.results_by_kind) if (!seen.includes(kind.kind)) seen.push(kind.kind);
  }
  const buyers = (kind: string) =>
    rows.filter((row) => row.results_by_kind.some((entry) => entry.kind === kind)).length;
  const rank = (kind: string) => {
    const index = ranked.indexOf(kind);
    return index === -1 ? ranked.length + seen.indexOf(kind) : index;
  };
  return [...seen].sort((a, b) => buyers(b) - buyers(a) || rank(a) - rank(b))[0] ?? null;
}

/** The comparison for the "All" tab, or null with fewer than two connected platforms. */
export function buildPlatformComparison(
  metrics: AccountPlatformMetrics,
): PlatformComparison | null {
  const rows = [...connectedTotals(metrics)].sort(byPlatformOrder);
  if (rows.length < 2) return null;
  const kind = comparedKind(metrics, rows);

  const currencies = [
    ...new Set(rows.flatMap((row) => (row.currency == null ? [] : [row.currency]))),
  ];
  const oneCurrency =
    rows.every((row) => row.currency != null) && currencies.length === 1
      ? (currencies[0] ?? null)
      : null;

  const kindOf = (row: PlatformTotals) =>
    kind == null ? null : (row.results_by_kind.find((entry) => entry.kind === kind) ?? null);
  const totalResults = rows.reduce((sum, row) => sum + (kindOf(row)?.results ?? 0), 0);

  const priced = rows
    .flatMap((row) => {
      const cost = kindOf(row)?.cost_per_result;
      return cost == null ? [] : [{ platform: row.platform, costPerResult: cost }];
    })
    .sort((a, b) => a.costPerResult - b.costPerResult);
  const cheapest = oneCurrency != null && priced.length >= 2 ? (priced[0] ?? null) : null;

  const columns = rows.map((row): ComparisonColumn => {
    const entry = kindOf(row);
    return {
      platform: row.platform,
      currency: row.currency,
      spend: platformSpendFigure(row),
      results: entry?.results ?? null,
      costPerResult: entry?.cost_per_result ?? null,
      shareOfResults:
        oneCurrency != null && totalResults > 0 ? (entry?.results ?? 0) / totalResults : null,
      cheapest: cheapest?.platform === row.platform,
    };
  });

  const kindSpend = rows.reduce((sum, row) => sum + (kindOf(row)?.spend ?? 0), 0);
  const accountSpend = metrics.spend_by_currency[0]?.spend ?? 0;
  const totals =
    oneCurrency != null && metrics.spend_by_currency.length === 1
      ? {
          currency: oneCurrency,
          spend: accountSpend,
          results: totalResults,
          costPerResult: totalResults > 0 && kindSpend > 0 ? kindSpend / totalResults : null,
        }
      : null;

  return { kind, columns, currencies, currency: oneCurrency, cheapest, totals };
}

function listed(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The row's one sentence: who buys the result cheapest, in words — or why nobody is named. */
export function cheapestSentence(row: PlatformComparison): string {
  if (row.currency == null) {
    const bills = row.columns.map((column, index) => {
      const where = column.currency ?? 'several currencies';
      return index === 0
        ? `${PLATFORM_NAMES[column.platform]} bills in ${where}`
        : `${PLATFORM_NAMES[column.platform]} in ${where}`;
    });
    return `${listed(bills)}, so their costs are not compared and nothing is added up.`;
  }
  if (row.kind == null) return 'No platform bought a result in the window.';
  const words = kindWords(row.kind);
  if (row.cheapest) {
    const best = row.cheapest;
    const others = row.columns
      .filter((column) => column.platform !== best.platform && column.costPerResult != null)
      .map(
        (column) =>
          `${formatCurrency(column.costPerResult, row.currency)} on ${PLATFORM_NAMES[column.platform]}`,
      );
    return `${PLATFORM_NAMES[best.platform]} buys ${words.many} cheapest: ${formatCurrency(best.costPerResult, row.currency)} per ${words.one}, against ${listed(others)}.`;
  }
  const buyer = row.columns.find((column) => column.costPerResult != null);
  return buyer
    ? `Only ${PLATFORM_NAMES[buyer.platform]} bought ${words.many} at a cost in the window.`
    : `No platform bought ${words.many} at a cost in the window.`;
}
