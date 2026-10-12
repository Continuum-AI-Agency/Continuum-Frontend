import { describe, expect, test } from 'bun:test';
import { PlatformCardSchema } from '@continuum/contracts';
import {
  G03_PROJECTION_MIN_HISTORY_DAYS,
  type G03Context,
  type G03Result,
  g03BudgetLimitedRaise,
  googleBudgetLimitedCard,
} from '../../src';
import { googleCampaign } from './fixtures';

// EKATAR (Vivo 47, escenario 07): 6,190.59 MXN for 8.01 leads in 7 days, 28% lost to budget.
const ekatar = googleCampaign('vivo47', '20775796216').snapshot;
const base: G03Context = { objective: 'lead', kpiField: 'leads', cpaTarget: null };
const mxn = (amount: number) => ({ amount, currency: 'MXN' });

/** The bytes G03 wrote before feature 14, captured from the unchanged rule. */
const PINNED = {
  none: '{"outcome":"refusal","rule":"G03","entityId":"20775796216","refusal":"missing_cpa_target","reason":"VIVO 47-EKATAR loses 28% of impressions to budget, but each result costs 772.98 MXN. Set a target cost per result in MXN and I\'ll tell you whether more budget is worth it."}',
  usd: '{"outcome":"refusal","rule":"G03","entityId":"20775796216","refusal":"missing_cpa_target","reason":"VIVO 47-EKATAR loses 28% of impressions to budget, but each result costs 772.98 MXN. Set a target cost per result in MXN and I\'ll tell you whether more budget is worth it."}',
  mxn900:
    '{"outcome":"proposal","rule":"G03","entityId":"20775796216","from":1179,"to":1473.75,"currency":"MXN","costPerResult":772.9756571888496,"budgetLostImpressionShare":0.2802764224591953,"needsApproval":true,"reason":"VIVO 47-EKATAR loses 28% of impressions to budget with results at 772.98 MXN, 14% under target. Raise to 1473.75 MXN/day."}',
  mxn700:
    '{"outcome":"refusal","rule":"G03","entityId":"20775796216","refusal":"above_target","reason":"VIVO 47-EKATAR loses 28% of impressions to budget at 772.98 MXN per result, above the 700.00 MXN target."}',
};

function withoutProjection(r: G03Result): string {
  const { projection: _drop, ...rest } = r as G03Result & { projection?: unknown };
  return JSON.stringify(rest);
}

