// The Overview's MP1 frame read from ONE producer — public.optimizer_get_account_platform_metrics
// (docs/optimizer-multiplatform/frontend.html §2, decisiones 3, 16, 24). Everything here is a
// pure function of that payload, so the headline, the "All" tiles and each platform tab say
// the same figures and a test can pin each sentence against the row it came from.
//
// Two rules the producer already holds, and this file never undoes: different currencies are
// never one figure (spend is per currency, a result kind is per (kind, currency)), and different
// result kinds are never one count. A share of spend exists only when the producer gave one.

import type {
  AccountPlatformMetrics,
  CheapestFact,
  KindAcrossPlatforms,
  PlatformKindResult,
  PlatformTotals,
} from '@continuum/contracts';
import { type FigureWindow, figureProps, formatCurrency } from '../../format';
import {
  accountHeadlineSegments,
  type HeadlineSegment,
  resultWords,
} from '../account/overviewModel';
import { AD_PLATFORMS, type AdPlatform, PLATFORM_NAMES } from './platformTabsModel';

/** Room for six tiles on "All": spend, up to three result kinds, decisions, autopilot. */
export const MAX_KIND_TILES = 3;
/** The frame never shows fewer than four tiles; a fourth says how many platforms read. */
export const MIN_TILES = 4;

export function figureWindowOfMetrics(metrics: AccountPlatformMetrics): FigureWindow {
  const label = metrics.window.label;
  return label === 'd3' || label === 'd7' || label === 'd14' || label === 'd30' ? label : 'none';
}

