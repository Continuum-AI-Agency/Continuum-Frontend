// The result hero's figures (O02). The figure is a portfolio's live last-7-days figure, the one the
// lanes, the Today rows and the portfolio detail print (Ramiro, 2026-10-26: usePortfolioFigures →
// portfolioFigure; snapshots and producer rows are dated history only):
//
//   · The counted kind's portfolios, summed: spend and results added, then divided. On Meta that
//     figure is live. A Google portfolio has no live read the browser can sum, so its figure is
//     the metrics read the lanes print, dated "as of".
//   · Google's V1 card (the primary conversion that counts visits) is the one exception: its real
//     results over its own 30 days are what counts, as the reading gives them, beside what Google
//     reports.
//   · A Google account none of whose portfolios has a figure (there is none yet, or none has
//     cycled) falls back to Google's own read of the whole account, and says so.
//
// What counts (its label), the goal, the reading's source and what the platform reports come from
// the reading (AdAccountReading.result). The trend is dated history: on Meta the 7-day window
// each cycle measured; on Google the account's daily rows rolled into 7-day windows. Nothing is
// synthesised: a figure no read carried is null, and the hero says which one is missing.

import type { AdAccountResult, EfficiencySeriesPoint } from '@continuum/contracts';
import type { ResultKind } from '../../account/overviewModel';
import {
  type GoogleOverview,
  pricedPerResult,
  windowRangeLabel,
} from '../../platforms/googleAdsOverviewModel';
import { figureAsOfText, type PortfolioFigure } from '../../portfolioFigure';
import type { TrendPoint } from '../marksModel';

/** The days the trend covers. */
export const RESULT_TREND_DAYS = 30;
/** The rolling window each trend point prices, the window a portfolio's figure is quoted over. */
export const RESULT_ROLLING_DAYS = 7;

export type ResultWords = { one: string; many: string };

export type ResultOther = {
  words: ResultWords;
  count: number;
  spend: number;
  costPerResult: number | null;
};

export type ResultFigures = {
  /** What is counted, in the reading's words ("conversaciones", "leads y ventas reales"). */
  words: ResultWords;
  count: number | null;
  spend: number | null;
  costPerResult: number | null;
  /** The reading's cost-per-result goal; null when it names none. */
  goal: number | null;
  currency: string | null;
  windowDays: number;
  /** Whose figures these are: the counted kind's portfolios, the reading's V1 count, or Google's
   *  own read of the whole account. */
  source: 'portfolios' | 'reading' | 'google';
  /** What the platform reports when it counts otherwise; null when it agrees or is not known. */
  platformReported: number | null;
  /** The other results the account's portfolios buy, beside the one that counts. */
  others: ResultOther[];
};

function readingWords(result: AdAccountResult): ResultWords {
  return { one: result.label, many: result.label };
}

function reported(result: AdAccountResult, count: number | null): number | null {
  return result.platformReported != null && result.platformReported !== count
    ? result.platformReported
    : null;
}

/** The reading counts the V1 card's real results, not a platform result: that count stands. */
export function countsRealResults(result: AdAccountResult): boolean {
  return result.count != null && result.source === 'inflated_conversion';
}

/** The reading's own count, as it gives it (the V1 card's real results). */
export function resultFromReading(result: AdAccountResult): ResultFigures | null {
  if (result.count == null) return null;
  const cost =
    result.costPerResult ??
    (result.spend != null && result.count > 0 ? result.spend / result.count : null);
  return {
    words: readingWords(result),
    count: result.count,
    spend: result.spend,
    costPerResult: cost,
    goal: result.goal,
    currency: result.currency,
    windowDays: result.windowDays,
    source: 'reading',
    platformReported: reported(result, result.count),
    others: [],
  };
}

/**
 * The counted kind's portfolio figures, summed: `kinds` is resultKinds over the portfolios'
 * figures, which adds each kind's spend and results and only then divides. The kind is the
 * reading's; without one, the kind the portfolios spend most on. Null when no portfolio of the
 * kind has a figure.
 */
