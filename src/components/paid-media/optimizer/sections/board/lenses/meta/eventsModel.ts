// The Optimization events view's figures (Meta twin of the conversion signal): the event each
// portfolio teaches Meta to find, what that event is worth, and the goal it is held to. On Meta
// only a purchase carries a value (the purchase value the pixel or WhatsApp reports), so the one
// valued event is read across the whole account over the last 30 days: how many there were,
// what they were worth, what each cost and the ROAS that leaves. Its worth is the average, the
// value over the count: Easy Fit books each tour at $500, but one of CAÑADAS' 46 purchases came
// in without a value, so a purchase is worth $497.70 on the account, and that is what ROAS uses.
//
// A portfolio whose ad sets left Meta (Tours Programados lost its three on Oct 15) or whose
// event stopped firing still teaches nothing: it is flagged here, by name and date, because a
// portfolio that reads "autopilot" with nothing to optimize looks healthy everywhere else.

import type { PortfolioListItem } from '@continuum/contracts';
import {
  getOptimizationMetricDefinition,
  metaEventsGoalSentence,
  metaEventsLostSentence,
  metaEventsNoValueSentence,
  metaEventsValuedSentence,
} from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import {
  accountResult,
  type CostTone,
  costPer,
  costTone,
  formatRoas,
  isDate,
  type MetaRankRow,
  type MetaResultKind,
  monthDayEn,
  portfolioResultKind,
  RESULT_WORDS_EN,
  type ResultWords,
  totalsOf,
} from './metaLensModel';

export type PortfolioEventFlag =
  /** Every enrolled ad set left Meta's live fleet. */
  | { kind: 'lost'; count: number | null; since: string | null }
  /** Some of them did. */
  | { kind: 'partial'; count: number | null }
  /** Nothing is enrolled. */
  | { kind: 'empty' }
  /** The event it buys recorded none on the account in the window. */
  | { kind: 'silent' };

export type PortfolioEvent = {
  portfolioId: string;
  name: string;
  kind: MetaResultKind | null;
  /** Product chrome: what Meta is asked to find. */
  eventLabel: string;
  /** "purchase" in "goal $296 MXN per purchase". */
  unit: string;
  goal: number | null;
  /** What one event is worth, when the event carries a value. */
  valuePerResult: number | null;
  flag: PortfolioEventFlag | null;
};

export type ValuedEvent = {
  kind: MetaResultKind;
  en: ResultWords;
  results: number;
  value: number;
  spend: number;
  valuePerResult: number;
  costPerResult: number;
  roas: number;
  goal: number | null;
  goalPortfolio: string | null;
  tone: CostTone;
};

export type EventsModel = {
  events: PortfolioEvent[];
  /** Null when no event carries a value, or the campaign read is not in. */
  valued: ValuedEvent | null;
  takeaway: string;
};

const EVENT_LABELS: Partial<Record<string, string>> = {
  purchase: 'Purchase',
  conversations: 'Messaging conversation started',
  lead: 'Lead',
};

function eventLabelOf(portfolio: PortfolioListItem): string {
  if (portfolio.objective === 'custom') {
    return portfolio.conversion_descriptor?.result_label ?? 'Custom conversion';
  }
  const metric = portfolio.target_metric ?? portfolio.objective;
  return EVENT_LABELS[metric] ?? getOptimizationMetricDefinition(metric).resultLabel;
}

function flagOf(
  portfolio: PortfolioListItem,
  kind: MetaResultKind | null,
  campaigns: readonly MetaRankRow[] | null,
): PortfolioEventFlag | null {
  if (portfolio.roster_state === 'absent' || portfolio.withdrawn_reason === 'roster_absent') {
    return {
      kind: 'lost',
      count: portfolio.roster_missing_count ?? portfolio.adset_count,
      since: isDate(portfolio.roster_absent_since) ? portfolio.roster_absent_since : null,
    };
  }
  if (portfolio.roster_state === 'partial') {
    return { kind: 'partial', count: portfolio.roster_missing_count ?? null };
  }
  if (portfolio.roster_state === 'empty' || portfolio.adset_count === 0) return { kind: 'empty' };
  if (kind && campaigns && totalsOf(campaigns, kind).results === 0) return { kind: 'silent' };
  return null;
}

