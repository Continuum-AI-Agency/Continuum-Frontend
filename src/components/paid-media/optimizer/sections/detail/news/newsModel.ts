// The portfolio's news: one lead card and two insights, composed from what the cycle
// already persisted. Pure — no React, no fetch — so every state below is pinned by a test.
//
// The one discipline that matters here: a figure is composed ONLY from numbers the report
// literally holds. `current_budget → final_budget` is a pair the cycle wrote down; a
// percentage gap nobody computed is not, and this module does not invent one. Where the
// figures are absent, the headline is null and the card leads with its sentence — which is
// the honest outcome, not a degraded one.
//
// Why the headline is composed here at all: the `CandidateHeadline` vocabulary landed on
// `accountCandidateSchema`, and `briefCandidateSchema` does not carry one yet. When the
// portfolio brief grows the field, this composition deletes and the card reads
// `candidate.headline` directly — the card components already take the contract's type.

import type {
  ArguingChart,
  CandidateHeadline,
  CycleItemRow,
  PortfolioBrief,
} from '@continuum/contracts';
import { chartArgues, headlineAgreesWithChart, headlineIsDrawnOn } from '@continuum/contracts';
import { humanize } from '../../../format';
import type { HeroView } from '../heroModel';
import { ctaForCandidate } from '../heroModel';
import type { NewsCardModel, NewsInterval } from './justification';

