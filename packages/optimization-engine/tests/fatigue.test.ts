// Fatigue (creative / audience) recommendation tests (bun test).
import { test, expect } from "bun:test";

import { evaluateFatigue, runCycle, DEFAULT_CONFIG } from "../src/index";
import type { AdSetSnapshot, WindowMetrics } from "../src/index";

const w = (
  spend: number,
  purchases: number,
  clicks = 0,
  impressions = 0,
): WindowMetrics => ({ spend, purchases, addToCarts: 0, clicks, impressions });

// Base: still converting, but recent (3d) CPA well above the 14d baseline.
// 14d CPA = 4000/100 = $40; 3d CPA = 600/10 = $60 (+50%, > +20% drift).
const decaying = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: "x",
  status: "active",
  currentBudget: 100,
  ageDays: 40,
  windows: { d3: w(600, 10), d7: w(1800, 35), d14: w(4000, 100) },
  ...over,
});

test("F2 — high frequency + rising CPA => audience_expand", () => {
  const recs = evaluateFatigue([decaying({ audienceType: "prospecting", frequency7d: 4.0 })], DEFAULT_CONFIG);
  expect(recs.length).toBe(1);
  expect(recs[0].kind).toBe("audience_expand");
  expect(recs[0].trigger).toBe("F2_audience_saturation");
  expect(recs[0].needsApproval).toBe(true);
});

test("remarketing tolerates higher frequency before F2 fires", () => {
  // freq 4.0 is over the prospecting cap (3.0) but under the remarketing cap (5.0).
  const rmkt = evaluateFatigue([decaying({ audienceType: "remarketing", frequency7d: 4.0 })], DEFAULT_CONFIG);
  expect(rmkt.some((r) => r.trigger === "F2_audience_saturation")).toBe(false);
});

test("F1 — CTR decay + rising CPA (freq under cap) => creative_refresh", () => {
  // CTR: 14d 1000/40000 = 2.5%; 3d 80/8000 = 1.0% (-60%, > 25% drop). freq under cap.
  const s = decaying({
    audienceType: "prospecting",
    frequency7d: 1.8,
    windows: { d3: w(600, 10, 80, 8000), d7: w(1800, 35, 400, 18000), d14: w(4000, 100, 1000, 40000) },
  });
  const recs = evaluateFatigue([s], DEFAULT_CONFIG);
  expect(recs.length).toBe(1);
  expect(recs[0].kind).toBe("creative_refresh");
  expect(recs[0].trigger).toBe("F1_creative_fatigue");
});

test("healthy ad set (stable CPA, low freq) => no fatigue", () => {
  const healthy: AdSetSnapshot = {
    id: "ok", status: "active", currentBudget: 100, ageDays: 40, audienceType: "prospecting", frequency7d: 1.5,
    windows: { d3: w(400, 10, 200, 8000), d7: w(1400, 35), d14: w(4000, 100, 1000, 40000) }, // 3d CPA $40 == 14d $40
  };
  expect(evaluateFatigue([healthy], DEFAULT_CONFIG).length).toBe(0);
});

test("young ad set is never flagged", () => {
  const young = decaying({ ageDays: 4, frequency7d: 6.0, audienceType: "prospecting" });
  expect(evaluateFatigue([young], DEFAULT_CONFIG).length).toBe(0);
});

test("already-starved ad sets are skipped (no double-noise)", () => {
  const s = decaying({ id: "dup", audienceType: "prospecting", frequency7d: 6.0 });
  expect(evaluateFatigue([s], DEFAULT_CONFIG, new Set(["dup"])).length).toBe(0);
});

test("runCycle surfaces fatigue recommendations alongside pauses", () => {
  const res = runCycle([decaying({ id: "fat", audienceType: "prospecting", frequency7d: 4.0 })], { total: 100 });
  expect(res.recommendations.some((r) => r.kind === "audience_expand" && r.adSetId === "fat")).toBe(true);
});
