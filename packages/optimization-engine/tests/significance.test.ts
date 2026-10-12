// P1 statistical-rigor tests (bun test): CIs, shrinkage, precision-weighting A/B.
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, EvalSample, WindowMetrics } from '../src/index';
import {
  backtestPredictiveness,
  costInterval,
  cpaInterval,
  DEFAULT_CONFIG,
  reallocate,
  resolveConfig,
  scoreAdSet,
  shrinkScores,
  upperBoundMissingBecause,
} from '../src/index';

const w = (spend: number, purchases: number): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});

test('cpaInterval: more events => tighter interval around the same CPA', () => {
  // Both CPA $40, but 200 events vs 5 events.
  const many = cpaInterval(w(8000, 200), DEFAULT_CONFIG);
  const few = cpaInterval(w(200, 5), DEFAULT_CONFIG);
  expect(Math.round(many.cpa)).toBe(40);
  expect(Math.round(few.cpa)).toBe(40);
  // Every count of one or more has an upper bound (exact interval), so both widths exist.
  const wMany = (many.hi as number) - many.lo;
  const wFew = (few.hi as number) - few.lo;
  expect(wFew / few.cpa).toBeGreaterThan(wMany / many.cpa); // relative width larger for sparse
  expect(cpaInterval(w(100, 0), DEFAULT_CONFIG).events).toBe(0);
});

test('shrinkScores: sparse items pulled toward the cohort mean, high-volume kept', () => {
  const out = shrinkScores(
    [
      { id: 'big', score: 1.0, events: 500 }, // dominant, reliable
      { id: 'tiny', score: 0.0, events: 1 }, // sparse outlier
    ],
    20,
  );
  const big = out.find((x) => x.id === 'big')!;
  const tiny = out.find((x) => x.id === 'tiny')!;
  // event-weighted mean ≈ 1.0 (big dominates). big barely moves; tiny pulled way up.
  expect(big.shrunk).toBeGreaterThan(0.95);
  expect(tiny.shrunk).toBeGreaterThan(0.5);
  expect(tiny.shrunk).toBeLessThan(big.shrunk);
});

test("precision weighting leaves a fully-reliable ad set's ranking intact", () => {
  // All windows high-volume & consistent => precision ~1 => composite ≈ unchanged.
  const s: AdSetSnapshot = {
    id: 'x',
    status: 'active',
    currentBudget: 0,
    ageDays: 30,
    windows: { d3: w(3000, 75), d7: w(7000, 175), d14: w(14000, 350) },
  };
  const base = scoreAdSet(s, DEFAULT_CONFIG).composite;
  const prec = scoreAdSet(s, resolveConfig({ toggles: { precisionWeighting: true } })).composite;
  expect(prec).toBeGreaterThan(0);
  expect(Math.abs(prec - base) / base).toBeLessThan(0.05);
});

// Backtest A/B: a noisy low-event d3 window misleads the default composite; precision
// weighting down-weights it and recovers predictiveness.
test('backtest A/B: precision weighting beats the binary gate on noisy sparse windows', () => {
  const samples: EvalSample[] = [];
  for (let i = 1; i <= 24; i++) {
    const signal = i / 1000; // true rate, monotonic
    const noise = ((i * 7) % 13) / 1000; // non-monotonic, uncorrelated
    samples.push({
      nextEfficiency: signal,
      snapshot: {
        id: `a${i}`,
        status: 'active',
        currentBudget: 0,
        ageDays: 30,
        windows: {
          d3: w(100, noise * 100), // 1 event-ish, noisy
          d7: w(8000, signal * 8000), // ~ many events, reliable
          d14: w(16000, signal * 16000), // reliable
        },
      },
    });
  }
  const base = backtestPredictiveness(samples).overall.composite;
  const prec = backtestPredictiveness(samples, { toggles: { precisionWeighting: true } }).overall
    .composite;
  expect(prec).toBeGreaterThan(base);
});

