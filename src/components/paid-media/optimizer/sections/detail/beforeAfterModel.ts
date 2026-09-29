// Before and after the last cycle (Performance+ redesign, portafolio.html idea 09): what the
// Optimizer did in its last cycle and what the window after it looks like against the window
// before. It renders accounts instead of describing.
//
// Three facts, each from a read the workspace already holds:
//   * the last cycle — `latest_run.cycle_ts`, the moves it proposed (pending recommendations
//     by kind, the cycle rows with a budget change) and what landed (the rows' apply status,
//     and the observed timeline events since the cycle: applied budgets, status writes);
//   * the two windows — the recap's current totals and its prior window of the same length,
//     summed from the same daily series, so "before" cannot come from a different read than
//     "after";
//   * the projection — the current window with the ad sets a pending pause would remove taken
//     out, spend and results alike, priced against the target. Every figure is a sum of rows
//     the screen already shows; nothing is modelled.

import type {
  OptimizationMetricDefinition,
  ParsedCycleRunReport,
  ResolvedRange,
  TimelineEvent,
} from '@continuum/contracts';
import { deriveEfficiency } from '../../format';
import type { RecapModel, RecapSnapshot } from './recapModel';

export type WindowTotals = {
  /** "week of September 14 to 20" */
  label: string;
  /** "week of Sep 14–20" — the same window short enough to sit beside its figure. */
  short: string;
  spend: number;
  results: number;
  /** Cost per result in the metric's display unit; null with no results. */
  cost: number | null;
};

export type LastCycle = {
  at: string;
  /** "Saturday 19:05" */
  when: string;
  /** "2 pauses and 1 restore proposed" — null when the cycle proposed nothing. */
  proposed: string | null;
  /** "none applied yet" / "4 budget moves and 1 status change applied" */
  applied: string;
};

export type Projection = {
  pauses: number;
  /** Ad sets left once the pauses land. */
  remaining: number;
  /** Cost per result over the current window without the paused ad sets; null when the
   *  rest bought nothing. */
  cost: number | null;
  vsTarget: 'under' | 'over' | 'on' | null;
};

export type BeforeAfter = {
  lastCycle: LastCycle | null;
  before: WindowTotals | null;
  /** Null while the range has no data yet (the snapshots still loading, or a range before
   *  any series) — zeros would read as a window that bought nothing. */
  after: WindowTotals | null;
  projection: Projection | null;
  /** Where the windows came from: the daily series, an engine window, or nothing yet. */
  source: RecapModel['source'];
};

const DAY_MS = 86_400_000;

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });

