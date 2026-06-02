import { describe, expect, it } from "bun:test";
import {
  organicCreativeBriefSchema,
  organicStreamFrameSchema,
  pipelineStageEnum,
} from "./organic";

describe("organic pipeline frames", () => {
  it("accepts a pipeline.stage frame through the discriminated union", () => {
    const frame = {
      type: "pipeline.stage",
      data: {
        jobId: "job_1",
        brandId: "brand_1",
        planId: "plan_1",
        planItemId: "item_1",
        stage: "draft",
        agentName: "creative",
        pct: 45,
        status: "active",
      },
    };
    const parsed = organicStreamFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "pipeline.stage") {
      expect(parsed.data.data.stage).toBe("draft");
    }
  });

  it("rejects an out-of-enum pipeline stage", () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: "pipeline.stage",
      data: { jobId: "j", brandId: "b", stage: "not_a_stage" },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a terminal ui.pipeline_card frame with preview + quality", () => {
    const frame = {
      type: "ui.pipeline_card",
      data: {
        jobId: "job_1",
        brandId: "brand_1",
        planId: "plan_1",
        planItemId: "item_1",
        platform: "instagram",
        status: "completed",
        currentStage: "merge",
        preview: { caption: "hi", imageUrl: null, format: "carousel" },
        quality: { passed: true, overallScore: 88, brandFitScore: 90 },
        draftId: "draft_1",
      },
    };
    expect(organicStreamFrameSchema.safeParse(frame).success).toBe(true);
  });

  it("allows minimal pipeline.stage data (loose, optional fields omitted)", () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: "pipeline.stage",
      data: { jobId: "j", brandId: "b", stage: "strategist" },
    });
    expect(parsed.success).toBe(true);
  });

  it("exposes the six canonical stages in order", () => {
    expect(pipelineStageEnum.options).toEqual([
      "strategist",
      "concept",
      "draft",
      "assets",
      "quality",
      "merge",
    ]);
  });

  it("accepts a media.search_results frame through the discriminated union", () => {
    const frame = {
      type: "media.search_results",
      data: {
        query: "bright summer product shot",
        mode: "text",
        items: [
          {
            asset: {
              id: "asset_1",
              brandId: "brand_1",
              kind: "image",
              bucket: "media-library",
              storagePath: "brand_1/photo.png",
              fileName: "photo.png",
              mimeType: "image/png",
              source: "upload",
              status: "ready",
              tags: ["summer", "product"],
              detectedObjects: [],
              hasImageEmbedding: false,
              createdAt: "2026-01-01T00:00:00Z",
              updatedAt: "2026-01-01T00:00:00Z",
            },
            similarity: 0.87,
          },
        ],
      },
    };
    const parsed = organicStreamFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "media.search_results") {
      expect(parsed.data.data.items).toHaveLength(1);
    }
  });

  it("validates a per-item creative brief", () => {
    const brief = {
      contentObjective: "drive saves",
      targetAudience: "gen-z students",
      angle: "back to school hacks",
      trendIntegration: null,
      toneAndVoice: "playful",
      formatSuggestion: "carousel",
      productionNotes: ["bright palette"],
    };
    expect(organicCreativeBriefSchema.safeParse(brief).success).toBe(true);
  });
});
