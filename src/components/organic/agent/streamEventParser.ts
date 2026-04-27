import type { CalendarPlacement } from "@/lib/organic/calendar-generation";
import type { AgentJobState, ToolCallEvent, UiCard, UiPostCard, UiTrendChart } from "./types";

type ParsedOrganicStreamEvent =
  | { kind: "delta"; delta: string }
  | { kind: "toolCall"; event: ToolCallEvent }
  | { kind: "toolResult"; toolCallId: string; result: unknown }
  | { kind: "error"; message: string }
  | { kind: "complete" }
  | { kind: "uiCard"; card: UiCard }
  | { kind: "postCard"; card: UiPostCard }
  | { kind: "jobUpdate"; job: Partial<AgentJobState> & { jobId: string } }
  | { kind: "ignored"; type?: string }
  | { kind: "invalid"; type?: string };

type UiTrendPoint = { window: number; value: number };
type UiTrendSeries = { label: "Trends" | "Events" | "Questions"; data: UiTrendPoint[] };
type UiTopSignal = {
  id: string;
  title: string;
  type: "trend" | "event" | "question";
  confidence: number | null;
  platform: string | null;
  windowDays: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getEventPayload(event: Record<string, unknown>): Record<string, unknown> {
  return isRecord(event.data) ? event.data : event;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeToolName(event: Record<string, unknown>): string {
  return (
    readNonEmptyString(event.toolName) ??
    readNonEmptyString(event.tool_name) ??
    readNonEmptyString(event.name) ??
    "unknown_tool"
  );
}

function normalizeToolCallId(event: Record<string, unknown>, toolName: string): string {
  return (
    readNonEmptyString(event.toolCallId) ??
    readNonEmptyString(event.tool_call_id) ??
    readNonEmptyString(event.id) ??
    `${toolName}-${Date.now()}`
  );
}

export function normalizeToolCallEvent(event: Record<string, unknown>): ToolCallEvent {
  const payload = getEventPayload(event);
  const toolName = normalizeToolName(payload);
  const toolCallId = normalizeToolCallId(payload, toolName);
  return {
    toolCallId,
    toolName,
    args: payload.args,
  };
}

export function normalizeToolResultEvent(event: Record<string, unknown>) {
  const payload = getEventPayload(event);
  const toolName = normalizeToolName(payload);
  const toolCallId = normalizeToolCallId(payload, toolName);
  const hasResult = Object.prototype.hasOwnProperty.call(payload, "result");
  return {
    toolCallId,
    result: hasResult
      ? payload.result
      : {
          ok: typeof payload.ok === "boolean" ? payload.ok : false,
          error: isRecord(payload.error) ? payload.error : { message: "Tool failed" },
        },
  };
}

function normalizeTrendSeries(raw: unknown): UiTrendSeries[] {
  if (!Array.isArray(raw)) return [];

  const labelMap = new Map<string, UiTrendSeries["label"]>([
    ["trends", "Trends"],
    ["events", "Events"],
    ["questions", "Questions"],
  ]);

  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const label = labelMap.get((readNonEmptyString(entry.label) ?? "").toLowerCase());
    if (!label) return [];

    const data = Array.isArray(entry.data)
      ? entry.data.flatMap((point) => {
          if (!isRecord(point)) return [];
          if (typeof point.window !== "number" || !Number.isFinite(point.window)) return [];
          if (typeof point.value !== "number" || !Number.isFinite(point.value)) return [];
          return [{ window: point.window, value: point.value }];
        })
      : [];

    return [{ label, data }];
  });
}

function normalizeTopSignals(raw: unknown): UiTopSignal[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    if (entry.type !== "trend" && entry.type !== "event" && entry.type !== "question") return [];

    const id = readNonEmptyString(entry.id) ?? `${entry.type}-${index}`;
    const title = typeof entry.title === "string" ? entry.title : "";
    const confidence =
      typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
        ? entry.confidence
        : null;
    const platform = typeof entry.platform === "string" ? entry.platform : null;
    const windowDays =
      typeof entry.windowDays === "number" && Number.isFinite(entry.windowDays) ? entry.windowDays : 0;

    return [
      {
        id,
        title,
        type: entry.type,
        confidence,
        platform,
        windowDays,
      },
    ];
  });
}

export function normalizeTrendChartEvent(event: Record<string, unknown>): UiTrendChart {
  const payload = getEventPayload(event);
  const windows = Array.isArray(payload.windows)
    ? payload.windows.filter((window): window is number => typeof window === "number" && Number.isFinite(window))
    : [];

  return {
    chartType: "bar",
    title: typeof payload.title === "string" ? payload.title : "",
    windows,
    series: normalizeTrendSeries(payload.series),
    topSignals: normalizeTopSignals(payload.topSignals),
  };
}

