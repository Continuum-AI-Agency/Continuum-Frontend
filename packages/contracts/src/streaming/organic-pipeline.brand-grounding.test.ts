import { describe, expect, it } from "bun:test";

import {
  organicBrandTreatmentSchema,
  organicMediaBrandGroundingSchema,
  organicMediaSuggestionSchema,
} from "./organic-pipeline";
import { organicStreamFrameSchema, pipelineStageEnum } from "./organic";

describe("organicMediaBrandGroundingSchema", () => {
  it("accepts a palette-only treatment with no references (the default)", () => {
    const parsed = organicMediaBrandGroundingSchema.safeParse({
      treatment: "palette-only",
      palette: ["#0A0A0A", "#F2F2F2"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.references).toBeUndefined();
  });

  it("accepts a logo treatment with a durable reference handle", () => {
    const parsed = organicMediaBrandGroundingSchema.safeParse({
      treatment: "logo",
      references: [
        { kind: "logo", bucket: "brand-profile-assets", storagePath: "b/branding/logo.png" },
      ],
      rationale: "Branded product announcement warrants the mark.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown treatment", () => {
    expect(organicBrandTreatmentSchema.safeParse("watermark").success).toBe(false);
  });

  it("rejects a reference with no storagePath", () => {
    const parsed = organicMediaBrandGroundingSchema.safeParse({
      treatment: "reference-creative",
      references: [{ kind: "creative" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("organicMediaSuggestionSchema brandGrounding", () => {
  it("carries brandGrounding alongside the blueprint readiness flags", () => {
    const parsed = organicMediaSuggestionSchema.safeParse({
      mediaStatus: "pending",
      textReady: true,
      blueprintReady: true,
      brandGrounding: { treatment: "palette-only", palette: ["#123456"] },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.brandGrounding?.treatment).toBe("palette-only");
  });

  it("remains valid with brandGrounding omitted (back-compat)", () => {
    const parsed = organicMediaSuggestionSchema.safeParse({ mediaStatus: "pending" });
    expect(parsed.success).toBe(true);
  });
});

describe("organic three-stage frames", () => {
  it("includes 'blueprint' as a pipeline stage between draft and assets", () => {
    expect(pipelineStageEnum.options).toEqual([
      "strategist",
      "concept",
      "draft",
      "blueprint",
      "assets",
      "quality",
      "merge",
    ]);
  });

  it("parses a draft.blueprint_ready chat frame", () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: "draft.blueprint_ready",
      data: { jobId: "job_1", brandId: "brand_1", draftId: "draft_1" },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.type).toBe("draft.blueprint_ready");
  });
});
