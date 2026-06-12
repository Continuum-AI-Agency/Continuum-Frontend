import { describe, expect, it } from "bun:test";

import { normalizeInstagramOrganicMetricsResponse } from "./normalize";

describe("normalizeInstagramOrganicMetricsResponse", () => {
  it("preserves daily trends from backend organic metrics responses", () => {
    const normalized = normalizeInstagramOrganicMetricsResponse({
      platform: "instagram",
      accountId: "17841456625921306",
      range: { preset: "last_7d", since: "2026-06-05", until: "2026-06-12" },
      metrics: {
        newFollowers: 8,
        reach: 1402,
        views: 6278,
        accountsEngaged: 90,
        reelsViews: 1497,
        postViews: 2973,
        storiesViews: 1808,
        profileVisitsYesterday: 12,
        nonFollowerReach: 469,
        followerReach: 932,
      },
      comparison: {
        views: { current: 6278, previous: 7440, pctChange: -16 },
      },
      trends: [
        { date: "2026-06-05", views: 950, reach: 210 },
        { date: "2026-06-06", views: 880, reach: 190 },
      ],
    });

    expect(normalized.comparison?.views?.percentageChange).toBe(-16);
    expect(normalized.trends).toEqual([
      { date: "2026-06-05", views: 950, reach: 210 },
      { date: "2026-06-06", views: 880, reach: 190 },
    ]);
  });
});
