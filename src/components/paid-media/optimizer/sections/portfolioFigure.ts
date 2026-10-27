// A portfolio's headline figure — spend and cost per result against the target — from ONE
// function, so the Portfolios list, the Overview and the portfolio hero cannot disagree.
//
// Why: "Tours Programados" read $265 / 11% under in the list and $275 / 7% under in the
// detail hero. The list priced the 7-day window the last cycle measured (Oct 15, eleven days
// earlier, shown as current); the hero priced the brief saved at that cycle, or a recap over
// the page's range. Two computations over two reads.
//
// The canonical figure is the last 7 COMPLETE days from the live read: the account
// snapshot read (paid-media-metrics `adset_snapshots`, the read the portfolio detail already
// makes, same react-query key), whose `windows.d7` is the 7 finished days ending the ad
// account's yesterday at the moment Meta was read, summed over the portfolio's enrolled
// members. Only when that read has nothing to say for the portfolio does the cycle-time
// snapshot stand in — and then it is dated ("as of Oct 15") and, past STALE_AFTER_DAYS,
// says how old it is. A snapshot is never presented as current.

import type { AdSetSnapshot, EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import {
  type PortfolioWindow,
  portfolioWindowOf,
  seriesWindowFigures,
  type WindowFigures,
} from './account/overviewModel';

export { seriesWindowFigures } from './account/overviewModel';

/** A snapshot older than this many whole days says so on screen. */
export const STALE_AFTER_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PortfolioFigureSource = 'live' | 'snapshot';

export type PortfolioFigure = PortfolioWindow & {
  /** `live`: the last 7 complete days from the live read. `snapshot`: what the last cycle
   *  measured, standing in because the live read had nothing for this portfolio. */
  source: PortfolioFigureSource;
  /** "as of Oct 15" on a snapshot; null on a live figure, which is current by definition. */
  asOfLabel: string | null;
  /** Whole days between when the figures were measured and now. */
  ageDays: number;
  /** A snapshot older than STALE_AFTER_DAYS. A live figure is never stale. */
  stale: boolean;
};

/** Sum the live read's 7-day (and the 7 days before it) over the portfolio's members.
 *  Null when the read is undated or misses ANY member. The read lists only ad sets active on
 *  Meta now, so a member paused inside the window drops out with all its spend: Conversaciones
 *  Whatsapp priced $883 live against $12,199 at its last cycle. A partial sum would be a wrong
 *  figure presented as current; the dated snapshot is the honest stand-in. */
export function liveWindowFigures(args: {
  snapshots: readonly Pick<AdSetSnapshot, 'id' | 'windows'>[];
  memberIds: Iterable<string>;
  portfolio: Pick<PortfolioListItem, 'target_metric' | 'objective'>;
  /** When Meta was read (the snapshot envelope's fetchedAt). */
  readAt: string | null;
}): WindowFigures | null {
  if (!args.readAt || Number.isNaN(Date.parse(args.readAt))) return null;
  const members = new Set(args.memberIds);
  if (members.size === 0) return null;
  const kpi = getOptimizationMetricDefinition(
    args.portfolio.target_metric ?? args.portfolio.objective,
  ).kpiField;
  const count = (window: Record<string, unknown> | undefined, field: string): number => {
    const value = window?.[field];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  const seen = new Set<string>();
  let spend = 0;
  let results = 0;
  let spend14 = 0;
  let results14 = 0;
  for (const snapshot of args.snapshots) {
    if (!members.has(snapshot.id)) continue;
    seen.add(snapshot.id);
    const d7 = snapshot.windows.d7 as Record<string, unknown> | undefined;
    const d14 = snapshot.windows.d14 as Record<string, unknown> | undefined;
    spend += count(d7, 'spend');
    results += count(d7, kpi);
    spend14 += count(d14, 'spend');
    results14 += count(d14, kpi);
  }
  if (seen.size < members.size) return null;
  return {
    spend,
    results,
    priorSpend: Math.max(0, spend14 - spend),
    priorResults: Math.max(0, results14 - results),
    cycleTs: args.readAt,
  };
}

/** "Oct 15", en-US, from the measurement's UTC date. */
function monthDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Whole days from `iso` to `now`, never negative. */
export function ageInDays(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.floor((now - at) / DAY_MS));
}

/**
 * THE headline figure of a portfolio. Every surface that prints a portfolio's spend or its
 * cost against the target calls this, with the reads it has: the live one first, the
 * cycle-time snapshot only when the live one is missing. Null when neither exists (no cycle
 * yet and nothing live): the surface then says so instead of printing a zero.
 */
export function portfolioFigure(args: {
  portfolio: PortfolioListItem;
  live: WindowFigures | null;
  snapshot: WindowFigures | null;
  now?: number;
}): PortfolioFigure | null {
  const now = args.now ?? Date.now();
  if (args.live) {
    return {
      ...portfolioWindowOf(args.portfolio, args.live),
      source: 'live',
      asOfLabel: null,
      ageDays: ageInDays(args.live.cycleTs, now),
      stale: false,
    };
  }
  if (!args.snapshot) return null;
  const ageDays = ageInDays(args.snapshot.cycleTs, now);
  return {
    ...portfolioWindowOf(args.portfolio, args.snapshot),
    source: 'snapshot',
    asOfLabel: `as of ${monthDay(args.snapshot.cycleTs)}`,
    ageDays,
    stale: ageDays > STALE_AFTER_DAYS,
  };
}

/**
 * The headline figure from the three reads every surface has: the account snapshot read
 * (with its read time), the portfolio's enrolled roster, and its cycle series. The list hook
 * and the portfolio detail both call THIS, so the same reads cannot price to two figures.
 * A read still loading is passed as null and simply contributes nothing.
 */
export function portfolioFigureFromReads(args: {
  portfolio: PortfolioListItem;
  snapshots: readonly Pick<AdSetSnapshot, 'id' | 'windows'>[] | null;
  readAt: string | null;
  memberIds: readonly string[] | null;
  series: readonly EfficiencySeriesPoint[];
  now?: number;
}): PortfolioFigure | null {
  const live =
    args.snapshots && args.memberIds
      ? liveWindowFigures({
          snapshots: args.snapshots,
          memberIds: args.memberIds,
          portfolio: args.portfolio,
          readAt: args.readAt,
        })
      : null;
  return portfolioFigure({
    portfolio: args.portfolio,
    live,
    snapshot: seriesWindowFigures(args.series),
    now: args.now,
  });
}

/** What a surface prints beside a snapshot figure: "as of Oct 15", and past the stale line
 *  "as of Oct 15 · 11 days old". Null for a live figure — it needs no caveat. */
export function figureAsOfText(
  figure:
    | Partial<Pick<PortfolioFigure, 'source' | 'asOfLabel' | 'ageDays' | 'stale'>>
    | null
    | undefined,
): string | null {
  if (figure?.source !== 'snapshot' || !figure.asOfLabel) return null;
  return figure.stale ? `${figure.asOfLabel} · ${figure.ageDays} days old` : figure.asOfLabel;
}
