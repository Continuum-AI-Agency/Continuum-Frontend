import { describe, expect, it } from "bun:test";

import { filterAndSortCreatives, nearestAspectLabel } from "./filterAndSortCreatives";
import type { CreativeAd, CreativeAdMetrics, CreativeGalleryFilters } from "./types";

function makeMetrics(overrides: Partial<CreativeAdMetrics> = {}): CreativeAdMetrics {
  return {
    spend: 0,
    roas: 0,
    ctr: 0,
    cpc: 0,
    cpa: 0,
    impressions: 0,
    clicks: 0,
    ...overrides,
  };
}

function makeAd(overrides: Partial<CreativeAd> = {}): CreativeAd {
  return {
    id: overrides.id ?? "ad-1",
    name: overrides.name ?? "Ad One",
    status: overrides.status ?? "ACTIVE",
    effectiveStatus: overrides.effectiveStatus,
    metrics: overrides.metrics ?? makeMetrics(),
    creative: overrides.creative,
    ...overrides,
  };
}

function makeFilters(overrides: Partial<CreativeGalleryFilters> = {}): CreativeGalleryFilters {
  return {
    query: "",
    sortKey: "spend",
    statusFilter: "all",
    selectedOnly: false,
    selectedIds: new Set<string>(),
    ...overrides,
  };
}

describe("filterAndSortCreatives", () => {
  it("returns all ads sorted by the default metric descending when no query", () => {
    const ads = [
      makeAd({ id: "a", metrics: makeMetrics({ spend: 10 }) }),
      makeAd({ id: "b", metrics: makeMetrics({ spend: 30 }) }),
      makeAd({ id: "c", metrics: makeMetrics({ spend: 20 }) }),
    ];

    const result = filterAndSortCreatives(ads, makeFilters({ sortKey: "spend" }));

    expect(result.map((ad) => ad.id)).toEqual(["b", "c", "a"]);
  });

  it("matches the query case-insensitively over name, creative.title and creative.body", () => {
    const ads = [
      makeAd({ id: "name", name: "Summer SALE hero" }),
      makeAd({ id: "title", name: "x", creative: { id: "c1", title: "Big Discount Title" } }),
      makeAd({ id: "body", name: "y", creative: { id: "c2", body: "Limited body offer" } }),
      makeAd({ id: "none", name: "z" }),
    ];

    expect(filterAndSortCreatives(ads, makeFilters({ query: "sale" })).map((a) => a.id)).toEqual([
      "name",
    ]);
    expect(filterAndSortCreatives(ads, makeFilters({ query: "DISCOUNT" })).map((a) => a.id)).toEqual([
      "title",
    ]);
    expect(filterAndSortCreatives(ads, makeFilters({ query: "offer" })).map((a) => a.id)).toEqual([
      "body",
    ]);
  });

  it("filters by status using effectiveStatus then status", () => {
    const ads = [
      makeAd({ id: "active", effectiveStatus: "ACTIVE", status: "PAUSED" }),
      makeAd({ id: "paused", effectiveStatus: "PAUSED", status: "ACTIVE" }),
      makeAd({ id: "fallback-active", effectiveStatus: undefined, status: "ACTIVE" }),
    ];

    expect(
      filterAndSortCreatives(ads, makeFilters({ statusFilter: "active" }))
        .map((a) => a.id)
        .sort()
    ).toEqual(["active", "fallback-active"]);
    expect(filterAndSortCreatives(ads, makeFilters({ statusFilter: "paused" })).map((a) => a.id)).toEqual([
      "paused",
    ]);
  });

  it("keeps only selected ads when selectedOnly is set", () => {
    const ads = [makeAd({ id: "a" }), makeAd({ id: "b" }), makeAd({ id: "c" })];

    const result = filterAndSortCreatives(
      ads,
      makeFilters({ selectedOnly: true, selectedIds: new Set(["a", "c"]) })
    );

    expect(result.map((a) => a.id).sort()).toEqual(["a", "c"]);
  });

  it("sorts metric keys descending and name ascending", () => {
    const ads = [
      makeAd({ id: "low", name: "Zebra", metrics: makeMetrics({ roas: 1, ctr: 5, clicks: 100 }) }),
      makeAd({ id: "high", name: "Apple", metrics: makeMetrics({ roas: 9, ctr: 1, clicks: 5 }) }),
    ];

    expect(filterAndSortCreatives(ads, makeFilters({ sortKey: "roas" })).map((a) => a.id)).toEqual([
      "high",
      "low",
    ]);
    expect(filterAndSortCreatives(ads, makeFilters({ sortKey: "ctr" })).map((a) => a.id)).toEqual([
      "low",
      "high",
    ]);
    expect(filterAndSortCreatives(ads, makeFilters({ sortKey: "clicks" })).map((a) => a.id)).toEqual([
      "low",
      "high",
    ]);
    expect(filterAndSortCreatives(ads, makeFilters({ sortKey: "name" })).map((a) => a.id)).toEqual([
      "high",
      "low",
    ]);
  });

  it("treats missing metrics as zero without throwing", () => {
    const ads = [
      makeAd({ id: "withMetric", metrics: makeMetrics({ spend: 5 }) }),
      makeAd({ id: "noMetric", metrics: null }),
    ];

    const result = filterAndSortCreatives(ads, makeFilters({ sortKey: "spend" }));

    expect(result.map((a) => a.id)).toEqual(["withMetric", "noMetric"]);
  });

  it("does not mutate the input array", () => {
    const ads = [
      makeAd({ id: "a", metrics: makeMetrics({ spend: 1 }) }),
      makeAd({ id: "b", metrics: makeMetrics({ spend: 2 }) }),
    ];
    const snapshot = ads.map((a) => a.id);

    filterAndSortCreatives(ads, makeFilters({ sortKey: "spend" }));

    expect(ads.map((a) => a.id)).toEqual(snapshot);
  });
});

describe("nearestAspectLabel", () => {
  it("snaps natural dimensions to the nearest known label", () => {
    expect(nearestAspectLabel(1080, 1920)).toBe("9:16");
    expect(nearestAspectLabel(1080, 1080)).toBe("1:1");
    expect(nearestAspectLabel(1080, 1350)).toBe("4:5");
    expect(nearestAspectLabel(1200, 628)).toBe("16:9");
    expect(nearestAspectLabel(1200, 900)).toBe("4:3");
  });

  it("returns null for invalid dimensions", () => {
    expect(nearestAspectLabel(0, 100)).toBeNull();
    expect(nearestAspectLabel(100, 0)).toBeNull();
  });
});
