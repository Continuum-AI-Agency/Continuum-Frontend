import { describe, expect, it } from "bun:test";

import type { OrganicMetrics, OrganicPost, OrganicTrendPoint } from "@/lib/schemas/organicMetrics";
import {
  buildOrganicReportCsv,
  countPostsWithoutInsights,
  summarizeReelsWatchTime,
} from "./organic-report-utils";

const accountMetrics: OrganicMetrics = { reach: 1000, views: 5000 };

const trends: OrganicTrendPoint[] = [
  { date: "2026-06-02", reach: 100, views: 400, reelsViews: 200, comments: 5 },
  { date: "2026-06-03", reach: 120, views: 420, reelsViews: 210, comments: 6 },
];

function reel(id: string, metrics: OrganicPost["metrics"], timestamp: string): OrganicPost {
  return { id, mediaProductType: "REELS", timestamp, metrics } as OrganicPost;
}

describe("buildOrganicReportCsv", () => {
  it("renders an account 7-day daily breakdown from trends", () => {
    const csv = buildOrganicReportCsv({
      platform: "instagram",
      accountName: "Acme",
      generatedAt: "2026-06-09",
      accountRangeSince: "2026-05-10",
      accountRangeUntil: "2026-06-09",
      accountMetrics,
      posts: [],
      trends,
    });
    expect(csv).toContain("Account 7-Day Daily Breakdown");
    expect(csv).toContain("2026-06-02");
    expect(csv).toContain("Avg Watch Time (s)");
  });

  it("writes watch-time seconds for a reel row", () => {
    const csv = buildOrganicReportCsv({
      platform: "instagram",
      accountName: "Acme",
      generatedAt: "2026-06-09",
      accountRangeSince: "2026-05-10",
      accountRangeUntil: "2026-06-09",
      accountMetrics,
      posts: [reel("r1", { reach: 10, views: 50, reelsAvgWatchTime: 4200, reelsVideoViewTotalTime: 600000 }, "2026-06-08T00:00:00Z")],
    });
    // 4200ms -> 4s, 600000ms -> 600s
    expect(csv).toContain(",4,600,");
  });

  it("reports a footer count of posts with no insights", () => {
    const csv = buildOrganicReportCsv({
      platform: "instagram",
      accountName: "Acme",
      generatedAt: "2026-06-09",
      accountRangeSince: "2026-05-10",
      accountRangeUntil: "2026-06-09",
      accountMetrics,
      posts: [reel("z1", { reach: 0, views: 0 }, "2026-06-08T00:00:00Z")],
    });
    expect(csv).toContain("Posts with no insights available,1");
  });
});

describe("summarizeReelsWatchTime", () => {
  it("sums total and averages avg watch time for reels in the last 7 days", () => {
    const now = new Date("2026-06-09T00:00:00Z");
    const summary = summarizeReelsWatchTime(
      [
        reel("a", { reelsAvgWatchTime: 4000, reelsVideoViewTotalTime: 100000 }, "2026-06-08T00:00:00Z"),
        reel("b", { reelsAvgWatchTime: 2000, reelsVideoViewTotalTime: 50000 }, "2026-06-07T00:00:00Z"),
        reel("old", { reelsAvgWatchTime: 9000, reelsVideoViewTotalTime: 999999 }, "2026-01-01T00:00:00Z"),
      ],
      now,
    );
    expect(summary.count).toBe(2);
    expect(summary.totalWatchMs).toBe(150000);
    expect(summary.avgWatchMs).toBe(3000);
  });
});

describe("countPostsWithoutInsights", () => {
  it("counts only all-zero posts", () => {
    const posts = [
      reel("good", { reach: 100, views: 200 }, "2026-06-08T00:00:00Z"),
      reel("empty", { reach: 0, views: 0 }, "2026-06-08T00:00:00Z"),
    ];
    expect(countPostsWithoutInsights(posts)).toBe(1);
  });
});
