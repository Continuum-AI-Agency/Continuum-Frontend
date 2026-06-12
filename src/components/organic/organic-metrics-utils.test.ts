import { describe, expect, it } from "bun:test";

import type { OrganicPost } from "@/lib/schemas/organicMetrics";
import {
  calculateHookRate,
  filterPostsByYoutubeType,
  formatWatchTime,
  isYouTubeShort,
  post24hComparisons,
  summarizeYoutubeTypeMetrics,
} from "./organic-metrics-utils";

function reel(metrics: OrganicPost["metrics"]): OrganicPost {
  return { id: "r1", mediaProductType: "REELS", metrics } as OrganicPost;
}

describe("calculateHookRate", () => {
  it("returns the native edge-provided hookRate (100 - reels_skip_rate)", () => {
    expect(calculateHookRate(reel({ hookRate: 72 }))).toBe(72);
  });

  it("does NOT derive a watch-time proxy — native skip rate only", () => {
    expect(calculateHookRate(reel({ reelsAvgWatchTime: 1500 }))).toBeUndefined();
    expect(calculateHookRate(reel({ reelsAvgWatchTime: 9000 }))).toBeUndefined();
  });

  it("is undefined for non-reels and for reels without a hook rate", () => {
    expect(calculateHookRate({ id: "p", mediaType: "IMAGE", metrics: {} } as OrganicPost)).toBeUndefined();
    expect(calculateHookRate(reel({}))).toBeUndefined();
  });
});

describe("formatWatchTime", () => {
  it("formats sub-minute as seconds", () => {
    expect(formatWatchTime(4200)).toBe("4.2s");
  });

  it("formats minutes and hours", () => {
    expect(formatWatchTime(90_000)).toBe("1m 30s");
    expect(formatWatchTime(5_000_000)).toBe("1h 23m");
  });

  it("returns a dash for missing/zero", () => {
    expect(formatWatchTime(0)).toBe("-");
    expect(formatWatchTime(undefined)).toBe("-");
  });
});

describe("post24hComparisons day-over-day deltas", () => {
  const post: OrganicPost = {
    id: "p1",
    breakdown7d: [
      { date: "2020-01-01", reach: 100, views: 200, engagement: 10, comments: 2, likes: 8, shares: 1, saved: 3 },
      { date: "2020-01-02", reach: 150, views: 260, engagement: 16, comments: 3, likes: 12, shares: 2, saved: 5 },
    ],
  } as OrganicPost;

  it("computes comparisons for the charted metrics", () => {
    const deltas = post24hComparisons(post);
    expect(deltas.reach).toEqual({ current: 150, previous: 100, percentageChange: 50 });
    expect(deltas.views?.current).toBe(260);
  });

  it("also computes likes / shares / saved deltas from the snapshot points", () => {
    const deltas = post24hComparisons(post);
    expect(deltas.likes).toEqual({ current: 12, previous: 8, percentageChange: 50 });
    expect(deltas.shares).toEqual({ current: 2, previous: 1, percentageChange: 100 });
    expect(deltas.saved).toEqual({ current: 5, previous: 3, percentageChange: 66.7 });
  });

  it("returns nothing without at least two snapshots", () => {
    expect(post24hComparisons({ id: "x", breakdown7d: [{ date: "2020-01-01", views: 1 }] } as OrganicPost)).toEqual({});
  });
});

function yt(id: string, mediaProductType: string, metrics?: OrganicPost["metrics"]): OrganicPost {
  return { id, mediaType: "VIDEO", mediaProductType, metrics } as OrganicPost;
}

describe("isYouTubeShort", () => {
  it("is true only when mediaProductType is SHORTS (case-insensitive)", () => {
    expect(isYouTubeShort(yt("a", "SHORTS"))).toBe(true);
    expect(isYouTubeShort(yt("b", "shorts"))).toBe(true);
    expect(isYouTubeShort(yt("c", "VIDEO"))).toBe(false);
    expect(isYouTubeShort({ id: "d", metrics: {} } as OrganicPost)).toBe(false);
  });
});

describe("filterPostsByYoutubeType", () => {
  const posts = [yt("s1", "SHORTS"), yt("v1", "VIDEO"), yt("s2", "SHORTS")];

  it("returns every post for the 'all' filter", () => {
    expect(filterPostsByYoutubeType(posts, "all")).toHaveLength(3);
  });

  it("narrows to Shorts only", () => {
    expect(filterPostsByYoutubeType(posts, "shorts").map((p) => p.id)).toEqual(["s1", "s2"]);
  });

  it("narrows to Videos only", () => {
    expect(filterPostsByYoutubeType(posts, "videos").map((p) => p.id)).toEqual(["v1"]);
  });
});

describe("summarizeYoutubeTypeMetrics", () => {
  it("sums counts/views/likes/comments and averages only present hook rates", () => {
    const posts = [
      yt("s1", "SHORTS", { views: 1000, likes: 100, comments: 10, hookRate: 80 }),
      yt("s2", "SHORTS", { views: 500, likes: 50, comments: 5, hookRate: 60 }),
      yt("s3", "SHORTS", { views: 200, likes: 20, comments: 2 }),
    ];
    expect(summarizeYoutubeTypeMetrics(posts)).toEqual({
      count: 3,
      views: 1700,
      likes: 170,
      comments: 17,
      avgHookRate: 70,
    });
  });

  it("reports undefined avgHookRate when no post carries one", () => {
    expect(summarizeYoutubeTypeMetrics([yt("v1", "VIDEO", { views: 10 })]).avgHookRate).toBeUndefined();
  });

  it("zeroes an empty set", () => {
    expect(summarizeYoutubeTypeMetrics([])).toEqual({
      count: 0,
      views: 0,
      likes: 0,
      comments: 0,
      avgHookRate: undefined,
    });
  });
});
