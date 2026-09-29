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
  /** "semana del 14 al 20 de septiembre" */
  label: string;
  spend: number;
  results: number;
  /** Cost per result in the metric's display unit; null with no results. */
  cost: number | null;
};

export type LastCycle = {
  at: string;
  /** "sábado 19:05" */
  when: string;
  /** "2 pausas y 1 restauración propuestas" — null when the cycle proposed nothing. */
  proposed: string | null;
  /** "ninguna aplicada todavía" / "4 movimientos de presupuesto y 1 pausa aplicados" */
  applied: string;
};

export type Projection = {
  pauses: number;
  /** Ad sets left once the pauses land. */
  remaining: number;
  /** Cost per result over the current window without the paused ad sets; null when the
   *  rest bought nothing. */
  cost: number | null;
  vsTarget: 'bajo' | 'sobre' | 'en' | null;
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

const MONTH = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' });

/** "14 al 20 de septiembre", or "28 de septiembre al 4 de octubre" across a month edge. */
export function dayRangeLabel(from: string, to: string): string {
  const start = utcDate(from);
  const end = utcDate(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${from} al ${to}`;
  const endWords = `${end.getUTCDate()} de ${MONTH.format(end)}`;
  if (
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear()
  ) {
    return `${start.getUTCDate()} al ${endWords}`;
  }
  return `${start.getUTCDate()} de ${MONTH.format(start)} al ${endWords}`;
}

function windowLabel(from: string, to: string, days: number): string {
  const range = dayRangeLabel(from, to);
  return days === 7 ? `semana del ${range}` : `del ${range}`;
}

/** "sábado 19:05" in the account's zone. */
export function cycleWhen(iso: string, timeZone?: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const day = new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone }).format(at);
  const time = new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(at);
  return `${day} ${time}`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "a, b y c" */
function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

const PROPOSAL_WORDS: Record<string, [string, string]> = {
  pause: ['pausa', 'pausas'],
  pause_ad: ['pausa de anuncio', 'pausas de anuncio'],
  restore_delivery: ['restauración', 'restauraciones'],
  creative_refresh: ['cambio de creativo', 'cambios de creativo'],
  variate_creative: ['variación del ganador', 'variaciones del ganador'],
  seed_experiment: ['experimento', 'experimentos'],
  audience_expand: ['audiencia nueva', 'audiencias nuevas'],
  settings: ['ajuste', 'ajustes'],
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
    const words = PROPOSAL_WORDS[kind] ?? ['recomendación', 'recomendaciones'];
    parts.push(plural(n, words[0], words[1]));
  }
  const moves = report.latest_items.filter((item) => (item.change_abs ?? 0) !== 0).length;
  if (moves > 0)
    parts.push(plural(moves, 'movimiento de presupuesto', 'movimientos de presupuesto'));
  if (parts.length === 0) return null;
  const total = [...byKind.values()].reduce((sum, n) => sum + n, 0) + moves;
  return `${joinWords(parts)} ${total === 1 ? 'propuesta' : 'propuestas'}`;
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
  if (moves > 0)
    parts.push(plural(moves, 'movimiento de presupuesto', 'movimientos de presupuesto'));
  if (statuses > 0) parts.push(plural(statuses, 'cambio de estado', 'cambios de estado'));
  if (parts.length === 0) return 'ninguna aplicada todavía';
  return `${joinWords(parts)} ${moves + statuses === 1 ? 'aplicado' : 'aplicados'}`;
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
          ? 'en'
          : cost < target
            ? 'bajo'
            : 'sobre',
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
          spend: recap.current.spend,
          results: recap.current.results,
          cost: recap.current.costPerResult,
        };
  const before: WindowTotals | null =
    recap.previous && range.previous
      ? {
          label: windowLabel(range.previous.from, range.previous.to, range.days),
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
