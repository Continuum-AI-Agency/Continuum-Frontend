import { describe, expect, it } from "bun:test";

import {
  organicPlanStatusDataSchema,
  organicPostCardDataSchema,
  organicPostEnqueuedDataSchema,
  organicStreamFrameSchema,
  organicTrendChartDataSchema,
} from "./organic";

// The shapes below mirror the exact Backend emit sites (cards/postCard.ts,
// cards/trendChart.ts, jobs/worker.ts emitPlanStatus, tools/createPost.ts) so the
// tightened union stays a faithful contract for what the agent actually streams.

describe("tightened ui.* frame payloads parse their real emit shapes", () => {
  it("ui.post_card (PostCardData)", () => {
    const data = {
      draftId: "d1",
      jobId: "j1",
      brandId: "b1",
      platform: "instagram",
      scheduledAt: "2026-06-20T12:00:00Z",
      caption: "hello",
      hashtags: ["#a", "#b"],
      imageUrl: null,
      format: "post",
      topic: "launch",
      quality: { score: 88, passed: true },
      trendId: null,
    };
    expect(organicPostCardDataSchema.safeParse(data).success).toBe(true);
    const frame = organicStreamFrameSchema.safeParse({ type: "ui.post_card", data });
    expect(frame.success).toBe(true);
    if (frame.success && frame.data.type === "ui.post_card") {
      expect(frame.data.data.draftId).toBe("d1");
      expect(frame.data.data.quality?.score).toBe(88);
    }
  });

  it("ui.trend_chart (TrendChartData)", () => {
    const data = {
      chartType: "bar",
      title: "Brand Trend Signals",
      windows: [7, 30],
      series: [
        { label: "Trends", data: [{ window: 7, value: 3 }] },
        { label: "Events", data: [{ window: 7, value: 1 }] },
        { label: "Questions", data: [{ window: 7, value: 2 }] },
      ],
      topSignals: [
        { id: "t1", title: "AI", type: "trend", confidence: 0.9, platform: "instagram", windowDays: 7 },
      ],
    };
    expect(organicTrendChartDataSchema.safeParse(data).success).toBe(true);
    expect(organicStreamFrameSchema.safeParse({ type: "ui.trend_chart", data }).success).toBe(true);
  });

  it("ui.plan_status (worker shape: jobId/brandId + completed w/ draftId)", () => {
    const worker = { jobId: "j1", brandId: "b1", planId: "p1", itemId: "i1", status: "completed", draftId: "d9" };
    const planExec = { planId: "p1", itemId: "i2", status: "executing" };
    expect(organicPlanStatusDataSchema.safeParse(worker).success).toBe(true);
    expect(organicPlanStatusDataSchema.safeParse(planExec).success).toBe(true);
    expect(organicStreamFrameSchema.safeParse({ type: "ui.plan_status", data: worker }).success).toBe(true);
  });

  it("ui.plan_status rejects an unknown status", () => {
    expect(
      organicPlanStatusDataSchema.safeParse({ itemId: "i1", status: "bogus" }).success,
    ).toBe(false);
  });

  it("ui.post_enqueued (createPost literal, with + without optional draftId)", () => {
    const withDraft = {
      jobId: "j1",
      platform: "instagram",
      scheduledAt: "2026-06-20T12:00:00Z",
      trendId: null,
      draftId: "d1",
      dayId: "2026-06-20",
      planItemId: "i1",
    };
    const minimal = { jobId: "j1", platform: "instagram", scheduledAt: "2026-06-20T12:00:00Z", trendId: null };
    expect(organicPostEnqueuedDataSchema.safeParse(withDraft).success).toBe(true);
    expect(organicPostEnqueuedDataSchema.safeParse(minimal).success).toBe(true);
  });
});
