// ---------------------------------------------------------------------------
// The platform cards built from rules that live outside signalRules.ts: today, G03's
// google_budget_limited (escenario 07, frontend.html §7 feature 14). Every figure on the
// card is the rule's or the snapshot's — the card computes none of them.
// ---------------------------------------------------------------------------

import type { MultiPlatformSnapshot, PlatformCard } from '@continuum/contracts';
import { currencyMinorOffset } from '@continuum/contracts';
import type { WindowMetrics } from '../types';
import type { G03Result } from './googleRules';

export type GoogleBudgetLimitedCard = Extract<PlatformCard, { variant: 'google_budget_limited' }>;

export type GoogleBudgetLimitedCardContext = {
  kpiField: keyof WindowMetrics;
  /** "leads", "purchases" — what the cost per result buys, in the card's words. */
  resultLabel: string;
  /** Consecutive days marked LIMITED · BUDGET_CONSTRAINED; null when unknown. */
  daysLimited: number | null;
};

/**
 * The google_budget_limited card for one G03 outcome, or null when there is no card to show:
 * the campaign is not budget limited, its budget is shared (never changed in place), or
 * Google reported no lost impression share — the card's headline figure, never invented.
 */
export function googleBudgetLimitedCard(
  s: MultiPlatformSnapshot,
  g03: G03Result,
  ctx: GoogleBudgetLimitedCardContext,
): GoogleBudgetLimitedCard | null {
  if (
    g03.outcome === 'refusal' &&
    (g03.refusal === 'not_budget_limited' || g03.refusal === 'held')
  ) {
    return null;
  }
  const d7 = s.windows.d7;
  const lost = d7.delivery?.budgetLostImpressionShare;
  if (lost === undefined) return null;
  const conversions = (d7[ctx.kpiField] as number | undefined) ?? 0;
  const proposal = g03.outcome === 'proposal' ? g03 : null;
  return {
    variant: 'google_budget_limited',
    campaign_name: s.name ?? s.id,
    budget_lost_impression_share: lost,
    days_limited: ctx.daysLimited,
    currency: s.budget.currency,
    cost_per_result: proposal?.costPerResult ?? (conversions > 0 ? d7.spend / conversions : null),
    result_label: ctx.resultLabel,
    budget_per_day: s.budget.minor / currencyMinorOffset(s.budget.currency),
    proposed_budget_per_day: proposal?.to ?? null,
    projection: proposal?.projection ?? null,
  };
}
