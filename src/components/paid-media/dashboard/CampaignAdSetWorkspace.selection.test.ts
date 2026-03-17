import { describe, expect, it } from "bun:test";

import {
  buildAggregatedMetricsContext,
  normalizeCompareSelection,
  toHourlySliceSeconds,
} from "./CampaignAdSetWorkspace";

describe("normalizeCompareSelection", () => {
  it("seeds with first index when selection starts empty in all mode", () => {
    const result = normalizeCompareSelection({
      currentKeys: [],
      availableKeys: new Set(["index:i1", "campaign:c1", "campaign:c2"]),
      allKeys: ["index:i1", "campaign:c1", "campaign:c2"],
      selectedCampaignIndexId: "all",
      seeded: false,
    });

    expect(result.seeded).toBe(true);
    expect(result.nextKeys).toEqual(["index:i1"]);
  });

  it("seeds with selected index when index scope is explicitly selected", () => {
    const result = normalizeCompareSelection({
      currentKeys: [],
      availableKeys: new Set(["index:i1", "index:i2", "campaign:c1"]),
      allKeys: ["index:i1", "index:i2", "campaign:c1"],
      selectedCampaignIndexId: "i2",
      seeded: false,
    });

    expect(result.seeded).toBe(true);
    expect(result.nextKeys).toEqual(["index:i2"]);
  });

  it("prunes invalid keys after seed", () => {
    const result = normalizeCompareSelection({
      currentKeys: ["index:i1", "campaign:c1", "campaign:missing"],
      availableKeys: new Set(["index:i1", "campaign:c1"]),
      allKeys: ["index:i1", "campaign:c1"],
      selectedCampaignIndexId: "all",
      seeded: true,
    });

    expect(result.seeded).toBe(true);
    expect(result.nextKeys).toEqual(["index:i1", "campaign:c1"]);
  });

  it("falls back to first campaign when no index exists", () => {
    const result = normalizeCompareSelection({
      currentKeys: [],
      availableKeys: new Set(["campaign:c1", "campaign:c2"]),
      allKeys: ["campaign:c1", "campaign:c2"],
      selectedCampaignIndexId: "all",
      seeded: false,
    });

    expect(result.seeded).toBe(true);
    expect(result.nextKeys).toEqual(["campaign:c1"]);
  });

  it("preserves intentionally empty selection after seed", () => {
    const result = normalizeCompareSelection({
      currentKeys: [],
      availableKeys: new Set(["index:i1", "campaign:c1"]),
      allKeys: ["index:i1", "campaign:c1"],
      selectedCampaignIndexId: "all",
      seeded: true,
    });

    expect(result.seeded).toBe(true);
    expect(result.nextKeys).toEqual([]);
  });
});

describe("toHourlySliceSeconds", () => {
  it("maps hourly slices to seconds", () => {
    expect(toHourlySliceSeconds(6)).toBe(21600);
    expect(toHourlySliceSeconds(24)).toBe(86400);
    expect(toHourlySliceSeconds(48)).toBe(172800);
  });

  it("returns null for all", () => {
    expect(toHourlySliceSeconds("all")).toBeNull();
  });
});

describe("buildAggregatedMetricsContext", () => {
  it("aggregates metrics, comparison, and trends across selected entities", () => {
    const aggregate = buildAggregatedMetricsContext([
      {
        metrics: {
          spend: 100,
          roas: 2,
          ctr: 1.2,
          cpc: 1.5,
          cpa: 8.3,
          impressions: 1000,
          clicks: 120,
        },
        comparison: {
          spend: { current: 100, previous: 80, percentageChange: 25 },
        },
        trends: [{ date: "2026-01-01", spend: 100, roas: 2, ctr_pct: 1.2, cpc: 1.5, cpa: 8.3, impressions: 1000, clicks: 120 }],
      },
      {
        metrics: {
          spend: 300,
          roas: 4,
          ctr: 2.4,
          cpc: 3.5,
          cpa: 12.5,
          impressions: 3000,
          clicks: 240,
        },
        comparison: {
          spend: { current: 300, previous: 240, percentageChange: 25 },
        },
        trends: [{ date: "2026-01-01", spend: 300, roas: 4, ctr_pct: 2.4, cpc: 3.5, cpa: 12.5, impressions: 3000, clicks: 240 }],
      },
    ]);

    expect(aggregate).toBeDefined();
    expect(aggregate?.metrics.spend).toBe(200);
    expect(aggregate?.metrics.roas).toBe(3);
    expect(aggregate?.comparison.spend?.percentageChange).toBe(25);
    expect(aggregate?.trends).toHaveLength(1);
    expect(aggregate?.trends[0]?.spend).toBe(200);
    expect(aggregate?.trends[0]?.impressions).toBe(2000);
  });

  it("returns undefined when selection is empty", () => {
    expect(buildAggregatedMetricsContext([])).toBeUndefined();
  });
});
