
import type {useTranslations as ScaleTranslationHook} from 'next-intl';
type ScaleCopy=ReturnType<typeof ScaleTranslationHook<'scale'>>;
import type { UiLocale } from '@/i18n/config';
import {
  type OptimizerDisplayTranslate,
  optimizerDisplayCopy,
} from '@/lib/paid-media/optimizationMetricPresentation';
// Before and after the last cycle (Performance+ redesign, portafolio.html idea 09): what the
// Optimizer did in its last cycle and what the window after it looks like against the window
// before. It renders accounts instead of describing.
//
// Three facts, each from a read the workspace already holds, and all of them the ENGINE's:
//   * the last cycle — `latest_run.cycle_ts`, the moves it proposed (pending recommendations
//     by kind, the cycle rows with a budget change) and what landed (the rows' apply status,
//     and the observed timeline events since the cycle: applied budgets, status writes);
//   * the two windows — the cost timeline's own series (optimizer_get_cpa_series): the last
//     cycle's window, and the same window as the cycle that ran one window earlier scored it.
//     The account snapshot read used to feed these, and it lists ACTIVE ad sets only — on
//     FORMULARIOS // TODOS it returned none of the portfolio's ad sets and the strip stayed
//     blank while the timeline and the table beside it read the engine fine;
//   * the projection — the last cycle's 14-day window with the ad sets a pending pause would
//     remove taken out, spend and results alike, at the engine's own interval for each (the
//     window `cpaInterval` scores), priced against the target. Nothing is modelled.

import type {
  CpaSeriesPoint,
  OptimizationMetricDefinition,
  ParsedCycleRunReport,
  ResolvedRange,
  TimelineEvent,
} from '@continuum/contracts';
import { deriveEfficiency } from '../../format';

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
  /** The window the projection prices: the one the engine's interval is computed on. */
  window: EngineWindow;
};

type EngineWindow = 'd3' | 'd7' | 'd14';

export type BeforeAfter = {
  lastCycle: LastCycle | null;
  before: WindowTotals | null;
  /** Null while the engine has no cycle series yet (still loading, or before the first
   *  cycle) — zeros would read as a window that bought nothing. */
  after: WindowTotals | null;
  projection: Projection | null;
  /** Where the windows came from: the engine's cycle series, or nothing yet. */
  source: 'engine' | 'none';
};

const DAY_MS = 86_400_000;

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });

/** "September 14 to 20", or "September 28 to October 4" across a month edge. */
export function dayRangeLabel(
  from: string,
  to: string,
  locale: UiLocale = 'en',
  translate?: OptimizerDisplayTranslate,
): string {
  const start = utcDate(from);
  const end = utcDate(to);
  if (translate || locale !== 'en') {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      return translate ? translate('dateRange', { start: from, end: to }) : from + '–' + to;
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).formatRange(start, end);
  }
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
export function shortRangeLabel(
  from: string,
  to: string,
  days: number,
  locale: UiLocale = 'en',
  translate?: OptimizerDisplayTranslate,
): string {
  const start = utcDate(from);
  const end = utcDate(to);
  if (translate || locale !== 'en') {
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return from + '–' + to;
    const range = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).formatRange(start, end);
    return days === 7 && translate ? translate('weekOf', { range }) : range;
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from}–${to}`;
  const range =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${monthShort(start)} ${start.getUTCDate()}–${end.getUTCDate()}`
      : `${monthShort(start)} ${start.getUTCDate()}–${monthShort(end)} ${end.getUTCDate()}`;
  return days === 7 ? `week of ${range}` : range;
}

function windowLabel(
  from: string,
  to: string,
  days: number,
  translate?: OptimizerDisplayTranslate,
  locale: UiLocale = 'en',
): string {
  const range = dayRangeLabel(from, to, locale, translate);
  return days === 7 ? `week of ${range}` : range;
}

