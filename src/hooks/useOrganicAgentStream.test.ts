import { describe, expect, it } from "bun:test";

import {
  normalizeToolCallEvent,
  normalizeToolResultEvent,
  normalizeTrendChartEvent,
  parseOrganicStreamEvent,
} from "@/components/organic/agent/streamEventParser";

describe("normalizeToolCallEvent", () => {
  it("uses camelCase tool fields when present", () => {
    const normalized = normalizeToolCallEvent({
      toolCallId: "call_1",
      toolName: "fetch_metrics",
      args: { accountId: "act_123" },
    });

    expect(normalized).toEqual({
      toolCallId: "call_1",
      toolName: "fetch_metrics",
      args: { accountId: "act_123" },
    });
  });

  it("supports snake_case compatibility fields", () => {
    const normalized = normalizeToolCallEvent({
      tool_call_id: "call_2",
      tool_name: "fetch_insights",
      args: { campaignId: "cmp_456" },
    });

    expect(normalized).toEqual({
      toolCallId: "call_2",
      toolName: "fetch_insights",
      args: { campaignId: "cmp_456" },
    });
  });

  it("falls back to name and id compatibility fields", () => {
    const normalized = normalizeToolCallEvent({
      id: "call_3",
      name: "search_trends",
      args: { term: "spf moisturizer" },
    });

    expect(normalized).toEqual({
      toolCallId: "call_3",
      toolName: "search_trends",
      args: { term: "spf moisturizer" },
    });
  });

  it("provides safe defaults when identifiers are missing", () => {
    const normalized = normalizeToolCallEvent({ args: { ping: true } });

    expect(normalized.toolName).toBe("unknown_tool");
    expect(normalized.toolCallId.startsWith("unknown_tool-")).toBe(true);
    expect(normalized.args).toEqual({ ping: true });
  });
});

describe("normalizeToolResultEvent", () => {
  it("uses camelCase tool result fields when present", () => {
    const normalized = normalizeToolResultEvent({
      toolCallId: "call_1",
      toolName: "fetch_metrics",
      result: { rows: 3 },
    });

    expect(normalized).toEqual({
      toolCallId: "call_1",
      result: { rows: 3 },
    });
  });

  it("supports snake_case compatibility fields", () => {
    const normalized = normalizeToolResultEvent({
      tool_call_id: "call_2",
      tool_name: "fetch_insights",
      result: { rows: 7 },
    });

    expect(normalized).toEqual({
      toolCallId: "call_2",
      result: { rows: 7 },
    });
  });

  it("falls back to synthetic id when missing", () => {
    const normalized = normalizeToolResultEvent({
      toolName: "getTrend",
      result: { id: "trend_1" },
    });

    expect(normalized.toolCallId.startsWith("getTrend-")).toBe(true);
    expect(normalized.result).toEqual({ id: "trend_1" });
  });
});

describe("normalizeTrendChartEvent", () => {
  it("normalizes a valid trend chart payload", () => {
    const normalized = normalizeTrendChartEvent({
      title: "Top Trends",
      windows: [7, 14],
      series: [
        { label: "Trends", data: [{ window: 7, value: 12 }] },
        { label: "Events", data: [{ window: 14, value: 5 }] },
      ],
      topSignals: [
        {
          id: "sig_1",
          title: "Spring launch",
          type: "event",
          confidence: 0.82,
          platform: "instagram",
          windowDays: 7,
        },
      ],
    });

    expect(normalized).toEqual({
      chartType: "bar",
      title: "Top Trends",
      windows: [7, 14],
      series: [
        { label: "Trends", data: [{ window: 7, value: 12 }] },
        { label: "Events", data: [{ window: 14, value: 5 }] },
      ],
      topSignals: [
        {
          id: "sig_1",
          title: "Spring launch",
          type: "event",
          confidence: 0.82,
          platform: "instagram",
          windowDays: 7,
        },
      ],
    });
  });

  it("returns safe defaults for malformed trend chart payloads", () => {
    const normalized = normalizeTrendChartEvent({
      title: 123,
      windows: ["x", 7, null],
      series: [{ label: "bad", data: [{ window: "x", value: 1 }] }],
      topSignals: [{ type: "bad" }],
    });

    expect(normalized).toEqual({
      chartType: "bar",
      title: "",
      windows: [7],
      series: [],
      topSignals: [],
    });
  });
});