describe('G03 projection (feature 14)', () => {
  const history = { historyDays: 30 };

  test('every G03 output is byte-identical to before, apart from the new field', () => {
    const runs = {
      none: g03BudgetLimitedRaise(ekatar, { ...base, ...history }),
      usd: g03BudgetLimitedRaise(ekatar, {
        ...base,
        ...history,
        cpaTarget: { amount: 900, currency: 'USD' },
      }),
      mxn900: g03BudgetLimitedRaise(ekatar, { ...base, ...history, cpaTarget: mxn(900) }),
      mxn700: g03BudgetLimitedRaise(ekatar, { ...base, ...history, cpaTarget: mxn(700) }),
    };
    for (const [key, result] of Object.entries(runs)) {
      expect(withoutProjection(result)).toBe(PINNED[key as keyof typeof PINNED]);
    }
    // A refusal never gains the field at all.
    expect('projection' in runs.none).toBe(false);
    expect('projection' in runs.mxn700).toBe(false);
  });

  test('a proposal projects now, low and high from the d7 window', () => {
    const r = g03BudgetLimitedRaise(ekatar, { ...base, ...history, cpaTarget: mxn(900) });
    expect(r.outcome).toBe('proposal');
    if (r.outcome !== 'proposal') return;
    // now: 8.01 leads / 7 days.
    // high: 1,473.75 / 772.98 = 1.91 at today's price, capped by the lost share:
    //       1.144 / (1 − 0.2803) = 1.59.
    // low: 1,473.75 / (772.98 × 1.25) = 1.53 — a cost per result one 25% raise worse.
    expect(r.projection).toEqual({
      results_per_day_now: 1.14,
      results_per_day_low: 1.53,
      results_per_day_high: 1.59,
      basis_days: 7,
    });
  });

  test('null with fewer than 7 days of history, or when the history is unknown', () => {
    const short = g03BudgetLimitedRaise(ekatar, {
      ...base,
      cpaTarget: mxn(900),
      historyDays: G03_PROJECTION_MIN_HISTORY_DAYS - 1,
    });
    expect(short.outcome === 'proposal' && short.projection).toBeNull();
    const unknown = g03BudgetLimitedRaise(ekatar, { ...base, cpaTarget: mxn(900) });
    expect(unknown.outcome === 'proposal' && unknown.projection).toBeNull();
  });

  test('without a reported lost share the high end is today’s price, never more', () => {
    const constrainedByStatus = {
      ...ekatar,
      primaryStatusReasons: ['BUDGET_CONSTRAINED'],
      windows: {
        ...ekatar.windows,
        d7: { ...ekatar.windows.d7, delivery: {} },
      },
    };
    const r = g03BudgetLimitedRaise(constrainedByStatus, {
      ...base,
      ...history,
      cpaTarget: mxn(900),
    });
    expect(r.outcome === 'proposal' && r.projection).toEqual({
      results_per_day_now: 1.14,
      results_per_day_low: 1.53,
      results_per_day_high: 1.91,
      basis_days: 7,
    });
  });
});

describe('googleBudgetLimitedCard', () => {
  test('a proposal becomes a card the contract accepts, projection included', () => {
    const r = g03BudgetLimitedRaise(ekatar, { ...base, historyDays: 30, cpaTarget: mxn(900) });
    const card = googleBudgetLimitedCard(ekatar, r, {
      kpiField: 'leads',
      resultLabel: 'leads',
      daysLimited: null,
    });
    expect(card).toEqual({
      variant: 'google_budget_limited',
      campaign_name: 'VIVO 47-EKATAR',
      budget_lost_impression_share: 0.2802764224591953,
      days_limited: null,
      currency: 'MXN',
      cost_per_result: 772.9756571888496,
      result_label: 'leads',
      budget_per_day: 1179,
      proposed_budget_per_day: 1473.75,
      projection: {
        results_per_day_now: 1.14,
        results_per_day_low: 1.53,
        results_per_day_high: 1.59,
        basis_days: 7,
      },
    });
    expect(PlatformCardSchema.safeParse(card).success).toBe(true);
  });

  test('a priced refusal is a card with no proposal and no projection', () => {
    const r = g03BudgetLimitedRaise(ekatar, { ...base, historyDays: 30, cpaTarget: null });
    const card = googleBudgetLimitedCard(ekatar, r, {
      kpiField: 'leads',
      resultLabel: 'leads',
      daysLimited: 3,
    });
    expect(card?.proposed_budget_per_day).toBeNull();
    expect(card?.projection).toBeNull();
    expect(card?.cost_per_result).toBeCloseTo(772.98, 2);
    expect(PlatformCardSchema.safeParse(card).success).toBe(true);
  });

  test('no card when the campaign is not budget limited or the rule has nothing to say', () => {
    const r = g03BudgetLimitedRaise(
      {
        ...ekatar,
        primaryStatusReasons: [],
        windows: { ...ekatar.windows, d7: { ...ekatar.windows.d7, delivery: {} } },
      },
      { ...base, cpaTarget: mxn(900) },
    );
    expect(r.outcome === 'refusal' && r.refusal).toBe('not_budget_limited');
    expect(
      googleBudgetLimitedCard(ekatar, r, {
        kpiField: 'leads',
        resultLabel: 'leads',
        daysLimited: null,
      }),
    ).toBeNull();
  });
});
