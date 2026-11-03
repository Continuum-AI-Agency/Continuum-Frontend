// The Goal tile's math (H02): which goals the Home measures for a brand, and each one's value
// month to date, from one account_overview read per ad account over the 1st of the month through
// yesterday. Pure, so every figure the tile prints can be checked against its reads.
//
// Money is never added across currencies: a money goal has one amount per currency, the Home's
// lead currency first (totalsByCurrency). A count (leads, conversations, purchases) is the same
// unit everywhere, so it is summed across every account. When the team set a target for the
// primary goal, its figure is read over the target's period instead (goalTargetModel.ts);
// secondaries stay on the month.

import {
  HOME_OBJECTIVE_METRICS,
  HOME_PROFILE_BRAND_SCOPE,
  type HomeObjective,
  type HomeProfileRow,
  resolveHomeObjectives,
} from '@continuum/contracts';
import type { AccountReadFailure, HomeAdAccount } from '@/lib/home/homeAccounts';
import {
  type HomeAccountOverview,
  resultTotalsAcross,
  sumOverviews,
  totalsByCurrency,
} from '@/lib/home/homeOverviewModel';
import { calendarDayIn, shiftDay } from '@/lib/paid-media/reportingWindow';
import {
  type GoalActiveTarget,
  type GoalTargetStatus,
  type GoalTargetsLoad,
  goalTargetComparison,
  goalTargetFor,
  goalTargetPeriod,
} from './goalTargetModel';

/** The complete days of the month so far, inclusive on both ends. */
export type GoalWindow = { since: string; until: string };

/** The 1st of the month through yesterday, in the viewer's calendar (the zone the Home's other
 *  windows use). Null on the 1st: the month has no complete day yet. */
export function monthToDateWindow(now: Date = new Date(), timeZone?: string): GoalWindow | null {
  const today = calendarDayIn(now, timeZone);
  const since = `${today.slice(0, 8)}01`;
  if (today === since) return null;
  return { since, until: shiftDay(today, -1) };
}

const dayLabel = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Nov 1", for a `YYYY-MM-DD` day. */
export function goalDayLabel(day: string): string {
  return dayLabel.format(new Date(`${day}T00:00:00Z`));
}

/** "Nov 1 – Nov 2", or "Nov 1" for a single day: the days a figure covers. */
export function goalWindowLabel(window: GoalWindow): string {
  const since = goalDayLabel(window.since);
  return window.since === window.until ? since : `${since} – ${goalDayLabel(window.until)}`;
}

/** One ad account's month to date, in the Home's words (Google already through its buckets). */
export type GoalAccountRead = { account: HomeAdAccount; overview: HomeAccountOverview };

export type GoalLoad =
  /** Nothing to read: no ad account, or no complete day this month. */
  | { status: 'idle' }
  | { status: 'loading' }
  /** No account answered. */
  | { status: 'error'; failures: AccountReadFailure[] }
  | { status: 'ready'; reads: GoalAccountRead[]; failures: AccountReadFailure[] };

export type GoalAmount = {
  /** Null for a count, which is summed across currencies. */
  currency: string | null;
  value: number;
  /** Day by day over the window, in date order; empty with a single day. */
  series: number[];
  accountCount: number;
};

export type GoalFigure = {
  objective: HomeObjective;
  unit: 'count' | 'currency';
  /** A count: one amount across every account. Money: one per currency, the lead one first.
   *  Empty when no account counts the goal. */
  amounts: GoalAmount[];
  /** No account in the read reports this goal at all (Google has no conversations). */
  unreported: boolean;
};

function currencyGroups(reads: GoalAccountRead[]) {
  return totalsByCurrency(
    reads.map(({ account, overview }) => ({
      currency: account.currency ?? overview.currency ?? null,
      overview,
    })),
  );
}

