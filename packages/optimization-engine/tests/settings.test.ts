// The S family: recommendations about the portfolio's own knobs, read off what the solver
// did. Boundary-tested on the shares that fire them; every recommendation is portfolio-
// scoped, human-approved, and carries a patch only where there is one knob to turn.
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, ItemDiagnostics, ReallocationResult, WindowMetrics } from '../src/index';
import {
  CAP_BINDING_SHARE,
  DEFAULT_CONFIG,
  evaluateSettings,
  PORTFOLIO_SCOPE,
  runCycle,
} from '../src/index';

const w = (spend: number, purchases: number, impressions = 1000): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions,
});

const item = (id: string, over: Partial<ItemDiagnostics> = {}): ItemDiagnostics => ({
  id,
  status: 'active',
  currentBudget: 100,
  score3d: 1,
  score7d: 1,
  score14d: 1,
  trajectoryRatio: 1,
  trajectoryState: 'flat',
  weights: { d3: 0.2, d7: 0.4, d14: 0.4 },
  compositeScore: 1,
  effectiveScore: 1,
  portfolioShare: 0.25,
  rawBudget: 100,
  velocityCapped: 100,
  floor: 15,
  lowerBound: 70,
  upperBound: 130,
  finalBudget: 100,
  changeAbs: 0,
  changePct: 0,
  capBreached: false,
  floorRelaxed: false,
  ...over,
});

const realloc = (items: ItemDiagnostics[], over: Partial<ReallocationResult> = {}): ReallocationResult => ({
  totalBudget: 400,
  pool: 400,
  frozenBudget: 0,
  items,
  allocatedTotal: 400,
  conserved: true,
  residual: 0,
  feasibility: { sumLowerBounds: 280, sumUpperBounds: 520, overflow: false, underflow: false },
  notes: [],
  ...over,
});

const healthy: AdSetSnapshot = {
  id: 'a',
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: { d3: w(300, 10), d7: w(700, 25), d14: w(1400, 50) },
};

test('S1 fires when the velocity cap binds on half the moves, with a patch when the hold is lower', () => {
  const cap = DEFAULT_CONFIG.velocityCapPct;
  const items = [
    item('a', { changePct: cap }),
    item('b', { changePct: -cap }),
    item('c', { changePct: 0.05 }),
    item('d', { changePct: 0.02 }),
  ];
  const recs = evaluateSettings(realloc(items), [healthy], DEFAULT_CONFIG, {
    mode: 'balanced',
    applyCapPct: 0.2,
  });
  const s1 = recs.find((r) => r.trigger === 'S1_velocity_cap_binding');
  expect(s1).toBeDefined();
  expect(s1?.adSetId).toBe(PORTFOLIO_SCOPE);
  expect(s1?.kind).toBe('settings');
  expect(s1?.needsApproval).toBe(true);
  expect(s1?.evidence?.value).toBeCloseTo(CAP_BINDING_SHARE, 6);
  expect(s1?.patch).toEqual({ field: 'max_change_pct_per_cycle', from: 0.2, to: cap });
});

test('S1 carries no patch when the hold threshold already matches the cap, and stays quiet under the share', () => {
  const cap = DEFAULT_CONFIG.velocityCapPct;
  const binding = [item('a', { changePct: cap }), item('b', { changePct: -cap }), item('c'), item('d')];
  const noPatch = evaluateSettings(realloc(binding), [healthy], DEFAULT_CONFIG, {
    mode: 'balanced',
    applyCapPct: cap,
  });
  const s1 = noPatch.find((r) => r.trigger === 'S1_velocity_cap_binding');
  expect(s1).toBeDefined();
  expect(s1?.patch).toBeUndefined();

  const quiet = evaluateSettings(
    realloc([item('a', { changePct: cap }), item('b'), item('c'), item('d')]),
    [healthy],
    DEFAULT_CONFIG,
    { mode: 'balanced', applyCapPct: 0.2 },
  );
  expect(quiet.some((r) => r.trigger === 'S1_velocity_cap_binding')).toBe(false);
});

