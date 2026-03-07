import { describe, expect, it } from "bun:test";

import {
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
