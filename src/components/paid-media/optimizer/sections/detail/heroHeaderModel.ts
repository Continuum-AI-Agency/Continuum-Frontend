// The line a portfolio opens on: its name, how it runs, when it was last read, how many ad
// sets it holds, and its fixed facts (objective, budget, target, window, strategy) as chips
// that open Manage. Everything the line says is decided here so it is testable against the
// real optimizer-status bodies (heroHeaderModel.test.ts); the component only draws it.
//
// This file used to be vitalsModel.ts and also decided six vital-sign rows, each a full-width
// green/red band. Performance+ redesign, stage 2 (docs/performance-plus-redesign/index.html):
// the bands are gone and the figures they carried now live in the headline sentences and the
// four tiles (./headlineModel). The header is what survived.

import type {
  BriefGrowth,
  OptimizationMetricDefinition,
  ParsedCycleRunReport,
  PortfolioListItem,
} from '@continuum/contracts';
import { formatCurrency, humanize } from '../../format';
import { rosterLine, rosterTone, staleLine } from '../portfolioStaleness';
import { type GoalMismatch, goalMismatchOf } from './goalMismatch';

/** What the header opens in Manage: the five settings its chips name, and the ad-set roster. */
export type HeroSetting = 'strategy' | 'objective' | 'target' | 'budget' | 'window' | 'roster';

/**
 * Ad sets bidding for a different result than the portfolio measures. All of them → the
 * portfolio moves nothing, and the fix is its objective; some → the fix is the roster
 * (changing the objective would strand the rest).
 */
export type HeroMismatch = Pick<
  GoalMismatch,
  'scope' | 'mismatched' | 'total' | 'bought' | 'measures'
> & {
  actions: Array<{ setting: HeroSetting; label: string; primary: boolean }>;
};

export type HeroHeader = {
  name: string;
  mode: { label: string; tone: 'good' | 'warn' | 'line' | 'idle' } | null;
  freshness: { text: string; stale: boolean } | null;
  roster: { text: string; tone: 'bad' | 'warn' } | null;
  /** "9 conjuntos" — null when the roster is unknown. */
  adsets: string | null;
  chips: Array<{ setting: HeroSetting; label: string; value: string }>;
  mismatch: HeroMismatch | null;
  secondary: { kind: 'stop' | 'resume' | 'review'; label: string } | null;
};

export type HeroPortfolio = Pick<
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

const count = (n: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

function singular(resultLabel: string): string {
  const word = resultLabel.toLowerCase();
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

/** "Sep 26, 1:03 PM". Date and time are formatted apart: ICU joins them with " at " in
 *  some runtimes and ", " in others, and the line has to read the same everywhere. */
export function dateTime(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone });
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  return `${day.format(at)}, ${time.format(at)}`;
}

export const budgetSourceWords = (source: string | null | undefined): string =>
  source === 'fixed' ? 'fixed' : 'follows spend';

function modeOf(portfolio: HeroPortfolio): HeroHeader['mode'] {
  switch ((portfolio.apply_mode ?? '').toLowerCase()) {
    case 'autopilot':
      return portfolio.autopilot_paused
        ? { label: 'Stopped', tone: 'warn' }
        : { label: 'Autopilot', tone: 'good' };
    case 'recommend':
      return { label: 'Recommend', tone: 'line' };
    case 'observe':
      return { label: 'Observe', tone: 'idle' };
    default:
      return null;
  }
}

function secondaryOf(portfolio: HeroPortfolio): HeroHeader['secondary'] {
  if (portfolio.apply_mode === 'autopilot') {
    return portfolio.autopilot_paused
      ? { kind: 'resume', label: 'Resume autopilot' }
      : { kind: 'stop', label: 'Stop autopilot' };
  }
  if (portfolio.apply_mode === 'recommend') return { kind: 'review', label: 'Review moves' };
  return null;
}

function mismatchOf(report: ParsedCycleRunReport | null, measures: string): HeroHeader['mismatch'] {
  const found = goalMismatchOf({ report, measures });
  if (!found) return null;
  const remove = { setting: 'roster', label: 'Remove these ad sets' } as const;
  return {
    scope: found.scope,
    mismatched: found.mismatched,
    total: found.total,
    bought: found.bought,
    measures: found.measures,
    actions:
      found.scope === 'all'
        ? [
            { setting: 'objective', label: 'Change objective', primary: true },
            { ...remove, primary: false },
          ]
        : [{ ...remove, primary: false }],
  };
}

/** The product's staleness line, in the header's language. */
function stalenessWords(portfolio: HeroPortfolio): string | null {
  const line = staleLine(portfolio);
  if (!line) return null;
  const days = portfolio.stale_for_days ?? 0;
  const dayWord = days === 1 ? 'day' : 'days';
  if (portfolio.last_actual_cycle_at) {
    return days === 0 ? 'a cycle was missed today' : `last cycle ${count(days)} ${dayWord} ago`;
  }
  return days === 0 ? 'no cycle yet' : `no cycle in ${count(days)} ${dayWord}`;
}

export function buildHeroHeader(args: {
  /** The latest status body: what its cycle held and why. Absent before the first cycle. */
  report?: ParsedCycleRunReport | null;
  portfolio: HeroPortfolio;
  lastCycleAt: string | null;
  growth: BriefGrowth | null;
  metric: OptimizationMetricDefinition;
  currency: string | null;
  timeZone?: string;
}): HeroHeader {
  const { portfolio, metric, currency } = args;
  const stale = stalenessWords(portfolio);
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
  // The list read carries the roster size; a status body alone has the ad sets its cycle scored.
  const adsets =
    typeof portfolio.adset_count === 'number'
      ? portfolio.adset_count
      : (args.report?.latest_items.length ?? null);
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
    adsets: adsets == null ? null : `${count(adsets)} ${adsets === 1 ? 'ad set' : 'ad sets'}`,
    chips: [
      { setting: 'objective', label: 'Objective', value: resultLabel },
      {
        setting: 'budget',
        label: 'Budget',
        value:
          portfolio.daily_total == null
            ? 'not set'
            : `${formatCurrency(portfolio.daily_total, currency)}/day · ${budgetSourceWords(portfolio.budget_source)}`,
      },
      {
        setting: 'target',
        label: 'Target',
        value: target == null ? 'not set' : `${formatCurrency(target, currency)} / ${per}`,
      },
      { setting: 'window', label: 'Window', value: `${lookback.replace(/^d/, '')} days` },
      { setting: 'strategy', label: 'Strategy', value: humanize(portfolio.mode) },
    ],
    mismatch: mismatchOf(args.report ?? null, resultLabel),
    secondary: secondaryOf(portfolio),
  };
}
