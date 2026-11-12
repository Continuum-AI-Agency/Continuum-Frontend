import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

// The portfolio's "By platform" rows (frontend.html §3, feature 08; §4 for the source rule):
// one text row per platform — cost per result, results and their share, spend and its share,
// state. A portfolio on more than one platform adds one stacked bar of the spend shares
// (presentation standard §7), never a blended cost per result across platforms.
//
// Under 'platform' attribution a row's results are the platform's own KPI. Under GA4 or a
// spreadsheet they are what that source attributed (`conversions`), and the platform's own
// count rides beside them in grey so nobody has to ask which is which.

import {
  metricRatio,
  type PlatformId,
  type PlatformMetricTotals,
  type PortfolioMetrics,
} from '@continuum/contracts';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';

/** Within ±5% of the target reads as on target: a cent's difference is not news. */
const ON_TARGET_BAND = 0.05;

export type PlatformRowState =
  | { kind: 'on_target'; label: string }
  | { kind: 'under'; label: string }
  | { kind: 'over'; label: string }
  | { kind: 'no_results'; label: string }
  | { kind: 'no_target'; label: string };

export type PlatformRow = {
  platform: PlatformId;
  costPerResult: number | null;
  results: number;
  resultsShare: number | null;
  /** The platform's own count when the source is not the platform; null otherwise. */
  platformResults: number | null;
  spend: number;
  spendShare: number | null;
  state: PlatformRowState;
  /** "2 of 9 delivering" — present is not delivering. */
  delivering: string;
};

export type ByPlatformView = {
  rows: PlatformRow[];
  /** True when the source is GA4 or a spreadsheet: every cost carries its source. */
  sourceIsNotPlatform: boolean;
  /** A portfolio on Meta alone keeps today's screens; the block has nothing to compare. */
  metaOnly: boolean;
  /** Every platform's spend, summed in the read's one currency. */
  totalSpend: number;
};

function resultsOf(row: PlatformMetricTotals, sourceIsNotPlatform: boolean): number {
  return sourceIsNotPlatform ? row.conversions : row.results;
}

function stateOf(
  costPerResult: number | null,
  results: number,
  target: number | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): PlatformRowState {
  if (results === 0)
    return {
      kind: 'no_results',
      label: uiTranslate ? uiTranslate('no_results_yet_3c37b16') : 'no results yet',
    };
  if (target === null || costPerResult === null)
    return {
      kind: 'no_target',
      label: uiTranslate ? uiTranslate('no_target_set_f06f193') : 'no target set',
    };
  const gap = costPerResult / target - 1;
  if (Math.abs(gap) <= ON_TARGET_BAND)
    return {
      kind: 'on_target',
      label: uiTranslate ? uiTranslate('optimizer_onTarget') : 'on target',
    };
  const pct = formatShare(Math.abs(gap), uiLocale);
  return gap < 0
    ? {
        kind: 'under',
        label: uiTranslate
          ? uiTranslate('helper_a513db43c0f9', { v0: pct })
          : `${pct} under target`,
      }
    : {
        kind: 'over',
        label: uiTranslate ? uiTranslate('helper_c599ee858422', { v0: pct }) : `${pct} over target`,
      };
}

export function buildByPlatform(
  metrics: PortfolioMetrics,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): ByPlatformView {
  const sourceIsNotPlatform = metrics.attribution.used !== 'platform';
  const totalResults = metrics.by_platform.reduce(
    (sum, row) => sum + resultsOf(row, sourceIsNotPlatform),
    0,
  );
  const totalSpend = metrics.by_platform.reduce((sum, row) => sum + row.spend, 0);
  const rows = metrics.by_platform.map((row): PlatformRow => {
    const results = resultsOf(row, sourceIsNotPlatform);
    const costPerResult = sourceIsNotPlatform
      ? metricRatio(row.spend, results)
      : row.cost_per_result;
    return {
      platform: row.platform,
      costPerResult,
      results,
      resultsShare: metricRatio(results, totalResults),
      platformResults: sourceIsNotPlatform ? row.results : null,
      spend: row.spend,
      spendShare: metricRatio(row.spend, totalSpend),
      state: stateOf(costPerResult, results, metrics.target.cpa, uiTranslate, uiLocale),
      delivering: uiTranslate
        ? uiTranslate('byPlatformDelivering', {
            active: row.delivering_entities,
            total: row.entities,
          })
        : `${row.delivering_entities} of ${row.entities} delivering`,
    };
  });
  const metaOnly = rows.every((row) => row.platform === 'meta');
  return { rows, sourceIsNotPlatform, metaOnly, totalSpend };
}

/** The stacked bar's words: each platform that spent, with its share of the spend. */
export function spendShareLabel(
  rows: readonly PlatformRow[],
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  const parts = rows
    .filter((row) => row.spendShare !== null && row.spendShare > 0)
    .map((row) => `${PLATFORM_NAMES[row.platform]} ${formatShare(row.spendShare, uiLocale)}`);
  return uiTranslate
    ? uiTranslate('helper_d948c6f57821', { v0: parts.join(', ') })
    : `Share of spend: ${parts.join(', ')}`;
}

/** Why the block prints no cost per result for the portfolio as a whole. */
export function noBlendNote(
  sourceIsNotPlatform: boolean,
  resultKind: string,
  uiTranslate?: ScaleCopy,
): string {
  if (uiTranslate)
    return uiTranslate('byPlatformNoBlend', {
      external: sourceIsNotPlatform ? 'yes' : 'no',
      result: resultKind,
    });
  return sourceIsNotPlatform
    ? `Cost per ${resultKind} stays per platform, in the rows above.`
    : `Cost per ${resultKind} stays per platform: each one counts its ${resultKind}s its own way, so they are not blended.`;
}

export function formatShare(share: number | null, uiLocale: UiLocale = 'en'): string {
  return share === null
    ? '—'
    : new Intl.NumberFormat(uiLocale, {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(Math.round(share * 100) / 100);
}

/** Results print whole unless the platform reports fractions (Google's conversions). */
export function formatResults(value: number, uiLocale: UiLocale = 'en'): string {
  return Number.isInteger(value)
    ? value.toLocaleString(uiLocale)
    : value.toLocaleString(uiLocale, { maximumFractionDigits: 1 });
}