test('reallocate shrinkage pulls a lucky low-volume ad set toward the cohort mean', () => {
  const big: AdSetSnapshot = {
    id: 'big',
    status: 'active',
    currentBudget: 500,
    ageDays: 60,
    windows: { d3: w(3000, 75), d7: w(7000, 175), d14: w(20000, 500) },
  }; // rate ~0.025, 500 events
  const tiny: AdSetSnapshot = {
    id: 'tiny',
    status: 'active',
    currentBudget: 50,
    ageDays: 60,
    windows: { d3: w(3, 0.3), d7: w(7, 0.7), d14: w(20, 2) },
  }; // lucky rate 0.1, only 2 events
  const off = reallocate([big, tiny], 1000, { toggles: { shrinkage: false } });
  const on = reallocate([big, tiny], 1000, { toggles: { shrinkage: true } });
  const tinyOff = off.items.find((i) => i.id === 'tiny')!.compositeScore;
  const tinyOn = on.items.find((i) => i.id === 'tiny')!.compositeScore;
  expect(tinyOn).toBeLessThan(tinyOff); // shrunk down toward the (big-dominated) cohort mean
  const bigOff = off.items.find((i) => i.id === 'big')!.compositeScore;
  const bigOn = on.items.find((i) => i.id === 'big')!.compositeScore;
  expect(Math.abs(bigOn - bigOff) / bigOff).toBeLessThan(0.1); // high-volume barely moves
});

test('reallocate attaches a CPA confidence interval per item', () => {
  const s: AdSetSnapshot = {
    id: 'x',
    status: 'active',
    currentBudget: 100,
    ageDays: 30,
    windows: { d3: w(1200, 30), d7: w(4000, 100), d14: w(8000, 200) },
  };
  const ci = reallocate([s], 1000).items[0].ci!;
  expect(Math.round(ci.cpa)).toBe(40); // 8000 / 200
  expect(ci.events).toBe(200);
  expect(ci.lo).toBeLessThan(ci.cpa);
  expect(ci.hi as number).toBeGreaterThan(ci.cpa);
});

// The $339,700,000 regression, in the account's own figures.
//
// Easy Fit / FORMULARIOS // TODOS — a portfolio budgeted at 324 a day. The ad set
// ALEIRA // AGOSTO - LKL spent 339.70 and recorded 2 leads over 14 days, and the stored
// cycle item carried `hi: 339700000`: the 1e-6 clamp, printed on a card a client read.
//
// CHANGED with the exact interval (ledger D-adj-cost-interval): the first fix reported NO
// bound at 2 events, which was true of the normal approximation and a cliff in the
// product. Garwood's interval bounds the count from below at every N ≥ 1, so ALEIRA now
// carries a wide, finite, honest bound — 1,402.57, under the 4,536 the portfolio could have
// spent over its 14 days — and the regression this test guards is the nine-orders figure,
// which it still catches: 339700000 is not 1402.57.
test('costInterval: a sparse count reports a wide, finite, honest upper bound', () => {
  const aleira = costInterval(339.7, 2);
  expect(aleira.cpa).toBeCloseTo(169.85, 2);
  // lo = 339.70 / (χ²(0.975, 6) / 2 = 7.2248); was 71.19 under N + z√N.
  expect(aleira.lo).toBeCloseTo(47.02, 2);
  // hi = 339.70 / (χ²(0.025, 4) / 2 = 0.2422); was null, and 339,700,000 before that.
  expect(aleira.hi).toBeCloseTo(1402.57, 2);
  expect(aleira.hi as number).toBeLessThan(324 * 14);
  expect(upperBoundMissingBecause(aleira)).toBeNull();

  // Its neighbour on the same portfolio, from the same line: 386.43 spend on 2 events.
  const iteso = costInterval(386.43, 2);
  expect(iteso.hi).toBeCloseTo(1595.51, 2);

  // No events at all: no point estimate and no bound, and the reason says so. This is the
  // ONE case an exact interval leaves unbounded — the window is consistent with a rate of 0.
  const none = costInterval(100, 0);
  expect(none).toEqual({ cpa: 0, lo: 0, hi: null, events: 0 });
  expect(upperBoundMissingBecause(none)).toBe('no events to divide the spend by');
});

