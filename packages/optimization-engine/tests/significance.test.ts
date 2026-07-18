// P1 statistical-rigor tests (bun test): CIs, shrinkage, precision-weighting A/B.
import { test, expect } from "bun:test";

import {
  cpaInterval,
  shrinkScores,
  scoreAdSet,
  reallocate,
  backtestPredictiveness,
  resolveConfig,
  DEFAULT_CONFIG,
} from "../src/index";
import type { AdSetSnapshot, EvalSample, WindowMetrics } from "../src/index";

const w = (spend: number, purchases: number): WindowMetrics => ({ spend, purchases, addToCarts: 0, clicks: 0, impressions: 0 });

test("cpaInterval: more events => tighter interval around the same CPA", () => {
  // Both CPA $40, but 200 events vs 5 events.
  const many = cpaInterval(w(8000, 200), DEFAULT_CONFIG);
  const few = cpaInterval(w(200, 5), DEFAULT_CONFIG);
  expect(Math.round(many.cpa)).toBe(40);
  expect(Math.round(few.cpa)).toBe(40);
  const wMany = many.hi - many.lo;
  const wFew = few.hi - few.lo;
  expect(wFew / few.cpa).toBeGreaterThan(wMany / many.cpa); // relative width larger for sparse
  expect(cpaInterval(w(100, 0), DEFAULT_CONFIG).events).toBe(0);
});

test("shrinkScores: sparse items pulled toward the cohort mean, high-volume kept", () => {
  const out = shrinkScores(
    [
      { id: "big", score: 1.0, events: 500 }, // dominant, reliable
      { id: "tiny", score: 0.0, events: 1 }, // sparse outlier
    ],
    20,
  );
  const big = out.find((x) => x.id === "big")!;
  const tiny = out.find((x) => x.id === "tiny")!;
  // event-weighted mean ≈ 1.0 (big dominates). big barely moves; tiny pulled way up.
  expect(big.shrunk).toBeGreaterThan(0.95);
  expect(tiny.shrunk).toBeGreaterThan(0.5);
  expect(tiny.shrunk).toBeLessThan(big.shrunk);
});

test("precision weighting leaves a fully-reliable ad set's ranking intact", () => {
  // All windows high-volume & consistent => precision ~1 => composite ≈ unchanged.
  const s: AdSetSnapshot = { id: "x", status: "active", currentBudget: 0, ageDays: 30, windows: { d3: w(3000, 75), d7: w(7000, 175), d14: w(14000, 350) } };
  const base = scoreAdSet(s, DEFAULT_CONFIG).composite;
  const prec = scoreAdSet(s, resolveConfig({ toggles: { precisionWeighting: true } })).composite;
  expect(prec).toBeGreaterThan(0);
  expect(Math.abs(prec - base) / base).toBeLessThan(0.05);
});

// Backtest A/B: a noisy low-event d3 window misleads the default composite; precision
// weighting down-weights it and recovers predictiveness.
test("backtest A/B: precision weighting beats the binary gate on noisy sparse windows", () => {
  const samples: EvalSample[] = [];
  for (let i = 1; i <= 24; i++) {
    const signal = i / 1000; // true rate, monotonic
    const noise = ((i * 7) % 13) / 1000; // non-monotonic, uncorrelated
    samples.push({
      nextEfficiency: signal,
      snapshot: {
        id: `a${i}`,
        status: "active",
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
  const prec = backtestPredictiveness(samples, { toggles: { precisionWeighting: true } }).overall.composite;
  expect(prec).toBeGreaterThan(base);
});

test("reallocate shrinkage pulls a lucky low-volume ad set toward the cohort mean", () => {
  const big: AdSetSnapshot = { id: "big", status: "active", currentBudget: 500, ageDays: 60, windows: { d3: w(3000, 75), d7: w(7000, 175), d14: w(20000, 500) } }; // rate ~0.025, 500 events
  const tiny: AdSetSnapshot = { id: "tiny", status: "active", currentBudget: 50, ageDays: 60, windows: { d3: w(3, 0.3), d7: w(7, 0.7), d14: w(20, 2) } }; // lucky rate 0.1, only 2 events
  const off = reallocate([big, tiny], 1000, { toggles: { shrinkage: false } });
  const on = reallocate([big, tiny], 1000, { toggles: { shrinkage: true } });
  const tinyOff = off.items.find((i) => i.id === "tiny")!.compositeScore;
  const tinyOn = on.items.find((i) => i.id === "tiny")!.compositeScore;
  expect(tinyOn).toBeLessThan(tinyOff); // shrunk down toward the (big-dominated) cohort mean
  const bigOff = off.items.find((i) => i.id === "big")!.compositeScore;
  const bigOn = on.items.find((i) => i.id === "big")!.compositeScore;
  expect(Math.abs(bigOn - bigOff) / bigOff).toBeLessThan(0.1); // high-volume barely moves
});

test("reallocate attaches a CPA confidence interval per item", () => {
  const s: AdSetSnapshot = { id: "x", status: "active", currentBudget: 100, ageDays: 30, windows: { d3: w(1200, 30), d7: w(4000, 100), d14: w(8000, 200) } };
  const ci = reallocate([s], 1000).items[0].ci!;
  expect(Math.round(ci.cpa)).toBe(40); // 8000 / 200
  expect(ci.events).toBe(200);
  expect(ci.lo).toBeLessThan(ci.cpa);
  expect(ci.hi).toBeGreaterThan(ci.cpa);
});
