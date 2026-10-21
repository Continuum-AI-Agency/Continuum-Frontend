// Who is even IN the pool.
//
// Modelled on the account that exposed the bug: 64 ad sets, $10,220/day, and four active
// "Instagram Post" boosted posts with currentBudget 0, spend 0, and (three of them) no
// declared optimization goal at all. Nothing froze them at ingest, so they entered scoring
// as optimizable. A zero-budget item's solver box collapses onto the floor — lower =
// max(floor, 0) and upper = max(0, floor) are both the floor — so each was handed
// $23.95/day on no evidence whatsoever, roughly $96/day of real budget.
//
// The allocation maths was correct throughout. The eligibility set was wrong. These tests
// encode where the pool's boundary is, and what the floor is an average OF.

import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { reallocate, runCycle } from '../src/index';

const ZERO: WindowMetrics = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };

/** A window that bought `n` purchases for `spend`. */
const bought = (spend: number, n: number): WindowMetrics => ({
  ...ZERO,
  spend,
  impressions: Math.round(spend * 100),
  clicks: Math.round(spend / 2),
  purchases: n,
});

const adSet = (
  over: Partial<AdSetSnapshot> & Pick<AdSetSnapshot, 'id' | 'windows'>,
): AdSetSnapshot => ({
  status: 'active',
  currentBudget: 100,
  ageDays: 45,
  optimization_goal: 'OFFSITE_CONVERSIONS',
  ...over,
});

/** A healthy, declared, converting ad set — the pool member every case below sits beside. */
const earner = (id: string, currentBudget = 100): AdSetSnapshot =>
  adSet({
    id,
    currentBudget,
    windows: { d3: bought(300, 6), d7: bought(700, 15), d14: bought(1_500, 32) },
  });

const itemFor = (result: ReturnType<typeof runCycle>, id: string) => {
  const item = result.reallocation.items.find((i) => i.id === id);
  if (!item) throw new Error(`no diagnostics for ${id}`);
  return item;
};

// --- No budget of its own -------------------------------------------------------------

test('a zero-budget active ad set is held, and does NOT receive the floor', () => {
  // The exact live shape: active, no budget, no spend, named like a boosted post.
  const result = runCycle(
    [
      earner('earner-a', 200),
      earner('earner-b', 200),
      adSet({
        id: 'instagram-post',
        name: 'Instagram Post',
        currentBudget: 0,
        windows: { d3: ZERO, d7: ZERO, d14: ZERO },
      }),
    ],
    { objective: 'purchase', total: 400 },
  );

  const boosted = itemFor(result, 'instagram-post');
  expect(boosted.freezeReason).toBe('no_own_budget');
  expect(boosted.status).toBe('frozen');

  // The whole point: it is NOT handed the floor. It stays at the zero it arrived with.
  expect(boosted.finalBudget).toBe(0);
  expect(boosted.changeAbs).toBe(0);
  expect(boosted.finalBudget).toBeLessThan(boosted.floor);
});

test('four zero-budget boosted posts draw nothing, and the earners keep the whole pool', () => {
  // The live arithmetic in miniature: without the hold, each of the four collapses onto the
  // floor and together they siphon four floors out of the pool.
  const boostedIds = ['ig-1', 'ig-2', 'ig-3', 'ig-4'];
  const result = runCycle(
    [
      earner('earner-a', 500),
      earner('earner-b', 500),
      ...boostedIds.map((id) =>
        adSet({
          id,
          name: 'Instagram Post',
          currentBudget: 0,
          windows: { d3: ZERO, d7: ZERO, d14: ZERO },
        }),
      ),
    ],
    { objective: 'purchase', total: 1_000 },
  );

  for (const id of boostedIds) {
    expect(itemFor(result, id).freezeReason).toBe('no_own_budget');
    expect(itemFor(result, id).finalBudget).toBe(0);
  }
  const toEarners =
    itemFor(result, 'earner-a').finalBudget + itemFor(result, 'earner-b').finalBudget;
  expect(toEarners).toBeCloseTo(1_000, 6);
});

