// Decision-outcome attribution math (extractDecisions + computeDecisionOutcome)
// on synthetic daily series (bun test).
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { DEFAULT_CONFIG, runCycle } from '../src/index';
import type { DecisionDraft } from '../src/outcomes';
import { computeDecisionOutcome, extractDecisions, realizedWindow } from '../src/outcomes';
// DailyMetrics is not re-exported from index (only snapshot-level types are);
// import it from the module directly to keep index.ts untouched in this pass.
import type { DailyMetrics } from '../src/types';

const w = (spend: number, purchases: number, clicks = 0, impressions = 0): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks,
  impressions,
});

const day = (date: string, spend: number, purchases: number): DailyMetrics => ({
  date,
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 1000,
});

const snap = (id: string, over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id,
  status: 'active',
  currentBudget: 100,
  ageDays: 40,
  windows: { d3: w(300, 10), d7: w(700, 25), d14: w(1400, 50) },
  ...over,
});

const DECIDED_AT = '2026-06-01T12:00:00.000Z';

// Ten daily rows 06-01 .. 06-10; the 7-day horizon window is 06-02 .. 06-08.
const dailySeries = (spendPerDay: number, purchasesPerDay: number): DailyMetrics[] =>
  Array.from({ length: 10 }, (_, i) =>
    day(`2026-06-${String(i + 1).padStart(2, '0')}`, spendPerDay, purchasesPerDay),
  );

test('extractDecisions: material budget moves, recommendation mapping, abstain freeze', () => {
  // learningConvThreshold 0 so classify() leaves these 'active' (the default 50
  // would put every fixture in 'learning', whose 8% down-cap is sub-material).
  // 'winner' absorbs the freed pool (budget_increase); 'loser' fires P2 with a
  // flat trajectory (pause rec + starve -> budget_decrease to floor); 'dead'
  // fires P3; 'quiet' abstains (spend, zero events, below every pause gate).
  const snapshots: AdSetSnapshot[] = [
    snap('winner', { windows: { d3: w(120, 12), d7: w(280, 28), d14: w(560, 56) } }),
    snap('loser', { windows: { d3: w(140, 1), d7: w(280, 2), d14: w(560, 4) } }),
    snap('dead', { windows: { d3: w(5, 0), d7: w(30, 0), d14: w(60, 0) } }),
    snap('quiet', { windows: { d3: w(5, 0), d7: w(15, 0), d14: w(30, 0) } }),
  ];
  const result = runCycle(snapshots, { total: 400, config: { learningConvThreshold: 0 } });
  const decisions = extractDecisions(result, snapshots, DEFAULT_CONFIG, {
    decidedAt: DECIDED_AT,
  });
  const byKey = new Map(decisions.map((d) => [`${d.adSetId}:${d.kind}`, d]));

  expect(byKey.has('winner:budget_increase')).toBe(true);
  expect(byKey.has('loser:budget_decrease')).toBe(true);
  expect(byKey.has('dead:pause_recommended')).toBe(true);
  expect(byKey.get('dead:pause_recommended')?.source).toBe('P3_low_significance');
  expect(byKey.get('loser:pause_recommended')?.source).toBe('P2_sustained_poor');
  expect(byKey.has('quiet:freeze')).toBe(true);
  expect(byKey.get('quiet:freeze')?.source).toBe('abstain');
  // one decision per (adSetId, kind); baselines frozen at decision time
  expect(decisions.length).toBe(new Set(decisions.map((d) => `${d.adSetId}:${d.kind}`)).size);
  const winner = byKey.get('winner:budget_increase');
  expect(winner?.baseline.cppD7).toBe(10); // 280 / 28
  expect(winner?.baseline.portfolioCppD7).toBeGreaterThan(0);
});

test('realizedWindow sums the daily series strictly inside (decidedAt, +horizon]', () => {
  const realized = realizedWindow(dailySeries(50, 5), DECIDED_AT, 7, DEFAULT_CONFIG);
  expect(realized).toBeDefined();
  expect(realized?.days).toBe(7); // 06-02 .. 06-08 inclusive; 06-01 excluded
  expect(realized?.spend).toBe(350);
  expect(realized?.kpiEvents).toBe(35);
  expect(realized?.cpp).toBe(10);
});

const draft = (kind: DecisionDraft['kind'], baselineCpp: number): DecisionDraft => ({
  adSetId: 'x',
  kind,
  source: 'test',
  decidedAt: DECIDED_AT,
  horizonDays: 7,
  baseline: { cppD7: baselineCpp, spendD7: 700, kpiEventsD7: 70, portfolioCppD7: 10 },
});

// Flat portfolio: realized portfolio CPP == baseline portfolio CPP (10).
const flatPortfolio = [
  snap('p', { windows: { d3: w(300, 30), d7: w(700, 70), d14: w(1400, 140) } }),
];

test('grow decision scores positive when the ad set improves vs a flat portfolio', () => {
  // baseline CPP 20 -> realized CPP 10 (improved 50%), portfolio flat.
  const later = snap('x', { daily: dailySeries(50, 5) });
  const outcome = computeDecisionOutcome(
    draft('budget_increase', 20),
    later,
    flatPortfolio,
    DEFAULT_CONFIG,
  );
  expect(outcome.status).toBe('matured');
  if (outcome.status === 'matured') {
    expect(outcome.adsetRelDelta).toBeCloseTo(-0.5);
    expect(outcome.portfolioRelDelta).toBeCloseTo(0);
    expect(outcome.score ?? 0).toBeCloseTo(0.5); // positive = right call
  }
});

test('cut decision scores positive when the ad set keeps deteriorating', () => {
  // baseline CPP 5 -> realized CPP 10 (worse), portfolio flat: the cut was right.
  const later = snap('x', { daily: dailySeries(50, 5) });
  const outcome = computeDecisionOutcome(
    draft('budget_decrease', 5),
    later,
    flatPortfolio,
    DEFAULT_CONFIG,
  );
  expect(outcome.status).toBe('matured');
  if (outcome.status === 'matured') {
    expect(outcome.score ?? 0).toBeCloseTo(1.0);
  }
});

test('stayed-dead label: cut decision on a signal-less ad set that kept spending', () => {
  const later = snap('x', { daily: dailySeries(20, 0) });
  const outcome = computeDecisionOutcome(
    draft('pause_recommended', 0),
    later,
    flatPortfolio,
    DEFAULT_CONFIG,
  );
  expect(outcome.status).toBe('matured');
  if (outcome.status === 'matured') {
    expect(outcome.stayedDead).toBe(true);
    expect(outcome.score).toBeUndefined();
  }
});

test('insufficient data: horizon not covered, missing snapshot, uncomparable grow', () => {
  // Only 3 daily rows inside the horizon.
  const short = snap('x', { daily: dailySeries(50, 5).slice(0, 4) });
  expect(
    computeDecisionOutcome(draft('budget_increase', 20), short, flatPortfolio, DEFAULT_CONFIG)
      .status,
  ).toBe('insufficient_data');
  expect(
    computeDecisionOutcome(draft('budget_increase', 20), undefined, flatPortfolio, DEFAULT_CONFIG)
      .status,
  ).toBe('insufficient_data');
  // Grow decision with zero realized events cannot be scored.
  const dead = snap('x', { daily: dailySeries(20, 0) });
  expect(
    computeDecisionOutcome(draft('creative_refresh', 20), dead, flatPortfolio, DEFAULT_CONFIG)
      .status,
  ).toBe('insufficient_data');
});