// The plan's worked figure: 346.40 spent on 4 results, an estimate of 86.60 per result.
// Under N − z√N the lower count is 4 − 3.92 = 0.08 and the upper bound 4,330.00 — fifty
// times the estimate, one result after "no bound". Garwood's lower count is
// χ²(0.025, 8)/2 = 1.0898, and the bound is 317.85.
test('costInterval: 346.40 on 4 results bounds at 317.85, not 4,330', () => {
  const four = costInterval(346.4, 4);
  expect(four.cpa).toBeCloseTo(86.6, 2);
  expect(four.hi).toBeCloseTo(317.85, 2);
  expect(four.lo).toBeCloseTo(33.82, 2);
  expect(346.4 / (4 - 1.96 * Math.sqrt(4))).toBeCloseTo(4330, 0); // what it used to print
});

// The cliff itself. Hold the estimate at 100 per result and walk the count up: the bound
// must exist at every N, shrink toward the estimate monotonically, and never jump — the
// old interval went null → 50× between N = 3 and N = 4.
test('costInterval: the upper bound is continuous and monotone across n = 2, 3, 4, 5, 10, 50', () => {
  const counts = [2, 3, 4, 5, 10, 50];
  const bounds = counts.map((n) => costInterval(100 * n, n));
  for (const b of bounds) {
    expect(b.hi).not.toBeNull();
    expect(b.hi as number).toBeGreaterThan(b.cpa);
    expect(b.lo).toBeLessThan(b.cpa);
  }
  for (let i = 1; i < bounds.length; i++) {
    const prev = bounds[i - 1].hi as number;
    const next = bounds[i].hi as number;
    expect(next).toBeLessThan(prev); // more results => a tighter bound
    expect(bounds[i].lo).toBeGreaterThan(bounds[i - 1].lo);
  }
  // No cliff: one more result never halves the bound. (3 → 4 is the step that used to go
  // from "none" to 5,000; it is now 484.9 → 367.0.)
  const three = costInterval(300, 3).hi as number;
  const four = costInterval(400, 4).hi as number;
  expect(three).toBeCloseTo(484.9, 1);
  expect(four).toBeCloseTo(367.0, 1);
  expect(three / four).toBeLessThan(2);
  // The multiples of the estimate, pinned so a drift in the numerics is visible by name.
  expect((bounds[0].hi as number) / 100).toBeCloseTo(8.258, 3); // n = 2
  expect((bounds[3].hi as number) / 100).toBeCloseTo(3.08, 2); // n = 5
  expect((bounds[4].hi as number) / 100).toBeCloseTo(2.085, 3); // n = 10
  expect((bounds[5].hi as number) / 100).toBeCloseTo(1.347, 3); // n = 50
});

// Large counts: the exact interval converges to the N ± z√N the engine used to compute, so
// the figures a high-volume ad set printed yesterday move by at most a percent or two.
// CHANGED: the old pin was spend / (N − z√N) to six decimals at N = 200; that is the
// approximation, and the exact bound at 200 sits 0.55% under it.
test('costInterval: converges to the normal approximation for n ≥ 100 within 2%, 0.5% by 500', () => {
  const normal = (spend: number, n: number, z = 1.96) => ({
    lo: spend / (n + z * Math.sqrt(n)),
    hi: spend / (n - z * Math.sqrt(n)),
  });
  for (const n of [100, 200, 500, 1000, 5000]) {
    const exact = costInterval(40 * n, n);
    const approx = normal(40 * n, n);
    const tolerance = n >= 500 ? 0.005 : 0.02;
    expect(Math.abs((exact.hi as number) / approx.hi - 1)).toBeLessThan(tolerance);
    expect(Math.abs(exact.lo / approx.lo - 1)).toBeLessThan(tolerance);
  }
  // The figures a 200-event ad set at 40 per result prints, pinned.
  const many = costInterval(8000, 200);
  expect(many.cpa).toBe(40);
  expect(many.lo).toBeCloseTo(34.82, 2); // was 35.13
  expect(many.hi).toBeCloseTo(46.18, 2); // was 46.44
  expect(upperBoundMissingBecause(many)).toBeNull();
});