/** "7 days" — the producer's own window, never assumed. */
export function windowDaysLabel(metrics: AccountPlatformMetrics): string {
  const since = Date.parse(`${metrics.window.since}T00:00:00Z`);
  const until = Date.parse(`${metrics.window.until}T00:00:00Z`);
  const days = Math.round((until - since) / 86_400_000) + 1;
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function kindWords(kind: string): { one: string; many: string } {
  return resultWords(kind, kind.replace(/[_-]+/g, ' '));
}

export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function platformName(platform: AdPlatform): string {
  return PLATFORM_NAMES[platform];
}

export function formatResults(count: number): string {
  return Number.isInteger(count)
    ? count.toLocaleString('en-US')
    : count.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Every currency the account spent in, each its own figure: "23,911 MXN and 1,200 USD". */
export function spendByCurrencyLabel(metrics: AccountPlatformMetrics): string {
  const parts = metrics.spend_by_currency.map((row) => formatCurrency(row.spend, row.currency));
  if (parts.length === 0) return formatCurrency(0, null);
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function oneCurrency(metrics: AccountPlatformMetrics): string | null {
  const [only, ...rest] = metrics.spend_by_currency;
  return only && rest.length === 0 ? only.currency : null;
}

export function connectedTotals(metrics: AccountPlatformMetrics): PlatformTotals[] {
  return metrics.totals_by_platform.filter((row) => row.connected);
}

export function platformTotals(
  metrics: AccountPlatformMetrics,
  platform: AdPlatform,
): PlatformTotals | null {
  return metrics.totals_by_platform.find((row) => row.platform === platform) ?? null;
}

/** Which platforms the producer says are connected — the tab row's "Connect" marks. */
export function connectedFromMetrics(metrics: AccountPlatformMetrics): Record<AdPlatform, boolean> {
  const connected = (platform: AdPlatform) => platformTotals(metrics, platform)?.connected ?? false;
  return {
    meta: connected('meta'),
    google_ads: connected('google_ads'),
    tiktok_ads: connected('tiktok_ads'),
  };
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** The spend tile's second line: each platform's share when the account is one currency,
 *  each platform's own spend in its own currency when it is not. */
export function spendSplitLabel(metrics: AccountPlatformMetrics): string {
  const spending = connectedTotals(metrics).filter((row) => row.spend != null && row.spend > 0);
  if (spending.length === 0) return 'no platform spent in the window';
  if (oneCurrency(metrics) != null && spending.every((row) => row.share_of_spend != null)) {
    return spending
      .map((row) => `${platformName(row.platform)} ${pct(row.share_of_spend as number)}`)
      .join(' · ');
  }
  return spending
    .map((row) => `${platformName(row.platform)} ${formatCurrency(row.spend, row.currency)}`)
    .join(' · ');
}

/** The account's kinds, largest spend first: what the tiles and the sentence lead with. */
export function rankedKinds(metrics: AccountPlatformMetrics): KindAcrossPlatforms[] {
  return [...metrics.results_by_kind].sort((a, b) => b.spend - a.spend);
}

export function cheapestFor(
  metrics: AccountPlatformMetrics,
  kind: KindAcrossPlatforms,
): CheapestFact | null {
  return (
    metrics.headline_facts.cheapest.find(
      (fact) => fact.kind === kind.kind && fact.currency === kind.currency,
    ) ?? null
  );
}

/** A kind bought in two currencies is two tiles; the label says which is which. */
function kindIsSplitByCurrency(metrics: AccountPlatformMetrics, kind: string): boolean {
  return metrics.results_by_kind.filter((row) => row.kind === kind).length > 1;
}

/** "Leads · 3 platforms", "Conversations · Meta", "Leads · USD". */
export function kindTileLabel(metrics: AccountPlatformMetrics, kind: KindAcrossPlatforms): string {
  const words = capitalise(kindWords(kind.kind).many);
  if (kindIsSplitByCurrency(metrics, kind.kind) && kind.currency) {
    return `${words} · ${kind.currency}`;
  }
  const [only, ...rest] = kind.platforms;
  if (only && rest.length === 0) return `${words} · ${platformName(only.platform)}`;
  return `${words} · ${kind.platforms.length} platforms`;
}

/** "41.20 MXN each · no target · Google cheapest at 31.40 MXN" — or why there is no cost.
 *  Targets belong to portfolios, so an account-wide result has none, and the tile says so
 *  rather than leaving a neutral border unexplained. */
export function kindTileSub(metrics: AccountPlatformMetrics, kind: KindAcrossPlatforms): string {
  if (kind.cost_per_result == null) {
    return kind.spend > 0
      ? `${formatCurrency(kind.spend, kind.currency)} spent, no results`
      : 'no spend · no target';
  }
  const parts = [`${formatCurrency(kind.cost_per_result, kind.currency)} each`, 'no target'];
  const cheapest = cheapestFor(metrics, kind);
  if (cheapest) {
    parts.push(
      `${platformName(cheapest.platform)} cheapest at ${formatCurrency(cheapest.cost_per_result, cheapest.currency)}`,
    );
  }
  return parts.join(' · ');
}

/** A result tile's per-platform line, Meta then Google then TikTok: "Meta · 78 · Google · 118".
 *  Null when one platform alone bought the kind — the label already names it. */
export function kindPlatformSplit(kind: KindAcrossPlatforms): string | null {
  if (kind.platforms.length < 2) return null;
  return AD_PLATFORMS.flatMap((platform) => {
    const row = kind.platforms.find((entry) => entry.platform === platform);
    return row ? [`${platformName(platform)} · ${formatResults(row.results)}`] : [];
  }).join(' · ');
}

/** The "All" sentence: the account's spend per currency, the window and the platforms it
 *  spans, and the decisions waiting. What each kind cost is on its tile.
 *
 *  `decisionsWaiting` is the actions queue the screen's Review button opens — the portfolio
 *  list's pending recommendations and budget moves — not the producer's own
 *  `decisions_waiting`, so the sentence, the tile and the bar's "Review N" count one thing. */
export function allPlatformsHeadlineSegments(
  metrics: AccountPlatformMetrics,
  decisionsWaiting: number,
): HeadlineSegment[] {
  const window = figureWindowOfMetrics(metrics);
  return accountHeadlineSegments({
    spends: metrics.spend_by_currency.map((row) => ({
      text: formatCurrency(row.spend, row.currency),
      figure: figureProps(
        `overview.spend.${row.currency ?? 'none'}`,
        row.spend,
        row.currency,
        window,
      ),
    })),
    span: `in ${windowDaysLabel(metrics)} ${platformCountLabel(metrics)}`,
    decisions: decisionsWaiting,
  });
}

function pctMove(value: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round((value / base - 1) * 100);
}

/**
 * The account's spend against the producer's prior window, in whole percent. Only when the
 * account is one currency and every connected platform that was read carries its prior —
 * a sum missing one platform's last week would read as growth that never happened.
 */
export function accountSpendDeltaPct(metrics: AccountPlatformMetrics): number | null {
  const currency = oneCurrency(metrics);
  const total = metrics.spend_by_currency[0]?.spend;
  if (currency == null || total == null || metrics.prior_window == null) return null;
  const read = connectedTotals(metrics).filter((row) => row.spend != null);
  if (read.length === 0 || read.some((row) => row.prior_spend == null)) return null;
  const prior = read.reduce((sum, row) => sum + (row.prior_spend ?? 0), 0);
  return pctMove(total, prior);
}

export type KindPriorMove = {
  /** The kind's cost per result over the prior window, across the platforms that buy it. */
  priorCostPerResult: number;
  /** Whole-percent move of this window's cost against it: negative is cheaper. */
  pct: number;
};

/**
 * One kind's cost against the prior window, from each platform's own prior. A platform's prior
 * spend on the kind is its prior cost times its prior results; the producer sends no prior
 * spend per kind, so a platform with no prior results (or no prior at all) leaves the account's
 * prior unknown, and then there is no move rather than one computed from part of the account.
 */
export function kindPriorMove(
  metrics: AccountPlatformMetrics,
  kind: KindAcrossPlatforms,
): KindPriorMove | null {
  if (kind.cost_per_result == null || metrics.prior_window == null) return null;
  let priorSpend = 0;
  let priorResults = 0;
  for (const entry of kind.platforms) {
    const row = platformTotals(metrics, entry.platform)?.results_by_kind.find(
      (candidate) => candidate.kind === kind.kind,
    );
    if (!row?.prior_results || row.prior_cost_per_result == null) return null;
    priorSpend += row.prior_cost_per_result * row.prior_results;
    priorResults += row.prior_results;
  }
  if (priorResults === 0) return null;
  const priorCostPerResult = priorSpend / priorResults;
  const pct = pctMove(kind.cost_per_result, priorCostPerResult);
  return pct == null ? null : { priorCostPerResult, pct };
}

/** "Google takes 29% of the spend" — only when the producer could say it (one currency), and
 *  only between two platforms or more: with one connected, "Meta takes 100%" says nothing the
 *  headline's "on Meta" did not, and the line it added wrapped the meta line past where its
 *  one-platform placeholder ends (Overview 768 CLS 0.316). */
export function topSpendLabel(metrics: AccountPlatformMetrics): string | null {
  const top = metrics.headline_facts.top_spend;
  if (!top || connectedTotals(metrics).length < 2) return null;
  return `${platformName(top.platform)} takes ${pct(top.share_of_spend)} of the spend`;
}

export function platformCountLabel(metrics: AccountPlatformMetrics): string {
  const count = connectedTotals(metrics).length;
  if (count === 0) return 'no platform';
  if (count === 1) return `on ${platformName(connectedTotals(metrics)[0]?.platform as AdPlatform)}`;
  return count === 2 ? 'across two platforms' : 'across three platforms';
}

/** What the frame left out, said once: Meta counts what its portfolios hold, and a
 *  portfolio on a different window (or with no cycle) is not in the sum. */
export function coverageNote(metrics: AccountPlatformMetrics): string | null {
  const { excluded } = metrics.portfolios;
  if (excluded.length === 0) return null;
  const noCycle = excluded.filter((row) => row.reason === 'no_cycle').length;
  const reasons = [
    noCycle > 0 ? `${noCycle} without a cycle yet` : null,
    excluded.length - noCycle > 0 ? `${excluded.length - noCycle} on a different window` : null,
  ].filter(Boolean);
  return `${excluded.length} Meta ${excluded.length === 1 ? 'portfolio' : 'portfolios'} not counted: ${reasons.join(', ')}`;
}

// ── One platform's tab ────────────────────────────────────────────────────────────────

/** The platform's spend in its own currency, or null when its accounts bill in different
 *  currencies — then no single figure is honest. */
export function platformSpendFigure(row: PlatformTotals): number | null {
  if (row.spend == null) return null;
  const currencies = new Set(row.accounts.map((account) => account.currency));
  if (row.currency == null && currencies.size > 1) return null;
  return row.spend;
}

/** "29% of the account · +12% on the period before". */
export function platformSpendSub(row: PlatformTotals): string {
  const parts: string[] = [];
  if (platformSpendFigure(row) == null && row.spend != null) {
    const codes = [...new Set(row.accounts.map((account) => account.currency ?? '?'))];
    return `accounts bill in ${codes.join(' and ')} — not added up`;
  }
  if (row.share_of_spend != null) parts.push(`${pct(row.share_of_spend)} of the account`);
  if (row.spend_delta_pct != null) {
    const delta = Math.round(row.spend_delta_pct * 100);
    parts.push(`${delta > 0 ? '+' : ''}${delta}% on the period before`);
  } else {
    parts.push('no prior period to compare');
  }
  return parts.join(' · ');
}

/** "31.40 MXN each · prev. 33.10 MXN" for one kind on one platform. */
export function platformKindSub(kind: PlatformKindResult, currency: string | null): string {
  if (kind.cost_per_result == null) {
    return kind.spend > 0
      ? `${formatCurrency(kind.spend, currency)} spent, no results`
      : 'no spend';
  }
  const parts = [`${formatCurrency(kind.cost_per_result, currency)} each`];
  if (kind.prior_cost_per_result != null) {
    parts.push(`prev. ${formatCurrency(kind.prior_cost_per_result, currency)}`);
  }
  return parts.join(' · ');
}

export function platformKinds(row: PlatformTotals): PlatformKindResult[] {
  return [...row.results_by_kind].sort((a, b) => b.spend - a.spend);
}

export function accountsReadLabel(row: PlatformTotals): string {
  const read = row.accounts.filter((account) => account.ingested).length;
  return `${read} of ${row.accounts.length} ${row.accounts.length === 1 ? 'account' : 'accounts'} read`;
}
