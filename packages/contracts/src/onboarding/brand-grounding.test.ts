import { describe, expect, it } from "bun:test";

import {
  brandGroundingBundleSchema,
  groundingHitSchema,
} from "./brand-grounding";
import { deriveReadinessSummary } from "./readiness-summary";

describe("groundingHitSchema", () => {
  it("defaults similarity/ref/label to null so a lean hit still parses", () => {
    const parsed = groundingHitSchema.parse({
      source: "guideline",
      snippet: "Keep copy warm and direct.",
    });
    expect(parsed).toEqual({
      source: "guideline",
      snippet: "Keep copy warm and direct.",
      similarity: null,
      ref: null,
      label: null,
    });
  });

  it("rejects an unknown source", () => {
    expect(
      groundingHitSchema.safeParse({ source: "twitter", snippet: "x" }).success,
    ).toBe(false);
  });
});

describe("brandGroundingBundleSchema", () => {
  it("parses an empty bundle: nullable pieces null, arrays [], readiness a not_started summary", () => {
    const parsed = brandGroundingBundleSchema.parse({
      readiness: deriveReadinessSummary(null),
    });
    expect(parsed.tokens).toBeNull();
    expect(parsed.guidelines).toBeNull();
    expect(parsed.documents).toEqual([]);
    expect(parsed.hits).toEqual([]);
    expect(parsed.readiness).toEqual({
      score: 0,
      band: "not_started",
      top_blocker: null,
      next_action: null,
    });
  });

  it("requires readiness (it is a summary, never null)", () => {
    expect(brandGroundingBundleSchema.safeParse({}).success).toBe(false);
  });

  it("round-trips guideline hits attached at query time", () => {
    const parsed = brandGroundingBundleSchema.parse({
      readiness: deriveReadinessSummary(null),
      hits: [
        {
          source: "guideline",
          snippet: "Voice: confident, never boastful.",
          similarity: 0.82,
          ref: "tag-1",
          label: "verbal_identity",
        },
      ],
    });
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.hits[0].similarity).toBe(0.82);
    expect(parsed.hits[0].source).toBe("guideline");
  });
});