test('S1 never counts a breached move as bound by the cap — it went past it', () => {
  // The live report: "±30% velocity cap bound on 6 of 6" over moves of −37% to −60%. Pacing
  // carried them past the cap, which it may; the cap bound none of them.
  const cap = DEFAULT_CONFIG.velocityCapPct;
  const pastCap = (id: string, changePct: number) => item(id, { changePct, capBreached: true });
  const allPast = [-0.37, -0.42, -0.45, -0.5, -0.55, -0.6].map((p, i) => pastCap(`p${i}`, p));
  const quiet = evaluateSettings(realloc(allPast), [healthy], DEFAULT_CONFIG, { mode: 'balanced' });
  expect(quiet.some((r) => r.trigger === 'S1_velocity_cap_binding')).toBe(false);

  // Bound on most moves AND some went past: the share counts the bound ones only, and the
  // breaches are said as what happened, with both counts structured on the evidence.
  const mixed = [
    item('a', { changePct: cap }),
    item('b', { changePct: -cap }),
    item('c', { changePct: cap }),
    pastCap('d', -0.45),
  ];
  const s1 = evaluateSettings(realloc(mixed), [healthy], DEFAULT_CONFIG, {
    mode: 'balanced',
  }).find((r) => r.trigger === 'S1_velocity_cap_binding');
  expect(s1?.evidence?.value).toBeCloseTo(0.75, 6);
  expect(s1?.evidence?.capBinding).toEqual({ atCap: 3, breached: 1, moves: 4 });
  expect(s1?.evidence?.comparator).toBe('3 of 4 moves at the ±30% cap');
  expect(s1?.reason).toContain('bound on 3 of 4 moves');
  expect(s1?.reason).toContain('1 of 4 moves went past the ±30% cap: pacing may exceed it.');
  expect(s1?.evidence?.headline?.value).toBe(75);
});

test('S2 fires when floors were relaxed on 30% of the ad sets', () => {
  const items = [item('a', { floorRelaxed: true }), item('b'), item('c')];
  const recs = evaluateSettings(realloc(items), [healthy], DEFAULT_CONFIG, { mode: 'balanced' });
  const s2 = recs.find((r) => r.trigger === 'S2_floor_too_high');
  expect(s2?.reason).toContain('relax the floor on 1 of 3');
  expect(s2?.patch).toBeUndefined();
});

test('S3 fires only in efficiency mode, proposing the daily total that actually got placed', () => {
  const left = realloc([item('a'), item('b')], { residual: 60, allocatedTotal: 340 });
  const efficiency = evaluateSettings(left, [healthy], DEFAULT_CONFIG, { mode: 'efficiency' });
  const s3 = efficiency.find((r) => r.trigger === 'S3_persistent_underspend');
  expect(s3?.patch).toEqual({ field: 'daily_total', from: 400, to: 340 });
  expect(s3?.evidence?.estImpactPerDay).toBe(60);
  const balanced = evaluateSettings(left, [healthy], DEFAULT_CONFIG, { mode: 'balanced' });
  expect(balanced.some((r) => r.trigger === 'S3_persistent_underspend')).toBe(false);
});

test('S5 names delivering ad sets with spend past a target CPA and zero tracked events', () => {
  const dark: AdSetSnapshot = {
    ...healthy,
    id: 'dark',
    windows: { d3: w(30, 0), d7: w(70, 0), d14: w(140, 0) },
  };
  const silent: AdSetSnapshot = {
    ...healthy,
    id: 'no-impressions',
    windows: { d3: w(30, 0, 0), d7: w(70, 0, 0), d14: w(140, 0, 0) },
  };
  const recs = evaluateSettings(realloc([item('a')]), [healthy, dark, silent], DEFAULT_CONFIG, {
    mode: 'balanced',
  });
  const s5 = recs.find((r) => r.trigger === 'S5_tracking_gap');
  expect(s5?.reason).toContain('dark');
  expect(s5?.reason).not.toContain('no-impressions');
  expect(s5?.evidence?.estImpactPerDay).toBe(10);
});

test('runCycle appends settings recommendations after the ad-set ones, and none on a quiet portfolio', () => {
  const res = runCycle([healthy, { ...healthy, id: 'b' }], { total: 200, objective: 'purchase' });
  expect(res.recommendations.filter((r) => r.kind === 'settings')).toEqual([]);
});
