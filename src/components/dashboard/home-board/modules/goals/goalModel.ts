// The Goal tile's math (H02): which goals the Home measures for a brand, and each one's value
// month to date, from one account_overview read per ad account over the 1st of the month through
// yesterday. Pure, so every figure the tile prints can be checked against its reads.
//
// Money is never added across currencies: a money goal has one amount per currency, the Home's
// lead currency first (totalsByCurrency). A count (leads, conversations, purchases) is the same
// unit everywhere, so it is summed across every account. There is no target and no period yet:
// the team will set them in the UI once the goals update lands, so nothing here projects, paces or
// rings a figure against one.

import {
  HOME_OBJECTIVE_METRICS,
  type HomeObjective,
  type HomeProfileRow,
  resolveHomeObjectives,
} from '@continuum/contracts';
import {
  type HomeAccountOverview,
  resultTotalsAcross,
  sumOverviews,
  totalsByCurrency,
} from '@/lib/home/homeOverviewModel';
import type { AccountReadFailure, HomeAdAccount } from '@/lib/home/homeAccounts';
import { calendarDayIn, shiftDay } from '@/lib/paid-media/reportingWindow';

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

/** "Nov 1 – Nov 2", or "Nov 1" for a single day: the days a month-to-date figure covers. */
export function goalWindowLabel(window: GoalWindow): string {
  const since = dayLabel.format(new Date(`${window.since}T00:00:00Z`));
  if (window.since === window.until) return since;
  return `${since} – ${dayLabel.format(new Date(`${window.until}T00:00:00Z`))}`;
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
      /** Ad accounts whose read failed while others answered: not in any figure. */
      unanswered: number;
    };

/** The honest line wherever a target would go: the team sets goal and period in the UI once the
 *  goals update lands. */
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

export function goalTileView(input: {
  accounts: HomeAdAccount[];
  window: GoalWindow | null;
  load: GoalLoad;
  rows: HomeProfileRow[];
  suggested: HomeObjective[];
}): GoalTileView {
  if (input.accounts.length === 0) {
    return { state: 'missing', reason: 'no-account', sentence: NO_ACCOUNT_SENTENCE };
  }
  if (!input.window) {
    return { state: 'missing', reason: 'month-start', sentence: MONTH_START_SENTENCE };
  }
  const { load } = input;
  if (load.status === 'error') return { state: 'error' };
  if (load.status !== 'ready') return { state: 'loading' };

  const goals = goalObjectives({
    scope: 'brand',
    rows: input.rows,
    reads: load.reads,
    suggested: input.suggested,
  });
  const primary = goalFigure(goals.primary, load.reads);
  const [headline, ...others] = primary.amounts;
  if (!headline) {
    return { state: 'missing', reason: 'not-counted', sentence: notCountedSentence(primary) };
  }
  return {
    state: 'ready',
    primary,
    headline,
    others,
    secondaries: goals.secondaries.map((goal) => goalFigure(goal, load.reads)),
    source: goals.source,
    unanswered: load.failures.length,
  };
}