test('a CBO ad set frozen at ingest keeps unsupported_budget — it is not relabelled', () => {
  // A CBO ad set also has currentBudget 0, but ingest already explained WHY: the budget
  // exists, on the campaign. `no_own_budget` must not overwrite that more specific fact.
  const result = runCycle(
    [
      earner('earner-a', 200),
      adSet({
        id: 'cbo-child',
        currentBudget: 0,
        status: 'frozen',
        freeze: true,
        freezeReason: 'unsupported_budget',
        windows: { d3: bought(300, 4), d7: bought(700, 9), d14: bought(1_500, 20) },
      }),
    ],
    { objective: 'purchase', total: 200 },
  );

  expect(itemFor(result, 'cbo-child').freezeReason).toBe('unsupported_budget');
});

// --- The regression guard -------------------------------------------------------------

test('an ad set with a real budget and no spend yet is still optimizable', () => {
  // The case the zero-budget hold must not swallow. A launched-but-not-yet-spending ad set
  // has a real budget, zero spend and zero events — it has money to move, so it is a pool
  // member. Zero SPEND is not zero BUDGET, and only the latter is grounds to hold.
  const result = runCycle(
    [
      earner('earner-a', 200),
      adSet({
        id: 'budgeted-not-yet-spending',
        currentBudget: 100,
        windows: { d3: ZERO, d7: ZERO, d14: ZERO },
      }),
    ],
    { objective: 'purchase', total: 300 },
  );

  const fresh = itemFor(result, 'budgeted-not-yet-spending');
  expect(fresh.freezeReason).toBeUndefined();
  expect(fresh.status).not.toBe('frozen');
  expect(fresh.finalBudget).toBeGreaterThan(0);
});

test('a brand-new ad set keeps the pre-existing new-item LOCK, not a freeze reason', () => {
  // ageDays under the new-item lock pins the budget for the cycle (classify.ts). That is
  // older machinery and must stay distinguishable from an eligibility hold: locked, but
  // carrying no freezeReason, so the report does not accuse it of anything.
  const result = runCycle(
    [
      earner('earner-a', 200),
      adSet({
        id: 'launched-yesterday',
        currentBudget: 100,
        ageDays: 1,
        windows: { d3: ZERO, d7: ZERO, d14: ZERO },
      }),
    ],
    { objective: 'purchase', total: 300 },
  );

  const fresh = itemFor(result, 'launched-yesterday');
  expect(fresh.freezeReason).toBeUndefined();
  expect(fresh.finalBudget).toBe(100);
});

// --- No declared objective ------------------------------------------------------------

test("an ad set that declares no objective and bought none of the portfolio's events is held", () => {
  const result = runCycle(
    [
      earner('earner-a', 200),
      adSet({
        id: 'undeclared',
        currentBudget: 200,
        optimization_goal: undefined,
        windows: { d3: bought(300, 0), d7: bought(700, 0), d14: bought(1_500, 0) },
      }),
    ],
    { objective: 'purchase', total: 400 },
  );

  const undeclared = itemFor(result, 'undeclared');
  expect(undeclared.freezeReason).toBe('no_declared_objective');
  // Held means PINNED, exactly like kpi_mismatch — not starved toward a floor.
  expect(undeclared.finalBudget).toBe(200);
  expect(undeclared.changeAbs).toBe(0);
});

test('a held undeclared ad set earns no recommendation — a verdict on a non-member is not ours to give', () => {
  const result = runCycle(
    [
      earner('earner-a', 200),
      adSet({
        id: 'undeclared',
        currentBudget: 200,
        optimization_goal: undefined,
        windows: { d3: bought(300, 0), d7: bought(700, 0), d14: bought(1_500, 0) },
      }),
    ],
    { objective: 'purchase', total: 400 },
  );

  expect(result.recommendations.filter((r) => r.adSetId === 'undeclared')).toEqual([]);
});

