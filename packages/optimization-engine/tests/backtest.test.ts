// Backtest harness tests (bun test).
import { test, expect } from "bun:test";

import { spearman, backtestPredictiveness, buildEvalSamples } from "../src/index";
import type { AdSetSeries, EvalSample } from "../src/index";

const approx = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b) <= tol).toBe(true);

test("spearman: perfect monotonic relations", () => {
  approx(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  approx(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
});

test("spearman: degenerate inputs return 0", () => {
  expect(spearman([1, 2], [1, 2])).toBe(0); // < 3 points
  expect(spearman([5, 5, 5], [1, 2, 3])).toBe(0); // zero variance
});

test("spearman: handles non-linear monotonic + ties", () => {
  // monotonic but non-linear -> Spearman 1 (rank-based)
  approx(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25]), 1);
});

// Snapshot whose windows all encode the same per-$ rate `r`; next efficiency == r.
function sample(r: number, nextEff: number): EvalSample {
  const w = (rate: number) => ({ spend: 100, purchases: rate * 100, addToCarts: 0, clicks: 0, impressions: 0 });
  return {
    snapshot: { id: "x", status: "active", currentBudget: 0, ageDays: 30, windows: { d3: w(r), d7: w(r), d14: w(r) } },
    nextEfficiency: nextEff,
  };
}

test("backtest: a perfectly predictive score scores ~1", () => {
  const samples = Array.from({ length: 20 }, (_, i) => sample((i + 1) / 1000, (i + 1) / 1000));
  const rep = backtestPredictiveness(samples);
  approx(rep.overall.composite, 1);
  approx(rep.overall.perWindow.d7, 1);
  expect(rep.overall.n).toBe(20);
});

test("backtest: an anti-predictive score scores negative", () => {
  const samples = Array.from({ length: 20 }, (_, i) => sample((i + 1) / 1000, (20 - i) / 1000));
  expect(backtestPredictiveness(samples).overall.composite).toBeLessThan(0);
});

test("backtest: groups by objective (KPI field per objective)", () => {
  const winP = (r: number) => ({ spend: 100, purchases: r * 100, addToCarts: 0, clicks: 0, impressions: 0 });
  const winA = (r: number) => ({ spend: 100, purchases: 0, appInstalls: r * 100, addToCarts: 0, clicks: 0, impressions: 0 });
  const mk = (win: (r: number) => ReturnType<typeof winP>, r: number, nextEff: number, objective: "purchase" | "app_install"): EvalSample => ({
    objective,
    nextEfficiency: nextEff,
    snapshot: { id: "x", status: "active", currentBudget: 0, ageDays: 30, windows: { d3: win(r), d7: win(r), d14: win(r) } },
  });
  const a = Array.from({ length: 10 }, (_, i) => mk(winP, (i + 1) / 1000, (i + 1) / 1000, "purchase"));
  const b = Array.from({ length: 10 }, (_, i) => mk(winA, (i + 1) / 1000, (10 - i) / 1000, "app_install"));
  const rep = backtestPredictiveness([...a, ...b]);
  expect(rep.byObjective.purchase.composite).toBeGreaterThan(0.9);
  expect(rep.byObjective.app_install.composite).toBeLessThan(0);
});

test("buildEvalSamples: windows + next-period efficiency from daily rows", () => {
  // 20 days, constant 10 events / $100 per day => every window rate = 0.1, nextEff = 0.1.
  const daily = Array.from({ length: 20 }, (_, day) => ({ day, spend: 100, events: 10 }));
  const series: AdSetSeries[] = [{ id: "as_1", objective: "purchase", daily }];
  const samples = buildEvalSamples(series, { stride: 3, nextDays: 3 });
  expect(samples.length).toBeGreaterThan(0);
  const s = samples[0];
  expect(s.snapshot.windows.d14.spend).toBe(1400); // 14 days * 100
  expect(s.snapshot.windows.d14.purchases).toBe(140);
  approx(s.nextEfficiency, 0.1);
});
