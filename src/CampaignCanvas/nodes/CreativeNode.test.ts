import { describe, expect, it } from "bun:test";

import { resolveCreativePreviewRatio } from "./CreativeNode";

describe("resolveCreativePreviewRatio", () => {
  it("parses colon-delimited aspect ratios", () => {
    expect(resolveCreativePreviewRatio("9:16", "image")).toBeCloseTo(9 / 16, 8);
  });

  it("parses slash-delimited aspect ratios with spacing", () => {
    expect(resolveCreativePreviewRatio("16 / 9", "image")).toBeCloseTo(16 / 9, 8);
  });

  it("falls back to media defaults when aspect ratio is invalid", () => {
    expect(resolveCreativePreviewRatio("invalid", "image")).toBe(1);
    expect(resolveCreativePreviewRatio(undefined, "video")).toBeCloseTo(16 / 9, 8);
  });
});
