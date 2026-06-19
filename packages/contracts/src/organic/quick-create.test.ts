import { describe, expect, it } from "bun:test";

import {
  quickCreatePostRequestSchema,
  quickCreatePostResponseSchema,
} from "./quick-create";

const validCreativeRef = {
  assetId: "asset-1",
  bucket: "media-library",
  storagePath: "brand-1/asset-1/photo.jpg",
  kind: "image" as const,
  mimeType: "image/jpeg",
};

describe("quickCreatePostRequestSchema", () => {
  it("accepts a minimal request and applies array defaults", () => {
    const parsed = quickCreatePostRequestSchema.safeParse({
      brandId: "brand-1",
      angle: "Back-to-school savings hook",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.trendIds).toEqual([]);
      expect(parsed.data.userSuppliedMedia).toEqual([]);
    }
  });

  it("rejects an empty angle", () => {
    const parsed = quickCreatePostRequestSchema.safeParse({
      brandId: "brand-1",
      angle: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a missing brandId", () => {
    const parsed = quickCreatePostRequestSchema.safeParse({ angle: "hook" });
    expect(parsed.success).toBe(false);
  });

  it("accepts multiple trendIds and creative refs", () => {
    const parsed = quickCreatePostRequestSchema.safeParse({
      brandId: "brand-1",
      angle: "carousel concept",
      trendIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      userSuppliedMedia: [validCreativeRef, { ...validCreativeRef, assetId: "asset-2" }],
      format: "carousel",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.trendIds).toHaveLength(2);
      expect(parsed.data.userSuppliedMedia).toHaveLength(2);
    }
  });

  it("rejects a non-uuid trendId", () => {
    const parsed = quickCreatePostRequestSchema.safeParse({
      brandId: "brand-1",
      angle: "hook",
      trendIds: ["not-a-uuid"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects hyperframe as a requested format", () => {
    const parsed = quickCreatePostRequestSchema.safeParse({
      brandId: "brand-1",
      angle: "hook",
      format: "hyperframe",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown keys (strict boundary)", () => {
    const parsed = quickCreatePostRequestSchema.safeParse({
      brandId: "brand-1",
      angle: "hook",
      somethingExtra: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("quickCreatePostResponseSchema", () => {
  it("accepts a queued response", () => {
    const parsed = quickCreatePostResponseSchema.safeParse({
      status: "queued",
      jobId: "job-1",
      planId: "plan-1",
      planItemId: "item-1",
      platform: "instagram",
      scheduledAt: "2026-06-20T12:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-queued status", () => {
    const parsed = quickCreatePostResponseSchema.safeParse({
      status: "error",
      jobId: "job-1",
      planId: "plan-1",
      planItemId: "item-1",
      platform: "instagram",
      scheduledAt: "2026-06-20T12:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });
});
