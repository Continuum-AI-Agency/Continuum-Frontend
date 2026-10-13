// ---------------------------------------------------------------------------
// The Google rules the engine has no Meta twin for: G03 (raise a budget-limited campaign
// that is under target), G12's account-wide collapse, G11 (low-quality keyword) and the
// daily exposure a Google budget really allows.
// Design: google-acciones.html §4, escenarios.html scenarios 03, 07, 08, 20.
// ---------------------------------------------------------------------------

import type { MultiPlatformSnapshot } from '@continuum/contracts';
import { currencyMinorOffset, formatMoney } from '@continuum/contracts';
import type { OptimizationObjective, WindowMetrics } from '../types';
import { isGoogleBidLearning, platformCaps } from './learning';

/** G03 fires when Search loses more than this share of impressions to budget (d7). */
export const G03_LOST_IMPRESSION_SHARE = 0.2;
/** Google may spend up to twice the average daily budget on any one day. */
export const GOOGLE_DAILY_OVERDELIVERY = 2;
/** G03 projects only from a full d7 window: fewer days and "per day" is a guess. */
export const G03_PROJECTION_MIN_HISTORY_DAYS = 7;
const G03_PROJECTION_BASIS_DAYS = 7;

const cents = (v: number): number => Math.round(v * 100) / 100;

function majorBudget(s: MultiPlatformSnapshot): number {
  return s.budget.minor / currencyMinorOffset(s.budget.currency);
}

function results(m: WindowMetrics, kpiField: keyof WindowMetrics): number {
  return (m[kpiField] as number | undefined) ?? 0;
}

/** The most a Google campaign can spend in one day: twice its budget. A move's daily cap
 *  and the day's spend projection count this, not the budget (scenario 03). */
export function expectedDailySpendCeiling(s: MultiPlatformSnapshot): number {
  const budget = majorBudget(s);
  return s.platform === 'google_ads' ? budget * GOOGLE_DAILY_OVERDELIVERY : budget;
}

export type G03Context = {
  objective: OptimizationObjective;
  kpiField: keyof WindowMetrics;
  /** The target IN THE ACCOUNT'S CURRENCY. Null ⇒ the rule abstains and says so. */
  cpaTarget: { amount: number; currency: string } | null;
  /** Days the campaign has been delivering. Unknown ⇒ no projection, never an assumed 7. */
  historyDays?: number | null;
};

/** What a G03 raise is expected to buy, per day (feature 14) — the card's `projection`. */
export type G03Projection = {
  results_per_day_now: number;
  results_per_day_low: number;
  results_per_day_high: number;
  basis_days: number;
};

export type G03Result =
  | {
      outcome: 'proposal';
      rule: 'G03';
      entityId: string;
      from: number;
      to: number;
      currency: string;
      costPerResult: number;
      budgetLostImpressionShare: number | null;
      needsApproval: true;
      reason: string;
      /** Null with fewer than G03_PROJECTION_MIN_HISTORY_DAYS of history, or unknown history. */
      projection: G03Projection | null;
    }
  | {
      outcome: 'refusal';
      rule: 'G03';
      entityId: string;
      refusal:
        | 'missing_cpa_target'
        | 'not_budget_limited'
        | 'no_results'
        | 'above_target'
        | 'held'
        | 'learning';
      reason: string;
    };

/** Google marks it BUDGET_CONSTRAINED, or Search loses more than G03's share to budget. */
export function isBudgetConstrained(s: MultiPlatformSnapshot): boolean {
  const lost = s.windows.d7.delivery?.budgetLostImpressionShare ?? null;
  return (
    (s.primaryStatusReasons ?? []).includes('BUDGET_CONSTRAINED') ||
    (lost !== null && lost > G03_LOST_IMPRESSION_SHARE)
  );
}

/**
 * G03: raise a campaign that is limited by budget AND buys under target.
 *
 * Without a target in the account's currency the rule abstains by name: the engine's
 * default target (50) has no currency, and comparing 772.98 MXN against it refuses for the
 * wrong reason — silently (scenario 07, branch A).
 */
