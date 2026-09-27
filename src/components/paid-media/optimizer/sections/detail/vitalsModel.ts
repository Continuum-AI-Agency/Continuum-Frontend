// The portfolio's vital signs: the header (name, mode, freshness, the five settings) and six
// rows, each a value read against its own reference — the target, what the spend buys at
// target, the daily budget, the event floor, the ad sets the cycle scored, and zero. The
// component only draws what this file decides, so every tone and sentence is testable
// against the real optimizer-status bodies (vitalsModel.test.ts).
//
// The row ORDER is fixed on purpose: the eye learns where each figure lives once. What
// changes between portfolios is colour and sentence, never position.

import type {
  BriefGrowth,
  CycleItemRow,
  OptimizationMetricDefinition,
  ParsedCycleRunReport,
  PortfolioListItem,
} from '@continuum/contracts';
import { formatCurrency, humanize } from '../../format';
import { applyModePill } from '../../reportModel';
import { isStale, rosterLine, rosterTone, staleLine } from '../portfolioStaleness';

export type VitalTone = 'good' | 'warn' | 'bad' | 'idle';

export type BulletBar = {
  kind: 'bullet';
  /** The scale's right edge. The value is clamped to it; the bands tile 0..max. */
  max: number;
  /** Null draws the bands and the reference with no fill — nothing measured yet. */
  value: number | null;
  ref: number;
  refLabel: string;
  bands: Array<{ to: number; tone: VitalTone }>;
};

export type OutcomeBar = {
  kind: 'outcome';
  total: number;
  applied: number;
  failed: number;
  held: number;
};

export type VitalRow = {
  key: 'cost' | 'results' | 'spend' | 'confidence' | 'cycle' | 'pending';
  label: string;
  value: string;
  unit: string;
  tone: VitalTone;
  reading: string;
  bar: BulletBar | OutcomeBar | null;
};

/** The five settings a header chip opens in Manage. */
export type HeroSetting = 'strategy' | 'objective' | 'target' | 'budget' | 'window';

export type HeroHeader = {
  name: string;
  mode: { label: string; tone: 'good' | 'warn' | 'line' | 'idle' } | null;
  freshness: { text: string; stale: boolean } | null;
  roster: { text: string; tone: 'bad' | 'warn' } | null;
  chips: Array<{ setting: HeroSetting; label: string; value: string }>;
  secondary: { kind: 'stop' | 'resume' | 'review'; label: string } | null;
};

export type VitalsPortfolio = Pick<
  PortfolioListItem,
  | 'name'
  | 'mode'
  | 'objective'
  | 'apply_mode'
  | 'autopilot_paused'
  | 'cpa_target'
  | 'daily_total'
  | 'budget_source'
  | 'lookback_window'
  | 'next_realloc_at'
  | 'stale_for_days'
  | 'last_actual_cycle_at'
  | 'roster_state'
  | 'roster_absent_since'
  | 'roster_missing_count'
  | 'adset_count'
>;

/** Events per ad set below which the engine calls a sample thin (confidence.ts). */
const DEFAULT_FLOOR_EVENTS = 20;
const DAY_MS = 86_400_000;