function valuedEvent(
  campaigns: readonly MetaRankRow[],
  portfolios: readonly PortfolioListItem[],
): ValuedEvent | null {
  const sums = totalsOf(campaigns, 'purchases');
  if (!sums.results || !sums.value || sums.spend <= 0) return null;
  const result = accountResult(campaigns, portfolios);
  const owner =
    result?.kind === 'purchases'
      ? result
      : accountResult(
          campaigns,
          portfolios.filter((portfolio) => portfolioResultKind(portfolio) === 'purchases'),
        );
  const goal = owner?.kind === 'purchases' ? owner.goal : null;
  const costPerResult = costPer(sums.spend, sums.results) ?? 0;
  return {
    kind: 'purchases',
    en: RESULT_WORDS_EN.purchases,
    results: sums.results,
    value: sums.value,
    spend: sums.spend,
    valuePerResult: sums.value / sums.results,
    costPerResult,
    roas: sums.value / sums.spend,
    goal,
    goalPortfolio: owner?.kind === 'purchases' ? owner.goalPortfolio : null,
    tone: costTone(costPerResult, goal),
  };
}

/** The figures the takeaway quotes, printed; the sentence is in contracts (metaViewsCopy). */
function takeawayOf(
  events: readonly PortfolioEvent[],
  valued: ValuedEvent | null,
  currency: string | null,
): string {
  if (valued) {
    return metaEventsValuedSentence(
      valued.kind,
      formatCurrency(valued.valuePerResult, currency),
      formatCurrency(valued.costPerResult, currency),
      formatRoas(valued.roas),
    );
  }
  const lost = events.find((event) => event.flag?.kind === 'lost');
  if (lost?.flag?.kind === 'lost') {
    return metaEventsLostSentence(lost.name, lost.flag.count, lost.flag.since);
  }
  const goaled = events.find((event) => event.goal != null && event.kind != null);
  if (goaled?.kind && goaled.goal != null) {
    return metaEventsGoalSentence(goaled.name, goaled.kind, formatCurrency(goaled.goal, currency));
  }
  return metaEventsNoValueSentence();
}

/**
 * The events of the account's portfolios, and the valued event's economics. `campaigns` is the
 * 30-day campaign read, or null while it is not in: the events still read from the portfolios,
 * only without a value.
 */
export function buildEvents(
  portfolios: readonly PortfolioListItem[],
  campaigns: readonly MetaRankRow[] | null,
  currency: string | null,
): EventsModel {
  const valued = campaigns ? valuedEvent(campaigns, portfolios) : null;
  const events = portfolios.map((portfolio): PortfolioEvent => {
    const kind = portfolioResultKind(portfolio);
    return {
      portfolioId: portfolio.id,
      name: portfolio.name,
      kind,
      eventLabel: eventLabelOf(portfolio),
      unit: kind ? RESULT_WORDS_EN[kind].one : 'result',
      goal: portfolio.cpa_target != null && portfolio.cpa_target > 0 ? portfolio.cpa_target : null,
      valuePerResult: valued && kind === valued.kind ? valued.valuePerResult : null,
      flag: flagOf(portfolio, kind, campaigns),
    };
  });
  // The valued event first, then the ones with a goal, then the rest; flagged ones keep their
  // place so the flag is read beside the event it hits.
  const rank = (event: PortfolioEvent) =>
    event.valuePerResult != null ? 0 : event.goal != null ? 1 : 2;
  const ordered = [...events].sort((a, b) => rank(a) - rank(b));
  return { events: ordered, valued, takeaway: takeawayOf(ordered, valued, currency) };
}

/** What a flag says, in product chrome. */
export function flagText(flag: PortfolioEventFlag, unitMany: string): string {
  switch (flag.kind) {
    case 'lost': {
      const what = flag.count != null ? `its ${flag.count} ad sets` : 'its ad sets';
      return flag.since ? `Lost ${what} on ${monthDayEn(flag.since)}` : `Lost ${what}`;
    }
    case 'partial':
      return flag.count != null
        ? `${flag.count} of its ad sets ${flag.count === 1 ? 'is' : 'are'} gone`
        : 'Some of its ad sets are gone';
    case 'empty':
      return 'No ad sets enrolled';
    case 'silent':
      return `No ${unitMany} on the account in 30 days`;
  }
}