export function g03BudgetLimitedRaise(s: MultiPlatformSnapshot, ctx: G03Context): G03Result {
  const name = s.name ?? s.id;
  const currency = s.budget.currency;
  const refuse = (
    refusal: Extract<G03Result, { outcome: 'refusal' }>['refusal'],
    reason: string,
  ): G03Result => ({ outcome: 'refusal', rule: 'G03', entityId: s.id, refusal, reason });

  if (s.budget.shared) {
    return refuse(
      'held',
      `${name} shares its budget with other campaigns; it is never changed in place.`,
    );
  }
  const lost = s.windows.d7.delivery?.budgetLostImpressionShare ?? null;
  if (!isBudgetConstrained(s)) {
    return refuse('not_budget_limited', `${name} is not losing impressions to budget.`);
  }
  const conversions = results(s.windows.d7, ctx.kpiField);
  const spend = s.windows.d7.spend;
  if (conversions <= 0) {
    return refuse('no_results', `${name} has no results in the last 7 days to price.`);
  }
  const cost = spend / conversions;
  const lostText = lost !== null ? `${Math.round(lost * 100)}% of impressions` : 'impressions';
  if (!ctx.cpaTarget || ctx.cpaTarget.currency !== currency) {
    return refuse(
      'missing_cpa_target',
      `${name} loses ${lostText} to budget, but each result costs ${formatMoney(cost, currency)}. Set a target cost per result in ${currency} and I'll tell you whether more budget is worth it.`,
    );
  }
  if (cost >= ctx.cpaTarget.amount) {
    return refuse(
      'above_target',
      `${name} loses ${lostText} to budget at ${formatMoney(cost, currency, { distinguishFrom: ctx.cpaTarget.amount })} per result, above the ${formatMoney(ctx.cpaTarget.amount, currency, { distinguishFrom: cost })} target.`,
    );
  }
  if (isGoogleBidLearning(s.bidding?.systemStatus)) {
    return refuse('learning', `${name} is still learning its bid strategy; its budget waits.`);
  }
  const from = majorBudget(s);
  const caps = platformCaps('google_ads', ctx.objective, false);
  const to = cents(from * (1 + caps.upPct));
  const under = Math.round((1 - cost / ctx.cpaTarget.amount) * 100);
  return {
    outcome: 'proposal',
    rule: 'G03',
    entityId: s.id,
    from,
    to,
    currency,
    costPerResult: cost,
    budgetLostImpressionShare: lost,
    needsApproval: true,
    reason: `${name} loses ${lostText} to budget with results at ${formatMoney(cost, currency)}, ${under}% under target. Raise to ${formatMoney(to, currency)}/day.`,
    projection: g03Projection({
      conversions,
      cost,
      to,
      lost,
      step: caps.upPct,
      historyDays: ctx.historyDays ?? null,
    }),
  };
}

/**
 * The range a raise to `to` buys. Google does not sell the lost impressions at today's
 * price, so it is a range, never one figure:
 *  - HIGH: `to` at today's cost per result, but never more volume than the auctions the
 *    campaign loses to budget — lost / (1 − lost) more than now, i.e. now / (1 − lost).
 *    Without a reported lost share there is no such ceiling, and today's price stands.
 *  - LOW: `to` at a cost per result ONE STEP WORSE, the step being the raise itself
 *    (caps.upPct). The extra budget buys the auctions that were lost, which are the
 *    pricier ones; assuming they cost as much more as the budget grows is the case where
 *    the raise buys only what the old budget did, which is the honest floor to show.
 */
function g03Projection(p: {
  conversions: number;
  cost: number;
  to: number;
  lost: number | null;
  step: number;
  historyDays: number | null;
}): G03Projection | null {
  if (p.historyDays === null || p.historyDays < G03_PROJECTION_MIN_HISTORY_DAYS) return null;
  const now = p.conversions / G03_PROJECTION_BASIS_DAYS;
  const atToday = p.to / p.cost;
  const high = p.lost !== null && p.lost < 1 ? Math.min(atToday, now / (1 - p.lost)) : atToday;
  const low = Math.min(p.to / (p.cost * (1 + p.step)), high);
  return {
    results_per_day_now: cents(now),
    results_per_day_low: cents(low),
    results_per_day_high: cents(high),
    basis_days: G03_PROJECTION_BASIS_DAYS,
  };
}

