import { describe, expect, it } from "bun:test";

import type { OrganicPost } from "@/lib/schemas/organicMetrics";
import { calculateHookRate, formatWatchTime } from "./organic-metrics-utils";

function reel(metrics: OrganicPost["metrics"]): OrganicPost {
  return { id: "r1", mediaProductType: "REELS", metrics } as OrganicPost;
}

describe("calculateHookRate", () => {
  it("prefers the edge-provided hookRate when present", () => {
    expect(calculateHookRate(reel({ hookRate: 72 }))).toBe(72);
  });

  it("derives a watch-time proxy for reels (avg watch / 3s, clamped)", () => {
    expect(calculateHookRate(reel({ reelsAvgWatchTime: 1500 }))).toBe(50);
    expect(calculateHookRate(reel({ reelsAvgWatchTime: 3000 }))).toBe(100);
    expect(calculateHookRate(reel({ reelsAvgWatchTime: 9000 }))).toBe(100);
  });

  it("is undefined for non-reels and for reels without watch time", () => {
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
