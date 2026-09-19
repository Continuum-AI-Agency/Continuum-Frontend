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

test("objective predictiveness is disclosed beside the score, never multiplied into it", () => {
  const lo = confidenceOf(strong, resolveConfig({ predictiveness: 0.45 }));
  const hi = confidenceOf(strong, resolveConfig({ predictiveness: 0.9 }));
  expect(hi.score).toBeCloseTo(lo.score, 10);
  expect(lo.predictiveness).toBeCloseTo(0.45);
  expect(hi.predictiveness).toBeCloseTo(0.9);
});

test("a well-fed, consistent portfolio reaches the top of the scale on any objective", () => {
  // 786 conversions over 14d, windows agreeing: the screenshot case. It read 'Low 28%'
  // because the lead prior (0.45) capped the product; data confidence must not.
  const fed: AdSetSnapshot = {
    ...strong,
    windows: { d3: w(4200, 170), d7: w(9800, 395), d14: w(19600, 786) },
  };
  const c = confidenceOf(fed, resolveConfig({ objective: "purchase", predictiveness: 0.45 }));
  expect(c.sampleSize).toBeGreaterThan(0.97);
  expect(c.score).toBeGreaterThan(0.9);
  expect(c.band).toBe("high");
  expect(c.underFloor.adsetIds).toEqual([]);
});

test("portfolioConfidence names the ad sets under the floor and what fixing them would leave", () => {
  const big: AdSetSnapshot = { ...strong, id: "big" };
  const thin: AdSetSnapshot = {
    id: "thin", status: "active", currentBudget: 10, ageDays: 40,
    windows: { d3: w(400, 1), d7: w(900, 2), d14: w(2000, 3) },
  };
  const c = portfolioConfidence([big, thin], PURCHASE);
  expect(c.underFloor).toEqual({ adsetIds: ["thin"], floorEvents: 20 });
  const floor = c.actionables.find((a) => a.code === "under_event_floor");
  expect(floor?.adsetIds).toEqual(["thin"]);
  expect(floor?.spendShare).toBeCloseTo(2000 / 10000, 5);
  expect(floor?.projectedScore).toBeGreaterThan(c.score);
  expect(floor?.message).toContain("1 of 2 ad sets are under the 20-event floor");
});

test("an ad set spending past a target CPA with zero events is flagged as a tracking gap", () => {
  const dark: AdSetSnapshot = {
    id: "dark", status: "active", currentBudget: 50, ageDays: 40,
    windows: { d3: w(100, 0), d7: w(300, 0), d14: w(700, 0) },
  };
  const c = portfolioConfidence([strong, dark], PURCHASE);
  const gap = c.actionables.find((a) => a.code === "tracking_gap");
  expect(gap?.adsetIds).toEqual(["dark"]);
  expect(gap?.message).toContain("pixel / CAPI");
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