test("an undeclared ad set that DOES buy the portfolio's events is still scored", () => {
  // The older-sync fallback (currency.test.ts) stays intact: a row missing optimization_goal
  // that demonstrably produces the portfolio's currency is established by observation.
  const result = runCycle(
    [
      earner('earner-a', 200),
      adSet({
        id: 'undeclared-but-converting',
        currentBudget: 200,
        optimization_goal: undefined,
        windows: { d3: bought(300, 7), d7: bought(700, 16), d14: bought(1_500, 35) },
      }),
    ],
    { objective: 'purchase', total: 400 },
  );

  expect(itemFor(result, 'undeclared-but-converting').freezeReason).toBeUndefined();
});

test('declaring a goal the ingest could not map is NOT undeclared — it falls back to the portfolio', () => {
  // optimization_goal present, kpiField absent (goalToKpiField had no mapping). The ad set
  // DID declare something; the boundary just could not resolve it. Existing behaviour.
  const result = runCycle(
    [
      earner('earner-a', 200),
      adSet({
        id: 'unmapped-goal',
        currentBudget: 200,
        optimization_goal: 'SOME_FUTURE_META_GOAL',
        windows: { d3: bought(300, 0), d7: bought(700, 0), d14: bought(1_500, 0) },
      }),
    ],
    { objective: 'purchase', total: 400 },
  );

  const unmapped = itemFor(result, 'unmapped-goal');
  expect(unmapped.freezeReason).toBeUndefined();
  // It stays a pool member and is ACTED ON (the pause trigger starves it), rather than being
  // held silently as if it had never declared anything.
  expect(unmapped.status).toBe('starved');
  expect(result.recommendations.some((r) => r.adSetId === 'unmapped-goal')).toBe(true);
});

test('with no portfolio objective there is no currency to have failed to declare', () => {
  // The legacy Excel default (cfg.kpiField unset) scores on the purchase/ATC tiers and has
  // no declared currency at all, so the undeclared hold must not fire there.
  const result = runCycle(
    [
      adSet({
        id: 'legacy-a',
        optimization_goal: undefined,
        windows: { d3: bought(300, 6), d7: bought(700, 15), d14: bought(1_500, 32) },
      }),
      adSet({
        id: 'legacy-b',
        optimization_goal: undefined,
        windows: { d3: bought(300, 3), d7: bought(700, 7), d14: bought(1_500, 15) },
      }),
    ],
    { total: 200 },
  );

  expect(itemFor(result, 'legacy-a').freezeReason).toBeUndefined();
  expect(itemFor(result, 'legacy-b').freezeReason).toBeUndefined();
});

// --- Held items are reported, and the pool still conserves ----------------------------

test('held ad sets stay IN the output with their reason, and the pool conserves', () => {
  // Holding is not hiding. Every enrolled ad set must still appear in the cycle.
  const result = runCycle(
    [
      earner('earner-a', 300),
      earner('earner-b', 300),
      adSet({ id: 'boosted', currentBudget: 0, windows: { d3: ZERO, d7: ZERO, d14: ZERO } }),
      adSet({
        id: 'undeclared',
        currentBudget: 200,
        optimization_goal: undefined,
        windows: { d3: bought(300, 0), d7: bought(700, 0), d14: bought(1_500, 0) },
      }),
    ],
    { objective: 'purchase', total: 800 },
  );

  expect(result.reallocation.items.map((i) => i.id).sort()).toEqual([
    'boosted',
    'earner-a',
    'earner-b',
    'undeclared',
  ]);
  expect(result.reallocation.conserved).toBe(true);

  // Conservation with the held ones excluded: they are pinned, the pool is what remains.
  expect(result.reallocation.frozenBudget).toBeCloseTo(200, 6);
  expect(result.reallocation.pool).toBeCloseTo(600, 6);
  expect(result.reallocation.allocatedTotal).toBeCloseTo(800, 6);
});