export function goalFigure(objective: HomeObjective, reads: GoalAccountRead[]): GoalFigure {
  const { metric } = objective;
  const unit = HOME_OBJECTIVE_METRICS[metric].unit;

  if (unit === 'count') {
    const totals = sumOverviews(reads.map((read) => read.overview));
    const value = totals.current[metric];
    return {
      objective,
      unit,
      amounts:
        value === undefined
          ? []
          : [
              {
                currency: null,
                value,
                series: totals.series[metric] ?? [],
                accountCount: totals.accountCount,
              },
            ],
      unreported: totals.unreported.includes(metric),
    };
  }

  // A currency where no account spent this month or the window before has nothing to say, unless
  // it is all there is.
  const groups = currencyGroups(reads);
  const spending = groups.filter((group) => group.spending > 0);
  const shown = spending.length > 0 ? spending : groups.slice(0, 1);
  return {
    objective,
    unit,
    amounts: shown.flatMap((group) => {
      const value = group.totals.current[metric];
      return value === undefined
        ? []
        : [
            {
              currency: group.currency,
              value,
              series: group.totals.series[metric] ?? [],
              accountCount: group.totals.accountCount,
            },
          ];
    }),
    unreported: reads.length > 0 && groups.every((g) => g.totals.unreported.includes(metric)),
  };
}

export type GoalSource = 'team' | 'results' | 'business';

export const MAX_SECONDARY_GOALS = 3;

/**
 * The goals the tile measures for a scope: the saved row for it (or the brand's), else what the
 * month's results suggest, else the Brand Book's suggestion. Secondaries are the saved (or
 * inferred) ones; with none, the reading's suggestion fills in. Never the primary twice.
 */
export function goalObjectives(input: {
  scope: string;
  rows: HomeProfileRow[];
  reads: GoalAccountRead[];
  suggested: HomeObjective[];
}): { primary: HomeObjective; secondaries: HomeObjective[]; source: GoalSource } {
  const resolved = resolveHomeObjectives({
    scope: input.scope,
    rows: input.rows,
    totals: resultTotalsAcross(currencyGroups(input.reads)),
    suggested: input.suggested,
  });
  const [first] = resolved.objectives;
  const primary =
    resolved.objectives.find((goal) => goal.role === 'primary') ??
    first ??
    ({ id: 'spend', label: 'Spend', metric: 'spend', role: 'primary' } as const);
  const others = resolved.objectives.filter((goal) => goal !== primary);
  const pool = others.length > 0 ? others : input.suggested;
  const seen = new Set([primary.metric]);
  const secondaries = pool.filter((goal) => {
    if (seen.has(goal.metric)) return false;
    seen.add(goal.metric);
    return true;
  });

  return {
    primary,
    secondaries: secondaries.slice(0, MAX_SECONDARY_GOALS),
    source: resolved.fromSuggestion ? 'business' : resolved.source === 'user' ? 'team' : 'results',
  };
}

export type GoalMissingReason = 'no-account' | 'month-start' | 'not-counted';

export type GoalTileView =
  | { state: 'missing'; reason: GoalMissingReason; sentence: string }
  | { state: 'loading' }
  | { state: 'error' }
  | {
      state: 'ready';
      primary: GoalFigure;
      /** The primary's figure the tile leads with: the count, or money in the lead currency. */
      headline: GoalAmount;
      /** The primary in every other currency, each apart. */
      others: GoalAmount[];
      secondaries: GoalFigure[];
      source: GoalSource;
      /** The days the headline covers. */
      figureWindow: GoalWindow;
      target: GoalTargetStatus;
      /** Ad accounts whose read failed while others answered: not in any figure. */
      unanswered: number;
    };

/** The honest line wherever a target would go while the targets route is not deployed. */
export const TARGETS_LATER = 'Targets and periods arrive with the goals update.';

export const NO_ACCOUNT_SENTENCE =
  'No ad account is connected, so there is nothing to measure yet. Connect Meta or Google Ads in Settings → Integrations.';
export const MONTH_START_SENTENCE =
  'The month started today, so there is no complete day to count yet. The first figure lands tomorrow.';

function notCountedSentence(figure: GoalFigure): string {
  const goal = figure.objective.label.toLowerCase();
  return figure.unreported
    ? `Google Ads doesn’t count ${goal}, so this goal has no figure for these ad accounts.`
    : `No ad account has counted ${goal} this month yet.`;
}

/** The primary goal's target and its period, once what names the primary has settled: the saved
 *  goals or the month's results. Null while it has not, and when no target is set. */