const MODULE_LABEL: Record<string, string> = {
  budget: 'Budget',
  pause: 'Pause',
  creative: 'Creative',
  audience: 'Audience',
  none: 'Growth',
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

type BriefCandidate = PortfolioBrief['candidates'][number];

/** The cycle item behind a candidate: its own ad set, or the biggest move of the cycle. */
function itemFor(
  candidate: BriefCandidate | null,
  items: readonly CycleItemRow[],
): CycleItemRow | null {
  if (!candidate) return null;
  const own = items.find((item) => item.adset_id === candidate.adset_id);
  if (own) return own;
  if (candidate.module !== 'budget') return null;
  let largest: CycleItemRow | null = null;
  for (const item of items) {
    if (!item.change_abs) continue;
    if (!largest || Math.abs(item.change_abs) > Math.abs(largest.change_abs ?? 0)) largest = item;
  }
  return largest;
}

/**
 * The figure a card leads with, or null.
 *
 * Two cases are reachable from a portfolio cycle, and both are figures the row already has:
 * a budget that moved (the pair), and spend against nothing bought (the avoided money).
 * Everything else declares nothing rather than reaching for a denominator it was not given.
 */
export function headlineFor(
  candidate: BriefCandidate | null,
  item: CycleItemRow | null,
): CandidateHeadline | null {
  if (!candidate) return null;
  if (candidate.module === 'budget' && item) {
    const from = item.current_budget;
    const to = item.final_budget;
    const moved = item.change_abs;
    if (from != null && to != null && moved != null && moved !== 0) {
      return {
        kind: 'money',
        value: round2(Math.abs(moved)),
        unit: 'currency_per_day',
        // Carries its own period and direction, so nothing is appended beside it.
        label: moved > 0 ? 'a day moved onto it' : 'a day moved off it',
        from: round2(from),
        to: round2(to),
      };
    }
  }
  if (candidate.module === 'pause') {
    const bought = candidate.results_per_day;
    if ((bought == null || bought === 0) && candidate.impact_per_day > 0) {
      return {
        kind: 'avoided',
        value: round2(candidate.impact_per_day),
        unit: 'currency_per_day',
        label: 'a day buying nothing',
        from: null,
        to: null,
      };
    }
  }
  return null;
}

/**
 * The range the cycle measured, when it measured one.
 *
 * `diagnostics.ci` is the engine's own confidence interval on cost per result. Its `cpa` is
 * the point estimate and is absent exactly when the window bought nothing — which is what
 * separates "bounded" from "no point estimate to give", so it is passed through as-is and
 * never defaulted to a midpoint.
 */
export function intervalFor(item: CycleItemRow | null, target: number | null): NewsInterval | null {
  const ci = item?.diagnostics?.ci;
  if (!ci) return null;
  const { lo, hi, cpa, events } = ci;
  if (typeof lo !== 'number' || typeof hi !== 'number' || !(hi > lo)) return null;
  const hasEstimate = typeof cpa === 'number' && Number.isFinite(cpa) && (events ?? 1) > 0;
  return {
    low: round2(lo),
    high: round2(hi),
    estimate: hasEstimate ? round2(cpa) : null,
    referenceLabel: target != null ? 'target' : null,
    reference: target,
  };
}

/** What held the figure back, in words — the footnote every model carries. */
export function capFor(item: CycleItemRow | null): string | null {
  const diagnostics = item?.diagnostics;
  if (!diagnostics) return null;
  if (diagnostics.freezeReason) return `Held · ${humanize(diagnostics.freezeReason).toLowerCase()}`;
  const { rawBudget, velocityCapped } = diagnostics;
  if (
    typeof rawBudget === 'number' &&
    typeof velocityCapped === 'number' &&
    velocityCapped < rawBudget
  ) {
    return 'Capped by this objective’s per-cycle velocity band';
  }
  return null;
}

/**
 * The money as a support line in day · month, or null when the day would be said twice.
 *
 * Two ways that happens. A card with NO headline leads with the money itself (the production
 * state today — no candidate carries a headline yet), and a card whose headline IS the money
 * has already printed the figure. In both cases the renderer falls back to the month alone.
 */
function supportMoney(headline: CandidateHeadline | null, perDay: number | null): number | null {
  if (perDay == null || !Number.isFinite(perDay) || perDay <= 0) return null;
  if (headline == null) return null;
  if (headline.unit === 'currency_per_day' && Math.abs(headline.value - perDay) < 0.5) return null;
  return round2(perDay);
}

/**
 * The interval the card may DRAW, which is not the same question as whether one was measured.
 *
 * `intervalFor` passes the engine's confidence interval through untouched, and it should: the
 * cycle measured it and the row holds it. But the rule is the chart's rule — a card draws
 * beside its figure only what argues THAT figure — and the engine's interval is a cost per
 * RESULT while the figure beside it is money per DAY. On the live screen that produced a rule
 * running from $71 to $339,700,000 sitting under "$26 a day buying nothing", on a portfolio
 * whose whole daily budget is $324. Three unrelated quantities in one border, with the upper
 * bound wrong by nine orders of magnitude, and nothing anywhere asked whether they met.
 *
 * `IntervalRule` draws `low`, `high` and the estimate's tick, and nothing else — `reference`
 * is carried and never drawn, so it is an annotation and not a mark, exactly as
 * `at_stake_per_day` is on a chart.
 *
 * Withholding it is not a loss of information: with no interval the card holds no bracket, so
 * `pickJustification` reads 'open' and the card prints its own `basis` instead — the formula,
 * in the detector's words. A sentence that is true beats a bar that is not.
 */
function drawableInterval(
  interval: NewsInterval | null,
  headline: CandidateHeadline | null,
  impactPerDay: number | null,
): NewsInterval | null {
  if (!interval) return null;
  // What the card LEADS with, which is the headline or — when there is none — the money that
  // stands in for it. Checking only the headline would let every headline-less card back in,
  // and a headline-less card still prints a figure beside the rule.
  const lead: CandidateHeadline | null =
    headline ??
    (impactPerDay != null && impactPerDay > 0
      ? {
          kind: 'money',
          value: round2(impactPerDay),
          unit: 'currency_per_day',
          label: 'a day',
          from: null,
          to: null,
        }
      : null);
  const marks = [
    interval.low,
    interval.high,
    ...(interval.estimate != null ? [interval.estimate] : []),
  ];
  return headlineIsDrawnOn(lead, marks) ? interval : null;
}

/** A secondary candidate's sentence: its own persisted reason, else what it is and where. */
function claimFor(candidate: BriefCandidate): string {
  const where = candidate.adset_name ?? candidate.adset_id ?? 'the portfolio';
  const module = MODULE_LABEL[candidate.module] ?? candidate.module;
  return `${module} on ${where}`;
}

export type PortfolioNews = {
  lead: NewsCardModel | null;
  /**
   * The chart the lead card may draw, which is not the same question as whether a chart exists.
   *
   * `heroChart` already answers whether a chart ARGUES — a trend or an interval, never a
   * drawing of arithmetic the sentence has already made. It does not answer whether the chart
   * argues THIS card's argument, and that is the gap a reader falls into: the lead leads with
   * the pause's avoided money and the fallback chart draws the whole portfolio's cost per
   * result across the window. Both are true. Together, inside one border, they read as one
   * claim and they are not one claim.
   *
   * Null when the hero's own headline is nowhere on the chart. The card then keeps its
   * sentence, which the whole vocabulary was built to make sufficient.
   */
  leadChart: ArguingChart | null;
  insights: NewsCardModel[];
};

/**
 * The lead card and the two insights under it.
 *
 * `items` is the cycle's reallocation rows — the only place the budget pair and the engine's
 * interval live. Pass an empty array and every card still renders: it leads with its
 * sentence and the money stays a support line.
 */
export function buildPortfolioNews(args: {
  view: HeroView;
  items: readonly CycleItemRow[];
  /** The portfolio's target cost per result, the line an interval is read against. */
  target: number | null;
}): PortfolioNews {
  const { view, items, target } = args;
  const brief = view.brief;
  const hero = brief.hero;
  const heroCandidate = brief.candidates.find((c) => c.id === hero.candidate_id) ?? null;
  const heroItem = itemFor(heroCandidate, items);
  const heroHeadline = headlineFor(heroCandidate, heroItem);

  const lead: NewsCardModel = {
    id: hero.candidate_id ?? 'hero',
    eyebrow: MODULE_LABEL[hero.module] ?? hero.module,
    claim: hero.headline,
    reason: hero.why || null,
    headline: heroHeadline,
    moneyPerDay: supportMoney(heroHeadline, hero.impact_per_day),
    impactPerDay: hero.impact_per_day,
    basis: hero.impact_basis,
    chosenOver: hero.justification,
    interval: drawableInterval(intervalFor(heroItem, target), heroHeadline, hero.impact_per_day),
    cappedBy: capFor(heroItem),
    cta: view.cta,
  };

  // The chart the hero was given, kept only if it argues AND draws the figure the hero leads
  // with. `chartArgues` is the type guard, so the narrowing to `ArguingChart` is the gate.
  const leadChart =
    chartArgues(view.chart) && headlineAgreesWithChart(heroHeadline, view.chart)
      ? view.chart
      : null;

  const insights: NewsCardModel[] = [];
  for (const id of brief.secondary) {
    if (insights.length >= 2) break;
    const candidate = brief.candidates.find((c) => c.id === id);
    if (!candidate || candidate.id === hero.candidate_id) continue;
    const item = itemFor(candidate, items);
    const headline = headlineFor(candidate, item);
    insights.push({
      id: candidate.id,
      eyebrow: MODULE_LABEL[candidate.module] ?? candidate.module,
      claim: claimFor(candidate),
      reason: candidate.reason,
      headline,
      moneyPerDay: supportMoney(headline, candidate.impact_per_day),
      impactPerDay: candidate.impact_per_day,
      basis: candidate.impact_basis,
      chosenOver: null,
      interval: drawableInterval(intervalFor(item, target), headline, candidate.impact_per_day),
      cappedBy: capFor(item),
      cta: ctaForCandidate(candidate, view.observe),
    });
  }
  return { lead, leadChart, insights };
}