const count = (n: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${count(n)} ${n === 1 ? one : many}`;

function singular(resultLabel: string): string {
  const word = resultLabel.toLowerCase();
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "Sep 26, 1:03 PM". Date and time are formatted apart: ICU joins them with " at " in some
 *  runtimes and ", " in others, and the row has to read the same everywhere. */
function dateTime(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone });
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  return `${day.format(at)}, ${time.format(at)}`;
}

const windowDays = (window: BriefGrowth['window']): number => Number(window.slice(1));

/**
 * The days the window actually covers: a portfolio younger than its window has only been
 * spending since it was created, and dividing its spend by 14 would call a two-day-old
 * portfolio 86% under budget. Calendar days, both ends counted, as the snapshots are.
 */
function coveredDays(growth: BriefGrowth, createdAt: string | null): number {
  const window = windowDays(growth.window);
  const created = createdAt ? Date.parse(createdAt.slice(0, 10)) : Number.NaN;
  const asOf = Date.parse(growth.as_of.slice(0, 10));
  if (Number.isNaN(created) || Number.isNaN(asOf)) return window;
  const age = Math.round((asOf - created) / DAY_MS) + 1;
  return Math.max(1, Math.min(window, age));
}

/** The status body's portfolio row keeps created_at although the contract does not declare it. */
function createdAtOf(report: ParsedCycleRunReport | null): string | null {
  const value = report?.portfolio?.created_at;
  return typeof value === 'string' ? value : null;
}

type Outcome = { applied: number; failed: number; held: number; mismatched: number };

/**
 * What happened to each ad set the cycle scored. `apply_status` is the apply layer's own
 * word; without one, a frozen ad set was held on purpose and a scored change nobody wrote
 * is waiting. A zero change with no status is simply unchanged, and counts in none.
 */
function outcomeOf(items: readonly CycleItemRow[]): Outcome {
  const out: Outcome = { applied: 0, failed: 0, held: 0, mismatched: 0 };
  for (const item of items) {
    const frozen = item.diagnostics?.freezeReason ?? null;
    switch (item.apply_status) {
      case 'applied':
        out.applied += 1;
        break;
      case 'failed':
        out.failed += 1;
        break;
      case 'held':
      case 'approved_pending':
        out.held += 1;
        break;
      case 'skipped':
        break;
      default:
        if (frozen || (item.change_abs ?? 0) !== 0) out.held += 1;
    }
    if (frozen === 'kpi_mismatch') out.mismatched += 1;
  }
  return out;
}

function costRow(
  growth: BriefGrowth,
  metric: OptimizationMetricDefinition,
  currency: string | null,
  period: string,
): VitalRow {
  const unit = singular(growth.result_label);
  const label = `${metric.denominatorMultiplier === 1 ? `Cost per ${unit}` : metric.costLabel} · ${period}`;
  const cost = growth.cost_per_result;
  const target = growth.target != null && growth.target > 0 ? growth.target : null;
  const value = cost == null ? '—' : formatCurrency(cost, currency);
  if (target == null) {
    return {
      key: 'cost',
      label,
      value,
      unit: '',
      tone: 'idle',
      reading: 'No target set',
      bar: null,
    };
  }
  const max = target * 2;
  const bar: BulletBar = {
    kind: 'bullet',
    max,
    value: cost,
    ref: target,
    refLabel: `${formatCurrency(target, currency)} target`,
    bands: [
      { to: target, tone: 'good' },
      { to: target * 1.15, tone: 'warn' },
      { to: max, tone: 'bad' },
    ],
  };
  if (cost == null) {
    const why = growth.results === 0 ? `No ${growth.result_label} yet` : 'Not priced yet';
    return {
      key: 'cost',
      label,
      value,
      unit: '',
      tone: 'idle',
      reading: `${why} · target ${formatCurrency(target, currency)}`,
      bar,
    };
  }
  const ratio = cost / target;
  const pct = Math.round((ratio - 1) * 100);
  return {
    key: 'cost',
    label,
    value,
    unit: '',
    tone: ratio <= 1 ? 'good' : ratio <= 1.15 ? 'warn' : 'bad',
    reading: `${pct > 0 ? '+' : ''}${pct}% vs the ${formatCurrency(target, currency)} target`,
    bar,
  };
}

function resultsRow(growth: BriefGrowth, currency: string | null, period: string): VitalRow {
  const label = `${capitalise(growth.result_label)} · ${period}`;
  const results = growth.results;
  const value = count(results);
  if (results === 0) {
    return {
      key: 'results',
      label,
      value,
      unit: '',
      tone: 'bad',
      reading: `${formatCurrency(growth.spend, currency)} spent, none yet`,
      bar: null,
    };
  }
  const target = growth.target != null && growth.target > 0 ? growth.target : null;
  if (target == null) {
    return {
      key: 'results',
      label,
      value,
      unit: '',
      tone: 'idle',
      reading: 'No target to read against',
      bar: null,
    };
  }
  const atTarget = growth.spend / target;
  const max = Math.max(results, atTarget) * 1.2;
  return {
    key: 'results',
    label,
    value,
    unit: '',
    tone: results >= atTarget ? 'good' : results >= atTarget * 0.87 ? 'warn' : 'bad',
    reading: `${count(atTarget)} at target for the same spend`,
    bar: {
      kind: 'bullet',
      max,
      value: results,
      ref: atTarget,
      refLabel: `${count(atTarget)} at target`,
      bands: [
        { to: atTarget * 0.87, tone: 'bad' },
        { to: atTarget, tone: 'warn' },
        { to: max, tone: 'good' },
      ],
    },
  };
}

function spendRow(
  growth: BriefGrowth,
  portfolio: VitalsPortfolio,
  currency: string | null,
  days: number,
): VitalRow {
  const perDay = growth.spend / days;
  const value = formatCurrency(perDay, currency);
  const budget =
    portfolio.daily_total != null && portfolio.daily_total > 0 ? portfolio.daily_total : null;
  if (budget == null) {
    return {
      key: 'spend',
      label: 'Spend per day',
      value,
      unit: '',
      tone: 'idle',
      reading: 'No daily budget set',
      bar: null,
    };
  }
  const pct = perDay / budget;
  const max = budget * 1.25;
  return {
    key: 'spend',
    label: 'Spend per day',
    value,
    unit: '',
    tone: pct > 1.05 ? 'bad' : pct < 0.6 ? 'warn' : 'good',
    reading: `${Math.round(pct * 100)}% of the ${formatCurrency(budget, currency)} budget · ${budgetSourceWords(portfolio.budget_source)}`,
    bar: {
      kind: 'bullet',
      max,
      value: perDay,
      ref: budget,
      refLabel: `${formatCurrency(budget, currency)} budget`,
      bands: [
        { to: budget * 0.6, tone: 'warn' },
        { to: budget * 1.05, tone: 'good' },
        { to: max, tone: 'bad' },
      ],
    },
  };
}

const budgetSourceWords = (source: string | null | undefined): string =>
  source === 'fixed' ? 'fixed' : 'matches spend';

/**
 * The engine's kpi_mismatch actionable, in one line. Its message is a sentence written for
 * the whole card; the row keeps its head: "12 of 12 ad sets bid for purchases, not
 * conversations". A message in a shape this does not know falls back to the ad-set count.
 */
function mismatchLine(message: string, mismatched: number, total: number, units: string): string {
  const said = /^(\d+) of (\d+) ad sets.*? bid for (.+?), not the (.+?) this portfolio prices/.exec(
    message,
  );
  if (said) return `${said[1]} of ${said[2]} ad sets bid for ${said[3]}, not ${said[4]}`;
  return `${mismatched} of ${total} ad sets bid for a different result than ${units}`;
}

function confidenceRow(report: ParsedCycleRunReport | null, growth: BriefGrowth): VitalRow {
  const confidence = report?.latest_run?.confidence ?? null;
  const total = report?.latest_items.length ?? 0;
  const units = growth.result_label;
  if (!confidence?.band) {
    return {
      key: 'confidence',
      label: 'Confidence',
      value: '—',
      unit: '',
      tone: 'idle',
      reading: 'Not scored yet',
      bar: null,
    };
  }
  const band = confidence.band;
  const events = confidence.events ?? 0;
  const floor = confidence.underFloor?.floorEvents ?? DEFAULT_FLOOR_EVENTS;
  const under = confidence.underFloor?.adsetIds.length ?? 0;
  const mismatch = confidence.actionables?.find((a) => a.code === 'kpi_mismatch') ?? null;
  const floorTotal = Math.max(total, 1) * floor;
  const max = Math.max(events, floorTotal) * 1.1;
  const reading = mismatch
    ? mismatchLine(mismatch.message, mismatch.adsetIds.length, total, units)
    : events === 0
      ? `No ${units} yet`
      : `${count(events)} ${units} · ${
          under === 0
            ? `every ad set over the ${floor}-event floor`
            : `${under} of ${plural(total, 'ad set')} under the ${floor}-event floor`
        }`;
  return {
    key: 'confidence',
    label: 'Confidence',
    value: capitalise(band),
    unit: '',
    tone:
      band === 'high'
        ? 'good'
        : band === 'medium'
          ? 'warn'
          : growth.results === 0
            ? 'idle'
            : 'warn',
    reading,
    bar: {
      kind: 'bullet',
      max,
      value: events,
      ref: floorTotal,
      refLabel: `${count(floorTotal)} events: ${floor} per ad set`,
      bands: [
        { to: floorTotal, tone: 'warn' },
        { to: max, tone: 'good' },
      ],
    },
  };
}

function cycleRow(
  report: ParsedCycleRunReport | null,
  portfolio: VitalsPortfolio,
  timeZone?: string,
): VitalRow {
  const items = report?.latest_items ?? [];
  const n = items.length;
  const o = outcomeOf(items);
  const bar: OutcomeBar = {
    kind: 'outcome',
    total: n,
    applied: o.applied,
    failed: o.failed,
    held: o.held,
  };
  if (isStale(portfolio)) {
    const since = dateTime(portfolio.last_actual_cycle_at, timeZone);
    return {
      key: 'cycle',
      label: 'Last cycle',
      value: String(portfolio.stale_for_days),
      unit: 'days ago',
      tone: 'bad',
      reading: since
        ? `No cycle since ${since}`
        : capitalise(staleLine(portfolio) ?? 'No cycle yet'),
      bar,
    };
  }
  if (n === 0) {
    return {
      key: 'cycle',
      label: 'Last cycle',
      value: '—',
      unit: '',
      tone: 'idle',
      reading: 'No ad sets scored yet',
      bar: null,
    };
  }
  const recommend = portfolio.apply_mode === 'recommend';
  const moved = `${o.applied} of ${n} moved`;
  const next = dateTime(portfolio.next_realloc_at, timeZone);
  let tone: VitalTone = 'good';
  let reading = next ? `${moved} · next ${next}` : moved;
  if (o.failed * 2 >= n) {
    tone = 'bad';
    reading = `${o.failed} of ${n} moves failed`;
  } else if (o.held === n) {
    tone = recommend ? 'warn' : 'bad';
    reading = `${o.held} of ${n} held · ${
      recommend
        ? 'waiting for your approval'
        : o.mismatched === n
          ? 'they bid for a different result'
          : 'nothing moved'
    }`;
  } else if (o.failed > 0) {
    tone = 'bad';
    reading = `${moved} · ${o.failed} failed${o.held > 0 ? `, ${o.held} held` : ''}`;
  }
  return {
    key: 'cycle',
    label: 'Last cycle',
    value: `${o.applied}/${n}`,
    unit: 'moved',
    tone,
    reading,
    bar,
  };
}

function pendingRow(report: ParsedCycleRunReport | null, portfolio: VitalsPortfolio): VitalRow {
  const recs = report?.recommendations.filter((r) => r.status === 'pending').length ?? 0;
  const recommend = portfolio.apply_mode === 'recommend';
  const held = recommend ? outcomeOf(report?.latest_items ?? []).held : 0;
  const waiting = recs + held;
  const recWords = plural(recs, 'recommendation');
  return {
    key: 'pending',
    label: 'Waiting for you',
    value: String(waiting),
    unit: '',
    tone: waiting > 0 ? 'warn' : 'good',
    reading:
      waiting === 0
        ? 'Nothing waiting'
        : recommend
          ? `${plural(held, 'budget move')} + ${recWords}`
          : recWords,
    bar: null,
  };
}

export function buildVitals(args: {
  report: ParsedCycleRunReport | null;
  growth: BriefGrowth;
  portfolio: VitalsPortfolio;
  metric: OptimizationMetricDefinition;
  currency: string | null;
  timeZone?: string;
}): VitalRow[] {
  const { report, growth, portfolio, metric, currency, timeZone } = args;
  const days = coveredDays(growth, createdAtOf(report));
  const period = days < windowDays(growth.window) ? 'so far' : growth.window.slice(1).concat('d');
  return [
    costRow(growth, metric, currency, period),
    resultsRow(growth, currency, period),
    spendRow(growth, portfolio, currency, days),
    confidenceRow(report, growth),
    cycleRow(report, portfolio, timeZone),
    pendingRow(report, portfolio),
  ];
}

function modeOf(portfolio: VitalsPortfolio): HeroHeader['mode'] {
  const pill = applyModePill(portfolio.apply_mode);
  if (!pill) return null;
  if (portfolio.apply_mode === 'autopilot') {
    return portfolio.autopilot_paused
      ? { label: 'Stopped', tone: 'warn' }
      : { label: pill.label, tone: 'good' };
  }
  return { label: pill.label, tone: portfolio.apply_mode === 'recommend' ? 'line' : 'idle' };
}

function secondaryOf(portfolio: VitalsPortfolio): HeroHeader['secondary'] {
  if (portfolio.apply_mode === 'autopilot') {
    return portfolio.autopilot_paused
      ? { kind: 'resume', label: 'Resume autopilot' }
      : { kind: 'stop', label: 'Stop autopilot' };
  }
  if (portfolio.apply_mode === 'recommend') return { kind: 'review', label: 'Review moves' };
  return null;
}

export function buildHeroHeader(args: {
  portfolio: VitalsPortfolio;
  lastCycleAt: string | null;
  growth: BriefGrowth | null;
  metric: OptimizationMetricDefinition;
  currency: string | null;
  timeZone?: string;
}): HeroHeader {
  const { portfolio, metric, currency } = args;
  const stale = staleLine(portfolio);
  const updated = dateTime(args.lastCycleAt, args.timeZone);
  const roster = rosterLine(portfolio);
  const rosterColour = rosterTone(portfolio);
  const resultLabel = args.growth?.result_label ?? metric.resultLabel.toLowerCase();
  const per =
    metric.denominatorMultiplier === 1
      ? singular(resultLabel)
      : `${count(metric.denominatorMultiplier)} ${resultLabel}`;
  // The target is stored per result; the screen reads it in the metric's display unit.
  const target =
    portfolio.cpa_target != null && portfolio.cpa_target > 0
      ? portfolio.cpa_target * metric.denominatorMultiplier
      : null;
  const lookback = portfolio.lookback_window ?? 'd14';
  return {
    name: portfolio.name,
    mode: modeOf(portfolio),
    freshness: stale
      ? { text: stale, stale: true }
      : updated
        ? { text: `Updated ${updated}`, stale: false }
        : null,
    roster:
      roster && rosterColour
        ? { text: roster, tone: rosterColour === 'danger' ? 'bad' : 'warn' }
        : null,
    chips: [
      { setting: 'strategy', label: 'Strategy', value: humanize(portfolio.mode) },
      { setting: 'objective', label: 'Objective', value: humanize(portfolio.objective) },
      {
        setting: 'target',
        label: 'Target',
        value: target == null ? 'Not set' : `${formatCurrency(target, currency)} / ${per}`,
      },
      {
        setting: 'budget',
        label: 'Budget',
        value:
          portfolio.daily_total == null
            ? 'Not set'
            : `${formatCurrency(portfolio.daily_total, currency)}/day · ${budgetSourceWords(portfolio.budget_source)}`,
      },
      { setting: 'window', label: 'Window', value: `${lookback.replace(/^d/, '')} days` },
    ],
    secondary: secondaryOf(portfolio),
  };
}