describe("parseOrganicStreamEvent contract coverage", () => {
  it("handles response lifecycle events", () => {
    expect(parseOrganicStreamEvent({ type: "response.created" })).toEqual({
      kind: "ignored",
      type: "response.created",
    });

    expect(
      parseOrganicStreamEvent({
        type: "response.output_text.delta",
        data: { delta: "hello" },
        eventId: "evt_2",
        seq: 2,
        ts: "2026-04-27T00:00:00.000Z",
      })
    ).toEqual({
      kind: "delta",
      delta: "hello",
    });

    expect(parseOrganicStreamEvent({ type: "response.done" })).toEqual({
      kind: "complete",
    });

    expect(
      parseOrganicStreamEvent({
        type: "response.error",
        data: { message: "upstream failed" },
      })
    ).toEqual({
      kind: "error",
      message: "upstream failed",
    });
  });

  it("handles tool events", () => {
    expect(
      parseOrganicStreamEvent({
        type: "tool.call",
        data: {
          toolCallId: "call_1",
          toolName: "listTrends",
          args: { limit: 10 },
        },
      })
    ).toEqual({
      kind: "toolCall",
      event: {
        toolCallId: "call_1",
        toolName: "listTrends",
        args: { limit: 10 },
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: "tool.result",
        data: {
          toolCallId: "call_1",
          toolName: "listTrends",
          result: [{ id: "trend_1" }],
          ok: true,
        },
      })
    ).toEqual({
      kind: "toolResult",
      toolCallId: "call_1",
      result: [{ id: "trend_1" }],
    });
  });

  it("handles ui events", () => {
    expect(parseOrganicStreamEvent({ type: "response.source", url: "https://example.com" })).toEqual({
      kind: "ignored",
      type: "response.source",
    });

    const trendChart = parseOrganicStreamEvent({
      type: "ui.trend_chart",
      data: {
        title: "Signals",
        windows: [7],
        series: [{ label: "Trends", data: [{ window: 7, value: 22 }] }],
        topSignals: [],
      },
    });

    expect(trendChart).toEqual({
      kind: "uiCard",
      card: {
        type: "trend_chart",
        data: {
          chartType: "bar",
          title: "Signals",
          windows: [7],
          series: [{ label: "Trends", data: [{ window: 7, value: 22 }] }],
          topSignals: [],
        },
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: "ui.post_card",
        data: {
          draftId: "draft_1",
          jobId: "job_1",
          brandId: "brand_1",
          platform: "instagram",
          scheduledAt: "2026-04-28T12:00:00.000Z",
          caption: "hello",
          hashtags: ["trend"],
          imageUrl: null,
          format: "reel",
          topic: "trends",
          quality: { score: 92, passed: true },
          trendId: "trend_1",
        },
      })
    ).toEqual({
      kind: "postCard",
      card: {
        draftId: "draft_1",
        jobId: "job_1",
        brandId: "brand_1",
        platform: "instagram",
        scheduledAt: "2026-04-28T12:00:00.000Z",
        caption: "hello",
        hashtags: ["trend"],
        imageUrl: null,
        format: "reel",
        topic: "trends",
        quality: { score: 92, passed: true },
        trendId: "trend_1",
      },
    });
  });

  it("handles job lifecycle events", () => {
    expect(
      parseOrganicStreamEvent({
        type: "job.enqueued",
        data: {
          jobId: "job_1",
          brandId: "brand_1",
          platform: "instagram",
        },
      })
    ).toEqual({
      kind: "jobUpdate",
      job: {
        jobId: "job_1",
        brandId: "brand_1",
        platform: "instagram",
        scheduledAt: undefined,
        trendId: undefined,
        status: "queued",
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: "job.progress",
        data: {
          jobId: "job_1",
          brandId: "brand_1",
          stage: "drafting",
          agentName: "writer",
        },
      })
    ).toEqual({
      kind: "jobUpdate",
      job: {
        jobId: "job_1",
        brandId: "brand_1",
        status: "running",
        stage: "drafting",
        agentName: "writer",
        message: undefined,
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: "draft.ready",
        data: {
          jobId: "job_1",
          brandId: "brand_1",
          draftId: "draft_1",
        },
      })
    ).toEqual({
      kind: "jobUpdate",
      job: {
        jobId: "job_1",
        brandId: "brand_1",
        draftId: "draft_1",
        placement: undefined,
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: "job.completed",
        data: {
          jobId: "job_1",
          brandId: "brand_1",
          draftId: "draft_1",
        },
      })
    ).toEqual({
      kind: "jobUpdate",
      job: {
        jobId: "job_1",
        brandId: "brand_1",
        status: "completed",
        draftId: "draft_1",
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: "job.failed",
        data: {
          jobId: "job_1",
          brandId: "brand_1",
          error: { code: "boom", message: "failed" },
        },
      })
    ).toEqual({
      kind: "jobUpdate",
      job: {
        jobId: "job_1",
        brandId: "brand_1",
        status: "failed",
        error: { code: "boom", message: "failed" },
      },
    });

    expect(
      parseOrganicStreamEvent({
        type: "job.cancelled",
        data: {
          jobId: "job_1",
          brandId: "brand_1",
        },
      })
    ).toEqual({
      kind: "jobUpdate",
      job: {
        jobId: "job_1",
        brandId: "brand_1",
        status: "cancelled",
      },
    });
  });

  it("marks malformed supported events as invalid", () => {
    expect(
      parseOrganicStreamEvent({
        type: "job.progress",
        data: { brandId: "brand_1" },
      })
    ).toEqual({
      kind: "invalid",
      type: "job.progress",
    });
  });
});