export function goalActiveTarget(input: {
  targets: GoalTargetsLoad;
  load: GoalLoad;
  rows: HomeProfileRow[];
  suggested: HomeObjective[];
  now: Date;
}): GoalActiveTarget | null {
  const { targets, load } = input;
  if (targets.status !== 'ready' || (load.status !== 'ready' && load.status !== 'idle')) {
    return null;
  }
  const { primary } = goalObjectives({
    scope: HOME_PROFILE_BRAND_SCOPE,
    rows: input.rows,
    reads: load.status === 'ready' ? load.reads : [],
    suggested: input.suggested,
  });
  const target = goalTargetFor(targets.targets, primary);
  return target ? { target, period: goalTargetPeriod(target, input.now) } : null;
}

const sameWindow = (a: GoalWindow, b: GoalWindow | null): boolean =>
  a.since === b?.since && a.until === b.until;

/** The days a target needs read apart from the month: null when the month's read already covers
 *  them, or when it has no complete day. */
export function goalPeriodReadWindow(
  active: GoalActiveTarget | null,
  monthWindow: GoalWindow | null,
): GoalWindow | null {
  const readWindow = active?.period.readWindow ?? null;
  return readWindow && !sameWindow(readWindow, monthWindow) ? readWindow : null;
}

function targetStatusWithoutActive(targets: GoalTargetsLoad): GoalTargetStatus {
  if (targets.status === 'ready') return { kind: 'none' };
  return targets.status === 'unreadable' ? { kind: 'unreadable' } : { kind: 'unavailable' };
}

export function goalTileView(input: {
  accounts: HomeAdAccount[];
  window: GoalWindow | null;
  load: GoalLoad;
  rows: HomeProfileRow[];
  suggested: HomeObjective[];
  targets: GoalTargetsLoad;
  active: GoalActiveTarget | null;
  periodLoad: GoalLoad;
}): GoalTileView {
  if (input.accounts.length === 0) {
    return { state: 'missing', reason: 'no-account', sentence: NO_ACCOUNT_SENTENCE };
  }
  const { load, active } = input;
  // Until the targets are in, the figure's window is not known: it never shows and then swaps.
  if (input.targets.status === 'loading') return { state: 'loading' };
  if (load.status === 'error') return { state: 'error' };
  if (load.status === 'loading') return { state: 'loading' };

  const running = active?.period.readWindow ? active : null;
  const figureWindow = running?.period.readWindow ?? input.window;
  if (!figureWindow) {
    return { state: 'missing', reason: 'month-start', sentence: MONTH_START_SENTENCE };
  }
  const source = goalPeriodReadWindow(active, input.window) ? input.periodLoad : load;
  if (source.status === 'error') return { state: 'error' };
  if (source.status !== 'ready') return { state: 'loading' };

  const monthReads = load.status === 'ready' ? load.reads : [];
  const goals = goalObjectives({
    scope: HOME_PROFILE_BRAND_SCOPE,
    rows: input.rows,
    reads: monthReads,
    suggested: input.suggested,
  });
  const primary = goalFigure(goals.primary, source.reads);
  if (primary.amounts.length === 0) {
    return { state: 'missing', reason: 'not-counted', sentence: notCountedSentence(primary) };
  }
  const target: GoalTargetStatus = running
    ? goalTargetComparison(running, primary.amounts)
    : active
      ? { kind: 'not-running', ...active }
      : targetStatusWithoutActive(input.targets);
  // A target in a currency the brand also spends in leads with that currency's figure.
  const compared = target.kind === 'compared' ? target.amount : null;
  const [first, ...rest] = compared
    ? [compared, ...primary.amounts.filter((amount) => amount !== compared)]
    : primary.amounts;
  if (!first) {
    return { state: 'missing', reason: 'not-counted', sentence: notCountedSentence(primary) };
  }
  return {
    state: 'ready',
    primary,
    headline: first,
    others: rest,
    // On the 1st a running target has no month to read them from: nothing to say about them.
    secondaries: monthReads.length
      ? goals.secondaries.map((goal) => goalFigure(goal, monthReads))
      : [],
    source: goals.source,
    figureWindow,
    target,
    unanswered: source.failures.length,
  };
}