export function resultFromPortfolios(args: {
  kinds: readonly ResultKind[];
  reading: AdAccountResult;
  currency: string | null;
}): ResultFigures | null {
  const kind = args.reading.kind ?? args.kinds[0]?.kind ?? null;
  const counted = args.kinds.find((row) => row.kind === kind);
  if (!counted) return null;
  return {
    words: readingWords(args.reading),
    count: counted.results,
    spend: counted.spend,
    costPerResult: counted.costPerResult,
    goal: args.reading.goal,
    currency: args.currency,
    windowDays: RESULT_ROLLING_DAYS,
    source: 'portfolios',
    platformReported: reported(args.reading, counted.results),
    others: args.kinds
      .filter((row) => row !== counted)
      .map((row) => ({
        words: row.words,
        count: row.results,
        spend: row.spend,
        costPerResult: row.costPerResult,
      })),
  };
}

/** Google's own read of the whole account, counting the result the brand's Google portfolios are
 *  held to: the fallback while no portfolio has a figure. Without a single result `count` is null. */
export function resultFromGoogle(args: {
  overview: GoogleOverview;
  reading: AdAccountResult;
  currency: string | null;
}): ResultFigures {
  const { overview, reading } = args;
  return {
    words: readingWords(reading),
    count: overview.conversions,
    spend: overview.spend,
    costPerResult: pricedPerResult(overview.spend, overview.conversions),
    goal: reading.goal,
    currency: args.currency ?? overview.currency,
    windowDays: overview.days,
    source: 'google',
    platformReported: null,
    others: [],
  };
}

/** The window the portfolios' figures cover: "Last 7 days", and when one of them is the last
 *  cycle's rather than live, the oldest date among them ("as of Oct 14 · 19 days old"). */
export function portfolioWindowLabel(figures: readonly PortfolioFigure[]): string {
  const oldest = figures
    .filter((figure) => figure.source === 'snapshot')
    .sort((a, b) => b.ageDays - a.ageDays)[0];
  const asOf = figureAsOfText(oldest);
  return asOf ? `Last ${RESULT_ROLLING_DAYS} days · ${asOf}` : `Last ${RESULT_ROLLING_DAYS} days`;
}

/** The window a figure covers, said beside it. */
export function resultWindowLabel(
  figures: ResultFigures,
  context: { portfolios: readonly PortfolioFigure[]; google: GoogleOverview | null },
): string {
  if (figures.source === 'reading') {
    return `Last ${figures.windowDays} days · as the conversion card counts them`;
  }
  if (figures.source === 'google' && context.google) {
    return `${windowRangeLabel(context.google.since, context.google.until)} · Google's read of the whole account`;
  }
  return portfolioWindowLabel(context.portfolios);
}

/** What the ring measures the count against, or null when there is nothing to measure it by. */
export type ResultRing = {
  part: number;
  whole: number;
  /** `goal`: the results the spend buys at the goal. `reported`: what the platform counts. */
  basis: 'goal' | 'reported';
};

/** The ring measures against the goal only when the spend buys at least one result at it: a
 *  week that spent $29 against a $99 goal would read "1 of 0". */
export function resultRing(figures: ResultFigures): ResultRing | null {
  const { count, spend, goal, platformReported } = figures;
  if (count == null) return null;
  if (goal != null && goal > 0 && spend != null && spend >= goal) {
    return { part: count, whole: spend / goal, basis: 'goal' };
  }
  if (platformReported != null && platformReported > 0) {
    return { part: count, whole: platformReported, basis: 'reported' };
  }
  return null;
}