/** "September 14 to 20", or "September 28 to October 4" across a month edge. */
export function dayRangeLabel(from: string, to: string): string {
  const start = utcDate(from);
  const end = utcDate(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from} to ${to}`;
  const startWords = `${MONTH.format(start)} ${start.getUTCDate()}`;
  if (
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear()
  ) {
    return `${startWords} to ${end.getUTCDate()}`;
  }
  return `${startWords} to ${MONTH.format(end)} ${end.getUTCDate()}`;
}

const MONTH_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const monthShort = (date: Date): string => MONTH_SHORT.format(date);

/** "week of Sep 14–20" for a week, "Sep 1–14" otherwise, "Sep 28–Oct 4" across a month edge. */
export function shortRangeLabel(from: string, to: string, days: number): string {
  const start = utcDate(from);
  const end = utcDate(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from}–${to}`;
  const range =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${monthShort(start)} ${start.getUTCDate()}–${end.getUTCDate()}`
      : `${monthShort(start)} ${start.getUTCDate()}–${monthShort(end)} ${end.getUTCDate()}`;
  return days === 7 ? `week of ${range}` : range;
}

function windowLabel(from: string, to: string, days: number): string {
  const range = dayRangeLabel(from, to);
  return days === 7 ? `week of ${range}` : range;
}

/** "Saturday 19:05" in the account's zone. */
export function cycleWhen(iso: string, timeZone?: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(at);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(at);
  return `${day} ${time}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "a, b and c" */
function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const PROPOSAL_WORDS: Record<string, [string, string]> = {
  pause: ['pause', 'pauses'],
  pause_ad: ['ad pause', 'ad pauses'],
  restore_delivery: ['restore', 'restores'],
  creative_refresh: ['creative change', 'creative changes'],
  variate_creative: ['winner variation', 'winner variations'],
  seed_experiment: ['experiment', 'experiments'],
  audience_expand: ['new audience', 'new audiences'],
  settings: ['setting change', 'setting changes'],
};

/** What the cycle put on the table: pending recommendations by kind, then budget moves. */
function proposedWords(report: ParsedCycleRunReport): string | null {
  const byKind = new Map<string, number>();
  for (const rec of report.recommendations) {
    if (rec.status !== 'pending') continue;
    byKind.set(rec.kind, (byKind.get(rec.kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [kind, n] of byKind) {
    const words = PROPOSAL_WORDS[kind] ?? ['recommendation', 'recommendations'];
    parts.push(plural(n, words[0], words[1]));
  }
  const moves = report.latest_items.filter((item) => (item.change_abs ?? 0) !== 0).length;
  if (moves > 0) parts.push(plural(moves, 'budget move', 'budget moves'));
  if (parts.length === 0) return null;
  return `${joinWords(parts)} proposed`;
}

/**
 * What landed since the cycle: the rows the apply layer wrote, and the observed events —
 * budget applies and status writes — stamped after the cycle. The events are the account's
 * own ledger, so a pause that went through outside the optimizer still counts.
 */
function appliedWords(report: ParsedCycleRunReport, events: readonly TimelineEvent[]): string {
  const cycleAt = Date.parse(report.latest_run?.cycle_ts ?? '');
  const since = (event: TimelineEvent) => {
    const at = Date.parse(event.ts);
    return Number.isNaN(cycleAt) || (!Number.isNaN(at) && at >= cycleAt - DAY_MS);
  };
  const appliedRows = report.latest_items.filter((item) => item.apply_status === 'applied').length;
  const appliedEvents = events
    .filter((event) => event.kind === 'applied' && since(event))
    .reduce((sum, event) => sum + event.count, 0);
  const moves = Math.max(appliedRows, appliedEvents);
  const statuses = events
    .filter((event) => event.kind === 'status' && since(event))
    .reduce((sum, event) => sum + event.count, 0);
  const parts: string[] = [];
  if (moves > 0) parts.push(plural(moves, 'budget move', 'budget moves'));
  if (statuses > 0) parts.push(plural(statuses, 'status change', 'status changes'));
  if (parts.length === 0) return 'none applied yet';
  return `${joinWords(parts)} applied`;
}

function lastCycleOf(
  report: ParsedCycleRunReport | null,
  events: readonly TimelineEvent[],
  timeZone?: string,
): LastCycle | null {
  const at = report?.latest_run?.cycle_ts;
  if (!report || !at) return null;
  return {
    at,
    when: cycleWhen(at, timeZone),
    proposed: proposedWords(report),
    applied: appliedWords(report, events),
  };
}

type AdsetTotals = { spend: number; results: number };

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * Each enrolled ad set's spend and results over the range, from the same snapshots and the
 * same rule the recap uses: the daily series between the range's dates, else the engine
 * window nearest the range. A projection has to subtract from the totals it is read against.
 */
export function adsetTotalsOver(
  snapshots: readonly RecapSnapshot[],
  range: ResolvedRange,
  kpiField: string,
): Map<string, AdsetTotals> {
  const out = new Map<string, AdsetTotals>();
  for (const snapshot of snapshots) {
    const totals: AdsetTotals = { spend: 0, results: 0 };
    const daily = snapshot.daily;
    if (daily && daily.length > 0) {
      for (const day of daily) {
        if (day.date < range.from || day.date > range.to) continue;
        totals.spend += num(day.spend);
        totals.results += num(day[kpiField]);
      }
    } else {
      const window = snapshot.windows?.[range.window];
      if (!window) continue;
      totals.spend += num(window.spend);
      totals.results += num(window[kpiField]);
    }
    out.set(snapshot.id, totals);
  }
  return out;
}

function projectionOf(args: {
  report: ParsedCycleRunReport | null;
  recap: RecapModel;
  adsetTotals: ReadonlyMap<string, AdsetTotals>;
  enrolledCount: number;
  metric: OptimizationMetricDefinition;
  target: number | null;
}): Projection | null {
  const pauses = (args.report?.recommendations ?? []).filter(
    (rec) => rec.status === 'pending' && rec.kind === 'pause',
  );
  if (pauses.length === 0) return null;
  const paused = new Set(pauses.map((rec) => rec.adset_id));
  let spend = args.recap.current.spend;
  let results = args.recap.current.results;
  for (const id of paused) {
    const totals = args.adsetTotals.get(id);
    if (!totals) continue;
    spend -= totals.spend;
    results -= totals.results;
  }
  const cost =
    results > 0 && spend >= 0
      ? deriveEfficiency(spend, results, args.metric.denominatorMultiplier)
      : null;
  const target = args.target != null && args.target > 0 ? args.target : null;
  return {
    pauses: paused.size,
    remaining: Math.max(0, args.enrolledCount - paused.size),
    cost,
    vsTarget:
      cost == null || target == null
        ? null
        : Math.round(cost * 100) === Math.round(target * 100)
          ? 'on'
          : cost < target
            ? 'under'
            : 'over',
  };
}

export function buildBeforeAfter(args: {
  report: ParsedCycleRunReport | null;
  recap: RecapModel;
  range: ResolvedRange;
  events: readonly TimelineEvent[];
  snapshots: readonly RecapSnapshot[];
  enrolledIds: Iterable<string>;
  metric: OptimizationMetricDefinition;
  /** Target in the metric's display unit. */
  target: number | null;
  timeZone?: string;
}): BeforeAfter {
  const { recap, range, metric } = args;
  const enrolled = new Set(args.enrolledIds);
  const scoped = args.snapshots.filter((snapshot) => enrolled.has(snapshot.id));
  const after: WindowTotals | null =
    recap.source === 'none'
      ? null
      : {
          label: windowLabel(range.from, range.to, range.days),
          short: shortRangeLabel(range.from, range.to, range.days),
          spend: recap.current.spend,
          results: recap.current.results,
          cost: recap.current.costPerResult,
        };
  const before: WindowTotals | null =
    recap.previous && range.previous
      ? {
          label: windowLabel(range.previous.from, range.previous.to, range.days),
          short: shortRangeLabel(range.previous.from, range.previous.to, range.days),
          spend: recap.previous.spend,
          results: recap.previous.results,
          cost: recap.previous.costPerResult,
        }
      : null;
  return {
    lastCycle: lastCycleOf(args.report, args.events, args.timeZone),
    before,
    after,
    projection: after
      ? projectionOf({
          report: args.report,
          recap,
          adsetTotals: adsetTotalsOver(scoped, range, metric.kpiField),
          enrolledCount: enrolled.size,
          metric,
          target: args.target,
        })
      : null,
    source: recap.source,
  };
}
