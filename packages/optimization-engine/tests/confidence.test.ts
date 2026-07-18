// Confidence scoring tests (bun test).
import { test, expect } from "bun:test";

import { confidenceOf, portfolioConfidence, runCycle, resolveConfig } from "../src/index";
import type { AdSetSnapshot, WindowMetrics } from "../src/index";

const w = (spend: number, purchases: number): WindowMetrics => ({
  spend, purchases, addToCarts: 0, clicks: 0, impressions: 0,
});

const PURCHASE = resolveConfig({ objective: "purchase" }); // predictiveness 0.80

// Stable CPA ($40) across all windows, lots of conversions.
const strong: AdSetSnapshot = {
  id: "s", status: "active", currentBudget: 100, ageDays: 40,
  windows: { d3: w(1200, 30), d7: w(4000, 100), d14: w(8000, 200) },
};

test("strong signal (many events, stable CPA) => high confidence", () => {
  const c = confidenceOf(strong, PURCHASE);
  expect(c.band).toBe("high");
  expect(c.score).toBeGreaterThan(0.6);
  expect(c.consistency).toBeGreaterThan(0.95);
});

test("few events => low sample size => low confidence", () => {
  const thin: AdSetSnapshot = { ...strong, windows: { d3: w(40, 1), d7: w(80, 2), d14: w(120, 3) } };
  const c = confidenceOf(thin, PURCHASE);
  expect(c.sampleSize).toBeLessThan(0.2);
  expect(c.band).toBe("low");
});

test("inconsistent windows => lower consistency, lower score", () => {
  // per-$ scores zigzag: cpp 20 / 80 / 30
  const noisy: AdSetSnapshot = { ...strong, windows: { d3: w(2000, 100), d7: w(8000, 100), d14: w(6000, 200) } };
  const c = confidenceOf(noisy, PURCHASE);
  expect(c.consistency).toBeLessThan(0.7);
  expect(c.score).toBeLessThan(confidenceOf(strong, PURCHASE).score);
});

test("lower objective predictiveness scales confidence down", () => {
  const lo = confidenceOf(strong, resolveConfig({ predictiveness: 0.45 }));
  const hi = confidenceOf(strong, resolveConfig({ predictiveness: 0.9 }));
  expect(hi.score).toBeGreaterThan(lo.score);
  expect(lo.predictiveness).toBeCloseTo(0.45);
});

test("portfolioConfidence is spend-weighted (big ad set dominates)", () => {
  const big: AdSetSnapshot = { ...strong, id: "big" }; // d14 spend 8000
  const tiny: AdSetSnapshot = {
    id: "tiny", status: "active", currentBudget: 10, ageDays: 40,
    windows: { d3: w(20, 0), d7: w(40, 0), d14: w(60, 1) }, // d14 spend 60
  };
  const c = portfolioConfidence([big, tiny], PURCHASE);
  expect(Math.abs(c.score - confidenceOf(big, PURCHASE).score)).toBeLessThan(0.05);
  expect(c.events).toBe(201);
});

test("runCycle exposes spend-weighted confidence", () => {
  const res = runCycle([strong], { total: 100, objective: "purchase" });
  expect(res.confidence.band).toBe("high");
  expect(res.confidence.predictiveness).toBeCloseTo(0.8);
});
