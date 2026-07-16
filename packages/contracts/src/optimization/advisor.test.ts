import { describe, expect, test } from 'bun:test';
import type { AdSetSnapshot } from './engine-contracts';
import { adviseSetup, ENGINE_DEFAULT_CPA_TARGET, type SetupAdviceIssueCode } from './advisor';

/** Minimal snapshot — only the fields the advisor reads. */
function adset(over: Partial<AdSetSnapshot> & { id: string }): AdSetSnapshot {
  const { spend = 0, events = 0 } = over as unknown as { spend?: number; events?: number };
  return {
    id: over.id,
    status: 'active',
    currentBudget: over.currentBudget ?? 100,
    ageDays: 30,
    windows: {
      d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d7: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d14: {
        spend,
        purchases: 0,
        addToCarts: 0,
        clicks: 0,
        impressions: 0,
        ...(over.windows?.d14 ?? {}),
      },
    },
    ...over,
  } as AdSetSnapshot;
}

/** An ad set that bought `events` purchases for `spend`. */
function purchaser(id: string, spend: number, purchases: number, currentBudget = 100) {
  return adset({
    id,
    currentBudget,
    windows: {
      d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d7: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      d14: { spend, purchases, addToCarts: 0, clicks: 0, impressions: 0 },
    },
  } as Partial<AdSetSnapshot> & { id: string });
}

const base = {
  objective: 'purchase',
  mode: 'balanced',
  typedDailyTotal: null,
  typedTarget: null,
} as const;

const codes = (issues: { code: SetupAdviceIssueCode }[]) => issues.map((i) => i.code);
const find = (advice: ReturnType<typeof adviseSetup>, code: SetupAdviceIssueCode) =>
  advice.issues.find((i) => i.code === code);

describe('adviseSetup · suggestions', () => {
  test('suggests the SUM of the selection’s current budgets — the optimizer reallocates, it does not invent money', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 100, 2, 300), purchaser('b', 100, 2, 240)],
    });
    expect(advice.currentBudgetSum).toBe(540);
    // ceil to a clean step (10 under 500... sum is 540 → step 50 → 550)
    expect(advice.suggestedDailyTotal).toBe(550);
  });

  test('the suggested budget NEVER trips its own budget_below_current warning (ceil, not round)', () => {
    const snapshots = [purchaser('a', 100, 2, 141)];
    const advice = adviseSetup({ ...base, snapshots });
    const withSuggestion = adviseSetup({
      ...base,
      snapshots,
      typedDailyTotal: advice.suggestedDailyTotal,
    });
    expect(advice.suggestedDailyTotal).toBeGreaterThanOrEqual(advice.currentBudgetSum);
    expect(codes(withSuggestion.issues)).not.toContain('budget_below_current');
  });

  test('suggests the blended ACTUAL cost as the target', () => {
    // $300 spend / 10 purchases = $30 blended
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 200, 8), purchaser('b', 100, 2)],
    });
    expect(advice.blendedCost).toBeCloseTo(30, 5);
    expect(advice.suggestedTarget).toBe(30);
    expect(advice.costSpread).toEqual({ best: 25, median: 50, worst: 50 });
  });

  test('offers no target when the selection has no tracked events', () => {
    const advice = adviseSetup({ ...base, snapshots: [purchaser('a', 500, 0)] });
    expect(advice.blendedCost).toBeNull();
    expect(advice.suggestedTarget).toBeNull();
    expect(find(advice, 'target_defaulted')?.message).toContain('cannot suggest one');
  });
});