// --- The floor denominator ------------------------------------------------------------

test('the floor averages over ELIGIBLE budgets only — held rows do not dilute it', () => {
  // The live arithmetic, scaled down. Six ad sets at $170.33 plus four zero-budget boosted
  // posts: averaging over all ten gives 102.2 (floor 15.33); over the six that are actually
  // being allocated gives 170.33 (floor 25.55). The four rows the engine does not fund must
  // not cut everyone else's guaranteed minimum.
  const eligible = Array.from({ length: 6 }, (_, i) => earner(`earner-${i}`, 170.33));
  const boosted = Array.from({ length: 4 }, (_, i) =>
    adSet({ id: `boosted-${i}`, currentBudget: 0, windows: { d3: ZERO, d7: ZERO, d14: ZERO } }),
  );

  const result = runCycle([...eligible, ...boosted], { objective: 'purchase', total: 1_021.98 });

  // floorPortfolioPct defaults to 0.15.
  expect(itemFor(result, 'earner-0').floor).toBeCloseTo(0.15 * 170.33, 6);

  // And the same portfolio WITHOUT the boosted posts produces the identical floor — which is
  // the claim: rows the engine does not fund have no say in the floor.
  const withoutBoosted = runCycle(eligible, { objective: 'purchase', total: 1_021.98 });
  expect(itemFor(withoutBoosted, 'earner-0').floor).toBeCloseTo(
    itemFor(result, 'earner-0').floor,
    9,
  );
});

test('a frozen ad set with a REAL budget is also out of the floor average', () => {
  // Not only zero-budget rows. A pinned $1,000 CBO ad set would otherwise inflate the floor
  // of the small ad sets the engine actually controls. reallocate() directly: no cycle-level
  // freezing involved, just the denominator.
  const small = Array.from({ length: 4 }, (_, i) => earner(`small-${i}`, 100));
  const pinned = adSet({
    id: 'pinned-cbo',
    currentBudget: 1_000,
    status: 'frozen',
    freeze: true,
    freezeReason: 'unsupported_budget',
    windows: { d3: bought(300, 4), d7: bought(700, 9), d14: bought(1_500, 20) },
  });

  const res = reallocate([...small, pinned], 1_400, { objective: 'purchase' });
  const floorOf = (id: string) => res.items.find((i) => i.id === id)!.floor;

  expect(floorOf('small-0')).toBeCloseTo(0.15 * 100, 6);
  // Averaging over all five rows would have given 0.15 * 280 = 42 — over four times as much.
  expect(floorOf('small-0')).toBeLessThan(42);
});

test('a flagged ad set is out of the floor average too — it is being zeroed, not floored', () => {
  const active = Array.from({ length: 3 }, (_, i) => earner(`active-${i}`, 100));
  const flagged = adSet({
    id: 'flagged',
    currentBudget: 700,
    status: 'flagged',
    windows: { d3: bought(300, 0), d7: bought(700, 0), d14: bought(1_500, 0) },
  });

  const res = reallocate([...active, flagged], 1_000, { objective: 'purchase' });
  expect(res.items.find((i) => i.id === 'active-0')!.floor).toBeCloseTo(0.15 * 100, 6);
});

test('when every ad set is held the floor falls back to its signal term, not NaN', () => {
  const res = reallocate(
    [
      adSet({
        id: 'a',
        currentBudget: 0,
        windows: { d3: ZERO, d7: ZERO, d14: ZERO },
        status: 'frozen',
        freeze: true,
      }),
      adSet({
        id: 'b',
        currentBudget: 0,
        windows: { d3: ZERO, d7: ZERO, d14: ZERO },
        status: 'frozen',
        freeze: true,
      }),
    ],
    0,
    { objective: 'purchase' },
  );

  for (const item of res.items) expect(Number.isFinite(item.floor)).toBe(true);
});
