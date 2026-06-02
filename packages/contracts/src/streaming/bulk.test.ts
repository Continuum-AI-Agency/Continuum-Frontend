import { describe, expect, it } from "bun:test";

import {
  bulkContentPlanSchema,
  bulkPlacementSpecSchema,
  bulkStrategyBriefSchema,
} from "./bulk";
import { organicStreamFrameSchema } from "./organic";

function makeStrategyBrief() {
  return {
    summary: "Skincare launch month: educate, prove, convert.",
    pillars: [
      { name: "Education", description: "Skin science explainers" },
      { name: "Social proof", description: "Before/after + reviews" },
    ],
    mix: [
      { format: "carousel" as const, weight: 0.4 },
      { format: "reel" as const, weight: 0.25 },
      { format: "post" as const, weight: 0.25 },
      { format: "hyperframe" as const, weight: 0.1 },
    ],
    platformSplit: [{ platform: "instagram" as const, weight: 1 }],
    cadencePerDayPerPlatform: 2.5,
    horizonWeeks: 4,
    trendAnchors: [{ trendId: "trend_1", title: "Glass skin" }],
    targetCount: 80,
  };
}

function makePlacementSpec(overrides: Record<string, unknown> = {}) {
  return {
    specId: "spec_1",
    platform: "instagram" as const,
    format: "reel" as const,
    pillar: "Education",
    angle: "3 myths about retinol",
    hook: "You've been using retinol wrong.",
    objective: "save" as const,
    trendId: "trend_1",
    dayId: "2026-06-01",
    scheduledAt: "2026-06-01T11:00:00.000Z",
    shots: [
      { role: "hook" as const, durationSec: 4, prompt: "Close-up, bold text overlay" },
      { role: "body" as const, durationSec: 6, prompt: "Demonstrate correct application" },
      { role: "cta" as const, durationSec: 4, prompt: "Product reveal + follow CTA" },
    ],
    ...overrides,
  };
}

describe("bulk content contracts", () => {
  it("round-trips a strategy brief", () => {
    const parsed = bulkStrategyBriefSchema.safeParse(makeStrategyBrief());
    expect(parsed.success).toBe(true);
  });

  it("round-trips a reel placement spec with a multi-shot storyboard", () => {
    const parsed = bulkPlacementSpecSchema.safeParse(makePlacementSpec());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.shots).toHaveLength(3);
      expect(parsed.data.shots?.[0]?.role).toBe("hook");
    }
  });

  it("accepts a non-reel placement spec with no shots", () => {
    const parsed = bulkPlacementSpecSchema.safeParse(
      makePlacementSpec({ format: "post", shots: null }),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts a hyperframe placement spec with a composition brief", () => {
    const parsed = bulkPlacementSpecSchema.safeParse(
      makePlacementSpec({
        format: "hyperframe",
        shots: null,
        hyperframe: {
          stylePreset: "kinetic-type",
          tone: "high-energy",
          aspectRatio: "9:16",
          durationSec: 15,
        },
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.hyperframe?.stylePreset).toBe("kinetic-type");
    }
  });

  it("rejects a hyperframe brief with an out-of-range duration", () => {
    const parsed = bulkPlacementSpecSchema.safeParse(
      makePlacementSpec({
        format: "hyperframe",
        shots: null,
        hyperframe: {
          stylePreset: "minimal",
          tone: "calm",
          aspectRatio: "1:1",
          durationSec: 90,
        },
      }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts a placement spec before scheduling (null dayId/scheduledAt)", () => {
    const parsed = bulkPlacementSpecSchema.safeParse(
      makePlacementSpec({ dayId: null, scheduledAt: null }),
    );
    expect(parsed.success).toBe(true);
  });

  it("round-trips a full bulk content plan", () => {
    const plan = {
      planId: "plan_bulk_1",
      kind: "bulk" as const,
      title: "Skincare launch — June",
      summary: "80 pieces across 4 weeks, IG-focused.",
      strategyBrief: makeStrategyBrief(),
      schedule: {
        horizonWeeks: 4,
        postsPerDayPerPlatform: 2.5,
        startDate: "2026-06-01",
        bestTimes: [{ platform: "instagram" as const, times: ["11:00", "19:00"] }],
      },
      placements: [makePlacementSpec(), makePlacementSpec({ specId: "spec_2", format: "carousel", shots: null })],
    };
    const parsed = bulkContentPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });

  it("rejects a bulk plan with the wrong kind discriminant", () => {
    const parsed = bulkContentPlanSchema.safeParse({
      planId: "plan_bulk_1",
      kind: "single",
      title: "x",
      strategyBrief: makeStrategyBrief(),
      schedule: { horizonWeeks: 4, postsPerDayPerPlatform: 2 },
      placements: [makePlacementSpec()],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects more than 120 placements (guard cap)", () => {
    const placements = Array.from({ length: 121 }, (_, i) =>
      makePlacementSpec({ specId: `spec_${i}`, format: "post", shots: null }),
    );
    const parsed = bulkContentPlanSchema.safeParse({
      planId: "plan_bulk_1",
      kind: "bulk",
      title: "x",
      strategyBrief: makeStrategyBrief(),
      schedule: { horizonWeeks: 4, postsPerDayPerPlatform: 2 },
      placements,
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a ui.bulk_run frame through the chat stream union", () => {
    const parsed = organicStreamFrameSchema.safeParse({
      type: "ui.bulk_run",
      data: { runId: "run_1", planId: "plan_bulk_1", brandId: "brand_1", total: 80 },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "ui.bulk_run") {
      expect(parsed.data.data.total).toBe(80);
    }
  });
});