function parseJobUpdate(type: string, event: Record<string, unknown>) {
  const payload = getEventPayload(event);
  const jobId = readNonEmptyString(payload.jobId);
  const brandId = readNonEmptyString(payload.brandId);
  if (!jobId || !brandId) return null;

  switch (type) {
    case "job.enqueued":
      return {
        jobId,
        brandId,
        platform: readNonEmptyString(payload.platform) ?? undefined,
        scheduledAt: readNonEmptyString(payload.scheduledAt) ?? undefined,
        trendId:
          payload.trendId === null
            ? null
            : typeof payload.trendId === "string"
              ? payload.trendId
              : undefined,
        status: "queued" as const,
      };
    case "job.progress":
      return {
        jobId,
        brandId,
        status: "running" as const,
        stage: readNonEmptyString(payload.stage) ?? undefined,
        agentName: readNonEmptyString(payload.agentName) ?? undefined,
        message: readNonEmptyString(payload.message) ?? undefined,
      };
    case "draft.ready":
      return {
        jobId,
        brandId,
        draftId: readNonEmptyString(payload.draftId) ?? undefined,
        placement: payload.placement as CalendarPlacement | undefined,
      };
    case "job.completed":
      return {
        jobId,
        brandId,
        status: "completed" as const,
        draftId: readNonEmptyString(payload.draftId) ?? undefined,
      };
    case "job.failed":
      return {
        jobId,
        brandId,
        status: "failed" as const,
        error: isRecord(payload.error)
          ? {
              code: readNonEmptyString(payload.error.code) ?? undefined,
              message: readNonEmptyString(payload.error.message) ?? "Job failed",
            }
          : { message: "Job failed" },
      };
    case "job.cancelled":
      return {
        jobId,
        brandId,
        status: "cancelled" as const,
      };
    default:
      return {
        jobId,
        brandId,
      };
  }
}

function parseUiPostCard(event: Record<string, unknown>): UiPostCard | null {
  const payload = getEventPayload(event);
  const draftId = readNonEmptyString(payload.draftId);
  const jobId = readNonEmptyString(payload.jobId);
  const brandId = readNonEmptyString(payload.brandId);
  if (!draftId || !jobId || !brandId) return null;

  return {
    draftId,
    jobId,
    brandId,
    platform: readNonEmptyString(payload.platform) ?? "unknown",
    scheduledAt: readNonEmptyString(payload.scheduledAt) ?? "",
    caption: typeof payload.caption === "string" ? payload.caption : null,
    hashtags: Array.isArray(payload.hashtags)
      ? payload.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [],
    imageUrl: typeof payload.imageUrl === "string" ? payload.imageUrl : null,
    format: typeof payload.format === "string" ? payload.format : null,
    topic: typeof payload.topic === "string" ? payload.topic : null,
    quality: isRecord(payload.quality)
      ? {
          score: typeof payload.quality.score === "number" ? payload.quality.score : 0,
          passed: payload.quality.passed === true,
        }
      : null,
    trendId: typeof payload.trendId === "string" ? payload.trendId : null,
  };
}

export function parseOrganicStreamEvent(raw: unknown): ParsedOrganicStreamEvent {
  if (!isRecord(raw)) return { kind: "invalid" };
  const type = readNonEmptyString(raw.type);
  if (!type) return { kind: "invalid" };

  switch (type) {
    case "response.created":
    case "response.source":
    case "response.output_text.done":
      return { kind: "ignored", type };
    case "response.output_text.delta":
      return {
        kind: "delta",
        delta: (() => {
          const payload = getEventPayload(raw);
          return typeof payload.delta === "string" ? payload.delta : "";
        })(),
      };
    case "response.done":
      return { kind: "complete" };
    case "response.error": {
      const payload = getEventPayload(raw);
      const message =
        readNonEmptyString(payload.message) ??
        "Unknown stream error";
      return { kind: "error", message };
    }
    case "tool.call":
      return { kind: "toolCall", event: normalizeToolCallEvent(raw) };
    case "tool.result":
      return { kind: "toolResult", ...normalizeToolResultEvent(raw) };
    case "ui.trend_chart":
      return { kind: "uiCard", card: { type: "trend_chart", data: normalizeTrendChartEvent(raw) } };
    case "ui.post_card": {
      const card = parseUiPostCard(raw);
      return card ? { kind: "postCard", card } : { kind: "invalid", type };
    }
    case "job.enqueued":
    case "job.progress":
    case "draft.ready":
    case "job.completed":
    case "job.failed":
    case "job.cancelled": {
      const job = parseJobUpdate(type, raw);
      return job ? { kind: "jobUpdate", job } : { kind: "invalid", type };
    }
    default:
      return { kind: "ignored", type };
  }
}
