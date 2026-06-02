import { describe, expect, it } from "vitest";

import {
  DEFAULT_REEL_VIDEO_BATCH_MAX,
  reelVideoBatchFrameSchema,
  reelVideoBatchRequestSchema,
} from "./reel-video";

describe("reelVideoBatchRequestSchema", () => {
  it("accepts a brand + non-empty draftIds list", () => {
    const parsed = reelVideoBatchRequestSchema.parse({
      brandId: "brand_1",
      draftIds: ["d1", "d2"],
    });
    expect(parsed.draftIds).toHaveLength(2);
  });

  it("rejects an empty draftIds list", () => {
    expect(
      reelVideoBatchRequestSchema.safeParse({ brandId: "b", draftIds: [] }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      reelVideoBatchRequestSchema.safeParse({
        brandId: "b",
        draftIds: ["d1"],
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("exposes a sane default batch cap", () => {
    expect(DEFAULT_REEL_VIDEO_BATCH_MAX).toBe(5);
  });
});

describe("reelVideoBatchFrameSchema", () => {
  it("round-trips every frame variant", () => {
    const frames = [
      { type: "batch_started", total: 3 },
      { type: "reel_started", draftId: "d1" },
      { type: "reel_progress", draftId: "d1", stage: "generating_scenes", message: "scene 2/3" },
      {
        type: "reel_ready",
        draftId: "d1",
        mp4Url: "https://signed/url.mp4",
        mp4Path: "organic/brand/d1.mp4",
        mp4Bucket: "organic-reels",
        durationSec: 18,
      },
      { type: "reel_failed", draftId: "d2", error: "veo_timeout" },
      { type: "batch_completed", ready: 2, failed: 1 },
    ] as const;

    for (const frame of frames) {
      expect(reelVideoBatchFrameSchema.safeParse(frame).success).toBe(true);
    }
  });

  it("rejects an unknown stage", () => {
    expect(
      reelVideoBatchFrameSchema.safeParse({
        type: "reel_progress",
        draftId: "d1",
        stage: "uploading",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown frame type", () => {
    expect(
      reelVideoBatchFrameSchema.safeParse({ type: "reel_paused", draftId: "d1" }).success,
    ).toBe(false);
  });
});
