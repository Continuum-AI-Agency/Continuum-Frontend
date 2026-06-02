import { describe, expect, it } from "vitest";
import { mediaSearchRequestSchema } from "@continuum/contracts";

describe("mediaSearchRequestSchema", () => {
  it("accepts a valid text mode request", () => {
    const result = mediaSearchRequestSchema.safeParse({
      brandId: "brand-1",
      mode: "text",
      query: "sunset landscape",
      limit: 24,
      threshold: 0.2,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid similar mode request", () => {
    const result = mediaSearchRequestSchema.safeParse({
      brandId: "brand-1",
      mode: "similar",
      similarToAssetId: "asset-abc",
      limit: 6,
      threshold: 0.15,
    });
    expect(result.success).toBe(true);
  });

  it("rejects text mode without query", () => {
    const result = mediaSearchRequestSchema.safeParse({
      brandId: "brand-1",
      mode: "text",
      limit: 24,
    });
    expect(result.success).toBe(false);
  });

  it("rejects similar mode without similarToAssetId", () => {
    const result = mediaSearchRequestSchema.safeParse({
      brandId: "brand-1",
      mode: "similar",
      limit: 6,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing brandId", () => {
    const result = mediaSearchRequestSchema.safeParse({
      mode: "text",
      query: "cats",
    });
    expect(result.success).toBe(false);
  });

  it("applies default limit and threshold when not provided", () => {
    const result = mediaSearchRequestSchema.safeParse({
      brandId: "brand-1",
      mode: "text",
      query: "dogs",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(24);
      expect(result.data.threshold).toBe(0.2);
    }
  });
});
