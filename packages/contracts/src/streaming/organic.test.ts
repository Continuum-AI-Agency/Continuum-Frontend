import { describe, expect, it } from "bun:test";
import {
  creativeBriefSchema,
  organicStreamFrameSchema,
  pipelineStageEnum,
  planItemSchema,
  proposedPlanSchema,
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
    expect(creativeBriefSchema.safeParse(brief).success).toBe(true);
  });
});

describe("canonical plan schemas", () => {
  const validItem = {
    itemId: "item-1",
    kind: "create_post",
    platform: "instagram",
    scheduledAt: "2026-06-01T12:00:00.000Z",
    format: "hyperframe",
    trendId: null,
    trendTitle: null,
    angle: "back to school",
    objective: "save",
    audienceSegment: "students",
    rationale: "evidence-cited",
    guidancePrompt: null,
    draftId: null,
  };

  const validPlan = {
    planId: "plan-1",
    sessionId: "sess-1",
    brandId: "brand-1",
    userId: "user-1",
    weekStart: "2026-06-01",
    title: "Week plan",
    summary: "overview",
    items: [validItem],
    estimatedDurationSeconds: 120,
    createdAt: "2026-06-01T00:00:00.000Z",
  };

  it("accepts a full proposed plan and applies defaults", () => {
    const parsed = proposedPlanSchema.safeParse(validPlan);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe("proposed");
      expect(parsed.data.evidence).toEqual([]);
      expect(parsed.data.items[0].status).toBe("pending");
      expect(parsed.data.items[0].creativeBrief).toBeNull();
      // 'hyperframe' is a valid format (FE drift fix).
      expect(parsed.data.items[0].format).toBe("hyperframe");
    }
  });

  it("tolerates an unknown extra field (strips, does not reject)", () => {
    const parsed = proposedPlanSchema.safeParse({ ...validPlan, somethingNew: true });
    expect(parsed.success).toBe(true);
  });

  it("rejects an item missing itemId", () => {
    const { itemId, ...itemNoId } = validItem;
    void itemId;
    const parsed = proposedPlanSchema.safeParse({ ...validPlan, items: [itemNoId] });
    expect(parsed.success).toBe(false);
  });

  it("coerces a non-uuid trendId to null", () => {
    const parsed = planItemSchema.safeParse({ ...validItem, trendId: "not-a-uuid-slug" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.trendId).toBeNull();
  });
});