/** A Google campaign that should be serving: not ended, paused or removed, with budget. */
function isActiveWithBudget(s: MultiPlatformSnapshot): boolean {
  const status = (s.primaryStatus ?? '').toUpperCase();
  if (['ENDED', 'PAUSED', 'REMOVED', 'NOT_ELIGIBLE'].includes(status)) return false;
  return s.budget.minor > 0;
}

function isDark(s: MultiPlatformSnapshot): boolean {
  return s.windows.d14.impressions === 0;
}

export type GoogleDarknessFinding =
  | {
      scope: 'account';
      rule: 'G12_account';
      accountId: string;
      campaignIds: string[];
      dailyBudget: number;
      currency: string;
      reason: string;
    }
  | { scope: 'campaign'; rule: 'G12'; accountId: string; campaignId: string; reason: string };

/**
 * G12, collapsed: when EVERY active campaign of a Google account is dark at once, the
 * cause is the account (billing, payment, suspension), so it is one account card — not
 * one card per campaign that all say the same thing (scenario 20).
 */
export function googleDarkness(
  campaigns: readonly MultiPlatformSnapshot[],
): GoogleDarknessFinding[] {
  const byAccount = new Map<string, MultiPlatformSnapshot[]>();
  for (const s of campaigns) {
    if (s.platform !== 'google_ads' || s.level !== 'campaign') continue;
    byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
  }
  const findings: GoogleDarknessFinding[] = [];
  for (const [accountId, all] of byAccount) {
    const active = all.filter(isActiveWithBudget);
    const dark = active.filter(isDark);
    if (dark.length === 0) continue;
    if (active.length > 1 && dark.length === active.length) {
      const currency = active[0]!.budget.currency;
      const dailyBudget = cents(active.reduce((acc, s) => acc + majorBudget(s), 0));
      findings.push({
        scope: 'account',
        rule: 'G12_account',
        accountId,
        campaignIds: active.map((s) => s.id),
        dailyBudget,
        currency,
        reason: `This account has ${active.length} active campaigns and ${formatMoney(dailyBudget, currency)}/day of budget but showed no ads in 14 days. Check billing in Google Ads.`,
      });
      continue;
    }
    for (const s of dark) {
      const why = (s.primaryStatusReasons ?? []).join(', ') || 'no reason reported';
      findings.push({
        scope: 'campaign',
        rule: 'G12',
        accountId,
        campaignId: s.id,
        reason: `${s.name ?? s.id} is active with budget and showed no ads in 14 days. Google says: ${why}.`,
      });
    }
  }
  return findings;
}

export type KeywordRead = {
  id: string;
  text: string;
  /** ad_group_criterion.status, read live — a pause is never proposed on a paused keyword. */
  status: string;
  qualityScore: number | null;
  spend: number;
  conversions: number;
  /** The window those figures cover, said with the figure. */
  window: string;
};

export type G11Result =
  | { fires: true; rule: 'G11'; keywordId: string; reason: string }
  | {
      fires: false;
      rule: 'G11';
      keywordId: string;
      because:
        | 'not_enabled'
        | 'quality_ok'
        | 'has_conversions'
        | 'spend_under_target'
        | 'no_quality_score';
    };

/** G11 ("siguiente"): pause a keyword with Quality Score ≤ 3, spend over target and zero
 *  conversions — read against its LIVE status first (scenario 08). */
export function g11LowQualityKeyword(
  k: KeywordRead,
  cpaTarget: number,
  currency: string,
): G11Result {
  const no = (because: Extract<G11Result, { fires: false }>['because']): G11Result => ({
    fires: false,
    rule: 'G11',
    keywordId: k.id,
    because,
  });
  if (k.status !== 'ENABLED') return no('not_enabled');
  if (k.qualityScore === null) return no('no_quality_score');
  if (k.qualityScore > 3) return no('quality_ok');
  if (k.conversions > 0) return no('has_conversions');
  if (k.spend <= cpaTarget) return no('spend_under_target');
  return {
    fires: true,
    rule: 'G11',
    keywordId: k.id,
    reason: `"${k.text}" has Quality Score ${k.qualityScore} and spent ${formatMoney(k.spend, currency)} (${k.window}) with no conversions.`,
  };
}