/** The count as the hero prints it: whole, the way every screen counts conversions. */
export function formatResultCount(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const DAY_MS = 86_400_000;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The Meta trend: each cycle's 7-day cost per result, summed over the portfolios that buy the
 * result, one point per UTC day of the last `days` cycle days. A portfolio that missed a cycle
 * between two it ran makes that day a gap rather than a sum of the others: a partial sum would be
 * a cheaper or dearer cost that never happened. A portfolio before its first cycle or after its
 * last is simply not in that day.
 */
export function trendFromSeries(
  series: readonly (readonly EfficiencySeriesPoint[])[],
  multiplier = 1,
  days: number = RESULT_TREND_DAYS,
): TrendPoint[] {
  const byPortfolio = series
    .map((points) => {
      const byDay = new Map<string, EfficiencySeriesPoint>();
      for (const point of points) byDay.set(point.cycle_ts.slice(0, 10), point);
      const keys = [...byDay.keys()].sort();
      return { byDay, first: keys[0] ?? null, last: keys[keys.length - 1] ?? null };
    })
    .filter((portfolio) => portfolio.first != null);
  const allDays = [...new Set(byPortfolio.flatMap(({ byDay }) => [...byDay.keys()]))].sort();
  return allDays.slice(-days).map((day) => {
    let spend = 0;
    let results = 0;
    let complete = true;
    for (const { byDay, first, last } of byPortfolio) {
      const point = byDay.get(day);
      if (point) {
        spend += point.spend_d7;
        results += point.conv_d7;
      } else if (first != null && last != null && first < day && last > day) {
        complete = false;
      }
    }
    return { day, value: complete && results > 0 ? (spend / results) * multiplier : null };
  });
}

export type DailyResultRow = {
  date?: string;
  spend?: number;
  conversions?: number | null;
};

/**
 * The Google trend: the account's days from `since` to `until`, each closing a 7-day window,
 * priced as that window's spend over its counted results. A day the read carries no row for
 * delivered nothing (Google reports no row for a day without impressions), so it counts as zero
 * spend and zero results; a day whose count is null (no single result defined) makes every
 * window it is in a gap. The last `days` windows are returned.
 */
export function trendFromDaily(
  rows: readonly DailyResultRow[],
  window: { since: string; until: string },
  rolling: number = RESULT_ROLLING_DAYS,
  days: number = RESULT_TREND_DAYS,
): TrendPoint[] {
  const start = Date.parse(`${window.since}T00:00:00Z`);
  const end = Date.parse(`${window.until}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const byDay = new Map<string, DailyResultRow>();
  for (const row of rows) if (row.date) byDay.set(row.date.slice(0, 10), row);
  const calendar: { day: string; spend: number; results: number | null }[] = [];
  for (let at = start; at <= end; at += DAY_MS) {
    const day = isoDay(at);
    const row = byDay.get(day);
    calendar.push({
      day,
      spend: row?.spend ?? 0,
      results: row ? (row.conversions === null ? null : (row.conversions ?? 0)) : 0,
    });
  }
  const points: TrendPoint[] = [];
  for (let index = rolling - 1; index < calendar.length; index += 1) {
    const slice = calendar.slice(index - rolling + 1, index + 1);
    const spend = slice.reduce((sum, day) => sum + day.spend, 0);
    const counted = slice.every((day) => day.results != null);
    const results = slice.reduce((sum, day) => sum + (day.results ?? 0), 0);
    points.push({
      day: (calendar[index] as { day: string }).day,
      value: counted ? pricedPerResult(spend, results) : null,
    });
  }
  return points.slice(-days);
}

/** The window a Google trend reads: `days` closing windows ending on `until`, so the first one
 *  needs `rolling - 1` days before it. */
export function trendReadWindow(
  until: string,
  rolling: number = RESULT_ROLLING_DAYS,
  days: number = RESULT_TREND_DAYS,
): { since: string; until: string } {
  const end = Date.parse(`${until}T00:00:00Z`);
  return { since: isoDay(end - (days + rolling - 2) * DAY_MS), until };
}