/** "Saturday 19:05" in the account's zone. */
export function cycleWhen(iso: string, timeZone?: string, locale: UiLocale = 'en'): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const day = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : locale, {
    weekday: 'long',
    timeZone,
  }).format(at);
  const time = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(at);
  return `${day} ${time}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "a, b and c" */
function joinWords(
  parts: readonly string[],
  translate?: OptimizerDisplayTranslate,
  locale: UiLocale = 'en', uiTranslate?: ScaleCopy,
): string {
  if (translate)
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format([...parts]);
  if (parts.length <= 1) return parts[0] ?? '';
  return (uiTranslate ? uiTranslate('helper_c6a22df1409d', {v0: parts.slice(0, -1).join(', '), v1: parts[parts.length - 1]}) : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
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
function proposedWords(
  report: ParsedCycleRunReport,
  translate?: OptimizerDisplayTranslate,
  locale: UiLocale = 'en',
): string | null {
  const byKind = new Map<string, number>();
  for (const rec of report.recommendations) {
    if (rec.status !== 'pending') continue;
    byKind.set(rec.kind, (byKind.get(rec.kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [kind, n] of byKind) {
    const words = PROPOSAL_WORDS[kind] ?? ['recommendation', 'recommendations'];
    const keys = {
      pause: 'proposalPause',
      pause_ad: 'proposalAdPause',
      restore_delivery: 'proposalRestore',
      creative_refresh: 'proposalCreative',
      variate_creative: 'proposalVariation',
      seed_experiment: 'proposalExperiment',
      audience_expand: 'proposalAudience',
      settings: 'proposalSetting',
    } as const;
    const key = Object.hasOwn(keys, kind)
      ? keys[kind as keyof typeof keys]
      : 'proposalRecommendation';
    parts.push(translate ? translate(key, { count: n }) : plural(n, words[0], words[1]));
  }
  const moves = report.latest_items.filter((item) => (item.change_abs ?? 0) !== 0).length;
  if (moves > 0)
    parts.push(
      translate
        ? translate('proposalBudget', { count: moves })
        : plural(moves, 'budget move', 'budget moves'),
    );
  if (parts.length === 0) return null;
  return translate
    ? translate('proposalSummary', { parts: joinWords(parts, translate, locale) })
    : `${joinWords(parts)} proposed`;
}

/**
 * What landed since the cycle: the rows the apply layer wrote, and the observed events —
 * budget applies and status writes — stamped after the cycle. The events are the account's
 * own ledger, so a pause that went through outside the optimizer still counts.
 */
function appliedWords(
  report: ParsedCycleRunReport,
  events: readonly TimelineEvent[],
  translate?: OptimizerDisplayTranslate,
  locale: UiLocale = 'en',
): string {
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
  if (moves > 0)
    parts.push(
      translate
        ? translate('proposalBudget', { count: moves })
        : plural(moves, 'budget move', 'budget moves'),
    );
  if (statuses > 0)
    parts.push(
      translate
        ? translate('appliedStatus', { count: statuses })
        : plural(statuses, 'status change', 'status changes'),
    );
  if (parts.length === 0) return optimizerDisplayCopy('noneApplied', translate);
  return translate
    ? translate('appliedSummary', { parts: joinWords(parts, translate, locale) })
    : `${joinWords(parts)} applied`;
}

function lastCycleOf(
  report: ParsedCycleRunReport | null,
  events: readonly TimelineEvent[],
  timeZone?: string,
  translate?: OptimizerDisplayTranslate,
  locale: UiLocale = 'en',
): LastCycle | null {
  const at = report?.latest_run?.cycle_ts;
  if (!report || !at) return null;
  return {
    at,
    when: cycleWhen(at, timeZone, locale),
    proposed: proposedWords(report, translate, locale),
    applied: appliedWords(report, events, translate, locale),
  };
}

type AdsetTotals = { spend: number; results: number };

const WINDOW_DAYS: Record<EngineWindow, number> = { d3: 3, d7: 7, d14: 14 };

/** The ISO date `days` after (or before, negative) a cycle's UTC date. */
function shiftDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

const SERIES_FIELDS = {
  d3: { spend: 'spend_d3', results: 'conv_d3' },
  d7: { spend: 'spend_d7', results: 'conv_d7' },
  d14: { spend: 'spend_d14', results: 'conv_d14' },
} as const satisfies Record<
  EngineWindow,
  { spend: keyof CpaSeriesPoint; results: keyof CpaSeriesPoint }
>;

function spendOf(point: CpaSeriesPoint, window: EngineWindow): number {
  return point[SERIES_FIELDS[window].spend];
}

function resultsOf(point: CpaSeriesPoint, window: EngineWindow): number {
  return point[SERIES_FIELDS[window].results];
}

/**
 * A cycle's window as the engine scored it. The window is the N complete days BEFORE the
 * cycle's date: the d14 the 2026-10-11 cycle wrote on FORMULARIOS // TODOS sums
 * September 27 to October 10 (1,807.63 MXN, 27 leads), not the 14 days ending on the 11th.
 */
function windowTotals(
  point: CpaSeriesPoint,
  window: EngineWindow,
  metric: OptimizationMetricDefinition,
  translate?: OptimizerDisplayTranslate,
  locale: UiLocale = 'en',
): WindowTotals {
  const days = WINDOW_DAYS[window];
  const from = shiftDate(point.cycle_ts, -days);
  const to = shiftDate(point.cycle_ts, -1);
  const spend = spendOf(point, window);
  const results = resultsOf(point, window);
  return {
    label: windowLabel(from, to, days, translate, locale),
    short: shortRangeLabel(from, to, days, locale, translate),
    spend,
    results,
    cost: deriveEfficiency(spend, results, metric.denominatorMultiplier),
  };
}

const latestFirst = (a: CpaSeriesPoint, b: CpaSeriesPoint): number =>
  Date.parse(b.cycle_ts) - Date.parse(a.cycle_ts);

/** The cycle that scored the window just before `latest`'s: the one run `days` earlier,
 *  a day either side (the cron drifts by minutes and a manual run can land on another day). */
function cycleOneWindowBefore(
  ordered: readonly CpaSeriesPoint[],
  latest: CpaSeriesPoint,
  days: number,
): CpaSeriesPoint | null {
  const wanted = Date.parse(shiftDate(latest.cycle_ts, -days));
  let best: { point: CpaSeriesPoint; distance: number } | null = null;
  for (const point of ordered) {
    const distance = Math.abs(Date.parse(point.cycle_ts.slice(0, 10)) - wanted);
    if (distance > DAY_MS) continue;
    if (!best || distance < best.distance) best = { point, distance };
  }
  return best?.point ?? null;
}

/**
 * What a pending pause takes out of the engine's window: the ad set's own interval (cost ×
 * events, events) when it bought something; when it bought nothing the interval carries no
 * spend, and the zero-conversion pause states it as its evidence (metric `spend` over the same
 * window). Null when neither says — a projection that silently kept that spend would be wrong.
 */
function pausedTotals(
  adsetId: string,
  report: ParsedCycleRunReport,
  window: EngineWindow,
): AdsetTotals | null {
  const ci = report.latest_items.find((item) => item.adset_id === adsetId)?.diagnostics?.ci;
  const events = ci?.events;
  const cpa = ci?.cpa;
  if (typeof events === 'number' && events > 0 && typeof cpa === 'number' && cpa > 0) {
    return { spend: cpa * events, results: events };
  }
  const evidence = report.recommendations.find(
    (rec) => rec.adset_id === adsetId && rec.status === 'pending' && rec.kind === 'pause',
  )?.evidence;
  if (evidence?.metric === 'spend' && evidence.window === window) {
    return { spend: evidence.value, results: 0 };
  }
  return null;
}

/** The engine computes every ad set's interval on its 14-day window (cpaInterval). */
const INTERVAL_WINDOW: EngineWindow = 'd14';

function projectionOf(args: {
  report: ParsedCycleRunReport | null;
  latest: CpaSeriesPoint;
  metric: OptimizationMetricDefinition;
  target: number | null;
}): Projection | null {
  const report = args.report;
  if (!report) return null;
  const paused = new Set(
    report.recommendations
      .filter((rec) => rec.status === 'pending' && rec.kind === 'pause')
      .map((rec) => rec.adset_id),
  );
  if (paused.size === 0) return null;
  let spend = spendOf(args.latest, INTERVAL_WINDOW);
  let results = resultsOf(args.latest, INTERVAL_WINDOW);
  for (const id of paused) {
    const totals = pausedTotals(id, report, INTERVAL_WINDOW);
    if (!totals) return null;
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
    remaining: Math.max(0, args.latest.adsets - paused.size),
    cost,
    vsTarget:
      cost == null || target == null
        ? null
        : Math.round(cost * 100) === Math.round(target * 100)
          ? 'on'
          : cost < target
            ? 'under'
            : 'over',
    window: INTERVAL_WINDOW,
  };
}

export function buildBeforeAfter(args: {
  report: ParsedCycleRunReport | null;
  /** The engine's per-cycle series — the read the cost timeline draws. */
  series: readonly CpaSeriesPoint[];
  range: ResolvedRange;
  events: readonly TimelineEvent[];
  metric: OptimizationMetricDefinition;
  /** Target in the metric's display unit. */
  target: number | null;
  timeZone?: string;
  translate?: OptimizerDisplayTranslate;
  locale?: UiLocale;
}): BeforeAfter {
  const { range, metric } = args;
  const ordered = [...args.series]
    .filter((point) => !Number.isNaN(Date.parse(point.cycle_ts)))
    .sort(latestFirst);
  const latest = ordered[0] ?? null;
  const lastCycle = lastCycleOf(
    args.report,
    args.events,
    args.timeZone,
    args.translate,
    args.locale,
  );
  if (!latest) {
    return { lastCycle, before: null, after: null, projection: null, source: 'none' };
  }
  const window = range.window;
  const prior = cycleOneWindowBefore(ordered, latest, WINDOW_DAYS[window]);
  return {
    lastCycle,
    before: prior ? windowTotals(prior, window, metric, args.translate, args.locale) : null,
    after: windowTotals(latest, window, metric, args.translate, args.locale),
    projection: projectionOf({ report: args.report, latest, metric, target: args.target }),
    source: 'engine',
  };
}
