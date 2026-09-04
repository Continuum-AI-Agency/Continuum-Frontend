// A budget-authority freeze must not silence the non-budget triggers (bun test).
//
// The live case: four Vivo47 ad sets carrying $18,297 of spend and 401 conversations
// over 14 days sat frozen `no_own_budget` because their campaign owns the budget (CBO).
// Both fatigue and the creative triggers reused the budget-eligibility test, so every
// creative finding on the best-evidenced ad sets in the account was discarded — in the
// one configuration where swapping the creative is the ONLY lever left.
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, CreativeStanding, FreezeReason, WindowMetrics } from '../src/index';
import {
  DEFAULT_CONFIG,
  evaluateCreative,
  evaluateFatigue,
  isCreativeEvaluable,
  resolveConfig,
} from '../src/index';

const w = (spend: number, purchases: number, clicks = 0, impressions = 0): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks,
  impressions,
});

const snap = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'x',
  status: 'active',
  currentBudget: 100,
  ageDays: 40,
  windows: { d3: w(600, 10), d7: w(1800, 35), d14: w(4000, 100) },
  ...over,
});

const frozenFor = (reason: FreezeReason): AdSetSnapshot =>
  snap({ status: 'frozen', freeze: true, freezeReason: reason, currentBudget: 0 });

// --- the predicate, reason by reason ---------------------------------------

test.each<[FreezeReason, boolean]>([
  ['no_own_budget', true],
  ['unsupported_budget', true],
  ['lifetime_budget', true],
  ['kpi_mismatch', false],
  ['no_declared_objective', false],
  ['no_conversions', false],
])('freezeReason %s => creatively evaluable: %p', (reason, expected) => {
  expect(isCreativeEvaluable(frozenFor(reason))).toBe(expected);
});

test('an unfrozen ad set is evaluable', () => {
  expect(isCreativeEvaluable(snap())).toBe(true);
});

test('frozen with NO reason stays excluded — the young-item budget lock sets no reason', () => {
  expect(isCreativeEvaluable(snap({ status: 'frozen', freeze: true }))).toBe(false);
});

test('flagged is a human hard-exclude and outranks a budget freeze', () => {
  expect(
    isCreativeEvaluable(snap({ status: 'flagged', freeze: true, freezeReason: 'no_own_budget' })),
  ).toBe(false);
});

test('starved is already recommended for pause, so it stays excluded', () => {
  expect(
    isCreativeEvaluable(snap({ status: 'starved', freezeReason: 'no_own_budget' })),
  ).toBe(false);
});

test('the freeze FLAG alone is enough — status need not have been reclassified yet', () => {
  // runCycle stamps freeze/freezeReason before classifyPortfolio rewrites status.
  expect(isCreativeEvaluable(snap({ freeze: true, freezeReason: 'no_own_budget' }))).toBe(true);
  expect(isCreativeEvaluable(snap({ freeze: true, freezeReason: 'kpi_mismatch' }))).toBe(false);
});

// --- what that buys the two stages -----------------------------------------

test('F1 fires on a CBO ad set frozen for no_own_budget', () => {
  // CTR 3d 0.5% vs 14d 1.0% (-50%), CPA 3d $60 vs 14d $40 (+50%).
  const cbo = snap({
    status: 'frozen',
    freeze: true,
    freezeReason: 'no_own_budget',
    currentBudget: 0,
    windows: { d3: w(600, 10, 50, 10_000), d7: w(1800, 35, 250, 25_000), d14: w(4000, 100, 500, 50_000) },
  });
  const recs = evaluateFatigue([cbo], DEFAULT_CONFIG);
  expect(recs.map((r) => r.trigger)).toContain('F1_creative_fatigue');
});

test('a kpi_mismatch freeze still silences F1 — the numbers are in the wrong currency', () => {
  const mismatched = snap({
    status: 'frozen',
    freeze: true,
    freezeReason: 'kpi_mismatch',
    windows: { d3: w(600, 10, 50, 10_000), d7: w(1800, 35, 250, 25_000), d14: w(4000, 100, 500, 50_000) },
  });
  expect(evaluateFatigue([mismatched], DEFAULT_CONFIG)).toHaveLength(0);
});

test('C2 fires on a CBO ad set — the shape of the four live Vivo47 ad sets', () => {
  const standing: CreativeStanding = {
    winner: {
      adId: 'ad_winner',
      adName: 'Vivo47 VR Dic25',
      spend: 2000,
      events: 80,
      costPerEvent: 24.94,
      assetId: 'b6959144-eeda-4dd3-9f3a-2aa1bd5a7d0c',
    },
    laggards: [
      { adId: 'ad_laggard', adName: 'Copia', spend: 553.68, events: 10, costPerEvent: 55.37, vsWinner: 2.22 },
    ],
    eligibleAds: 2,
    totalAds: 5,
    killSpendShare: 0,
    belowAvgSpendShare: 0.1595,
    medianCostPerEvent: 40,
    flags: ['low_evidence', 'spend_concentrated'],
  };
  const cbo = snap({
    status: 'frozen',
    freeze: true,
    freezeReason: 'no_own_budget',
    currentBudget: 0,
    ageDays: 183,
    creative: standing,
  });
  const out = evaluateCreative([cbo], resolveConfig({ objective: 'conversations' }));
  const c2 = out.recommendations.find((r) => r.trigger === 'C2_creative_winner');
  expect(c2).toBeDefined();
  expect(c2?.adId).toBe('ad_winner');
  // The seed is what a DCO render would be built from, so it must carry the Library id.
  expect(c2?.seed?.winnerAssetId).toBe('b6959144-eeda-4dd3-9f3a-2aa1bd5a7d0c');
});

test('a frozen ad set that earns noRaise never reaches the solver, so nothing moves', () => {
  const standing: CreativeStanding = {
    winner: { adId: 'w', spend: 1000, events: 40, costPerEvent: 25 },
    laggards: [{ adId: 'l', spend: 900, events: 0, costPerEvent: null }],
    eligibleAds: 2,
    totalAds: 2,
    killSpendShare: 0.6,
    belowAvgSpendShare: 0.6,
    medianCostPerEvent: 25,
    flags: [],
  };
  const cbo = snap({
    status: 'frozen',
    freeze: true,
    freezeReason: 'no_own_budget',
    currentBudget: 0,
    creative: standing,
  });
  const out = evaluateCreative([cbo], resolveConfig({ objective: 'conversations' }));
  expect(out.recommendations.some((r) => r.trigger === 'C1_creative_drag')).toBe(true);
  // noRaise is only ever read for solver-eligible ad sets; a frozen one is excluded there.
  expect(out.noRaiseIds.has('x')).toBe(true);
});