describe('adviseSetup · the rules that change the outcome', () => {
  test('no_selection: an empty portfolio never runs', () => {
    const advice = adviseSetup({ ...base, snapshots: [] });
    expect(codes(advice.issues)).toEqual(['no_selection']);
  });

  test('kpi_mismatch: names the ad sets the engine will freeze and never move', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [
        purchaser('buys-purchases', 100, 4),
        adset({ id: 'buys-leads', kpiField: 'leads' }),
        adset({ id: 'buys-convos', kpiField: 'conversations' }),
      ],
    });
    const issue = find(advice, 'kpi_mismatch');
    expect(issue?.adsetIds).toEqual(['buys-leads', 'buys-convos']);
    expect(issue?.message).toContain('2 of your 3 selected ad sets');
    expect(issue?.message).toContain('freezes them');
  });

  test('kpi_mismatch: an ad set with NO declared kpiField inherits the objective and cannot mismatch', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 100, 2), adset({ id: 'inherits' })],
    });
    expect(codes(advice.issues)).not.toContain('kpi_mismatch');
  });

  test('target_defaulted: blank means the engine’s $50, and says so with the number', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 200, 8)],
      typedTarget: null,
    });
    const issue = find(advice, 'target_defaulted');
    expect(issue?.message).toContain(`$${ENGINE_DEFAULT_CPA_TARGET} default`);
    expect(issue?.message).toContain('proposed for pause');
    expect(issue?.message).toContain('Suggested: $25');
  });

  test('target_defaulted disappears once a target is set', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 200, 8)],
      typedTarget: 25,
    });
    expect(codes(advice.issues)).not.toContain('target_defaulted');
  });

  // The CPA target is the line between a HOLD and a PAUSE. Under it the engine holds the ad
  // set; over it the dead-weight trigger starves it and proposes a pause. Which is the
  // sharpest statement of what a blank target actually costs.
  test('no_conversions: a zero-result spender UNDER the target is HELD', () => {
    const advice = adviseSetup({
      ...base,
      typedTarget: 100,
      snapshots: [purchaser('good', 100, 4), purchaser('quiet', 80, 0)],
    });
    const issue = find(advice, 'no_conversions');
    expect(issue?.adsetIds).toEqual(['quiet']);
    expect(issue?.message).toContain('held at its current budget');
    expect(issue?.message).not.toContain('propose');
  });

  test('no_conversions: a zero-result spender OVER the target is proposed for PAUSE', () => {
    const advice = adviseSetup({
      ...base,
      typedTarget: 25,
      snapshots: [purchaser('good', 100, 4), purchaser('burner', 80, 0)],
    });
    const issue = find(advice, 'no_conversions');
    expect(issue?.adsetIds).toEqual(['burner']);
    expect(issue?.message).toContain('already spent past the $25 target');
    expect(issue?.message).toContain('propose a pause');
  });

  test('no_conversions: with a BLANK target the pause line is the engine’s $50 default', () => {
    const advice = adviseSetup({
      ...base,
      typedTarget: null,
      snapshots: [purchaser('good', 100, 4), purchaser('burner', 80, 0)],
    });
    expect(find(advice, 'no_conversions')?.message).toContain(
      `already spent past the $${ENGINE_DEFAULT_CPA_TARGET} target`,
    );
  });

  test('no_conversions mirrors the engine gate: a LEARNING ad set is not held, so we do not warn', () => {
    // runCycle only abstains on an ESTABLISHED active ad set. Warning about one still in
    // learning would be a claim the engine never honors, and an advisor that cries wolf about
    // the engine is worse than no advisor.
    const learning = { ...purchaser('learning', 80, 0), status: 'learning' } as AdSetSnapshot;
    const advice = adviseSetup({ ...base, snapshots: [purchaser('good', 100, 4), learning] });
    expect(codes(advice.issues)).not.toContain('no_conversions');
  });

  test('no_conversions does not double-count an ad set already flagged as kpi_mismatch', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [
        purchaser('good', 100, 4),
        adset({
          id: 'other-currency',
          kpiField: 'leads',
          windows: {
            d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
            d7: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
            d14: { spend: 90, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0, leads: 12 },
          },
        } as Partial<AdSetSnapshot> & { id: string }),
      ],
    });
    expect(find(advice, 'kpi_mismatch')?.adsetIds).toEqual(['other-currency']);
    expect(codes(advice.issues)).not.toContain('no_conversions');
  });

  test('budget_below_current: quantifies the delivery cut cycle 1 would make', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 100, 2, 500), purchaser('b', 100, 2, 500)],
      typedDailyTotal: 700,
    });
    const issue = find(advice, 'budget_below_current');
    expect(issue?.message).toContain('$700');
    expect(issue?.message).toContain('$1000/day');
    expect(issue?.message).toContain('30% of their delivery');
  });

  test('budget_above_current: in efficiency mode the total is a CEILING, and says so', () => {
    const advice = adviseSetup({
      ...base,
      mode: 'efficiency',
      snapshots: [purchaser('a', 100, 2, 100)],
      typedDailyTotal: 500,
    });
    expect(find(advice, 'budget_above_current')?.message).toContain('may deliberately underspend');
  });

  test('target_below_best: a target under every actual cost makes every ad set a failure', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 200, 8), purchaser('b', 100, 2)],
      typedTarget: 10,
    });
    expect(find(advice, 'target_below_best')?.message).toContain('best: $25');
  });

  test('single_adset: nothing to reallocate against', () => {
    const advice = adviseSetup({ ...base, snapshots: [purchaser('a', 100, 2)], typedTarget: 50 });
    expect(codes(advice.issues)).toContain('single_adset');
  });

  test('spend_concentrated: one ad set dominating the comparison is worth saying', () => {
    const advice = adviseSetup({
      ...base,
      typedTarget: 50,
      snapshots: [purchaser('whale', 800, 20), purchaser('b', 100, 3), purchaser('c', 100, 3)],
    });
    expect(find(advice, 'spend_concentrated')?.message).toContain('80%');
  });

  test('a clean selection with a target raises nothing', () => {
    const advice = adviseSetup({
      ...base,
      snapshots: [purchaser('a', 200, 8), purchaser('b', 200, 8), purchaser('c', 200, 8)],
      typedDailyTotal: 300,
      typedTarget: 25,
    });
    expect(advice.issues).toEqual([]);
  });
});

describe('adviseSetup · display units', () => {
  // awareness prices per THOUSAND impressions (denominatorMultiplier 1000). The advisor works
  // entirely in DISPLAY units, so "Use suggested" writes the CPM the user sees — the form's
  // existing handler divides it back down on save. Getting this backwards writes a target
  // 1000x wrong onto a live ad account.
  test('an awareness portfolio suggests a CPM, not a cost-per-impression', () => {
    const impressionAdset = adset({
      id: 'awareness',
      windows: {
        d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
        d7: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
        d14: { spend: 120, purchases: 0, addToCarts: 0, clicks: 0, impressions: 10_000 },
      },
    } as Partial<AdSetSnapshot> & { id: string });

    const advice = adviseSetup({ ...base, objective: 'awareness', snapshots: [impressionAdset] });

    // $120 / 10,000 impressions = $0.012 each → $12.00 CPM.
    expect(advice.blendedCost).toBeCloseTo(12, 5);
    expect(advice.suggestedTarget).toBe(12);
  });
});
