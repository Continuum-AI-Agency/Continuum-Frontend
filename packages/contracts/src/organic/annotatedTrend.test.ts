import { describe, expect, it } from "bun:test";

import { annotatePostActivityByDate } from "./annotatedTrend";

describe("annotatePostActivityByDate", () => {
  it("returns [] for empty/undefined input", () => {
    expect(annotatePostActivityByDate(undefined, undefined)).toEqual([]);
    expect(annotatePostActivityByDate([], [])).toEqual([]);
  });

  it("buckets multiple posts on the same day into one entry with a count", () => {
    const posts = [
      { id: "a", timestamp: "2026-06-30T14:00:00+0000" },
      { id: "b", timestamp: "2026-06-30T09:00:00+0000" },
    ];
    const result = annotatePostActivityByDate([], posts);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-06-30");
    expect(result[0].postCount).toBe(2);
    expect(result[0].publishedPosts).toHaveLength(2);
  });

  it("sorts each day's posts ascending by timestamp", () => {
    const posts = [
      { id: "late", timestamp: "2026-06-30T18:00:00+0000" },
      { id: "early", timestamp: "2026-06-30T06:00:00+0000" },
    ];
    const [day] = annotatePostActivityByDate([], posts);
    expect(day.publishedPosts.map((post) => post.id)).toEqual(["early", "late"]);
  });

  it("skips posts with a missing or malformed timestamp", () => {
    const posts = [
      { id: "ok", timestamp: "2026-06-30T06:00:00+0000" },
      { id: "no-ts" },
      { id: "bad-ts", timestamp: "not-a-date" },
    ];
    const result = annotatePostActivityByDate([], posts);
    expect(result).toHaveLength(1);
    expect(result[0].publishedPosts.map((post) => post.id)).toEqual(["ok"]);
  });

  it("seeds days from trends and attaches metrics, keeping zero-post days", () => {
    const trends = [
      { date: "2026-06-29", reach: 100, views: 250 },
      { date: "2026-06-30", reach: 140 },
    ];
    const posts = [{ id: "a", timestamp: "2026-06-30T10:00:00+0000" }];
    const result = annotatePostActivityByDate(trends, posts);
    expect(result.map((day) => day.date)).toEqual(["2026-06-29", "2026-06-30"]);
    expect(result[0].postCount).toBe(0);
    expect(result[0].metrics.reach).toBe(100);
    expect(result[0].metrics.views).toBe(250);
    expect(result[1].postCount).toBe(1);
  });

  it("returns days ascending by date across trends and posts", () => {
    const trends = [{ date: "2026-07-02", reach: 10 }];
    const posts = [
      { id: "a", timestamp: "2026-06-30T10:00:00+0000" },
      { id: "b", timestamp: "2026-07-01T10:00:00+0000" },
    ];
    const result = annotatePostActivityByDate(trends, posts);
    expect(result.map((day) => day.date)).toEqual(["2026-06-30", "2026-07-01", "2026-07-02"]);
  });

  it("derives the day's boostedAt from a boosted post when the trend omits it", () => {
    const posts = [
      { id: "a", timestamp: "2026-06-30T10:00:00+0000" },
      { id: "b", timestamp: "2026-06-30T12:00:00+0000", boostedAt: "2026-06-30T13:00:00+0000" },
    ];
    const [day] = annotatePostActivityByDate([], posts);
    expect(day.boostedAt).toBe("2026-06-30T13:00:00+0000");
  });

  it("normalizes a full ISO trend date down to the calendar day", () => {
    const trends = [{ date: "2026-06-30T00:00:00.000Z", reach: 5 }];
    const [day] = annotatePostActivityByDate(trends, []);
    expect(day.date).toBe("2026-06-30");
  });
});
