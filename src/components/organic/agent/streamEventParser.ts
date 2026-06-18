import type { CalendarPlacement } from "@/lib/organic/calendar-generation";
import {
  bulkContentPlanSchema,
  mediaSearchResultsFrameSchema,
  organicStreamFrameSchema,
  POST_FETCHING_TOOL_NAMES,
  proposedPlanSchema,
  type BulkContentPlan,
  type MediaSearchResultsFrame,
  type OrganicStreamFrame,
} from "@continuum/contracts";
import type { UiFetchedPost } from "@continuum/contracts";
import type {
  AgentJobState,
  CheckpointState,
  PipelineCardState,
  PipelineQuality,
  PipelineStage,
  PlanItemStatus,
  SkillProposalCardData,
  ToolApproval,
  ToolCallEvent,
  UiCard,
  UiPlanCard,
  UiPostCard,
  UiTrendChart,
} from "./types";
import { PIPELINE_STAGES } from "./types";

// Labels for the post_list card synthesized from a post-fetching tool's result.
// Shared by the live stream hook AND the session-restore path so both build the
// same card from a tool result — one source, no drift.
export const POST_TOOL_LABELS: Record<string, string> = {
  listDrafts: "Drafts",
  getTopPosts: "Top Posts",
  listOwnInstagramMedia: "Recent Media",
  getCalendarPostedContent: "Posted Content",
  rankPostPerformers: "Top Performers",
  getCompetitorInstagramTopPosts: "Competitor Posts",
};

/**
 * The post_list UiCard a post-fetching tool result should surface, or null if the
 * tool is not a post-fetcher or returned no posts. Used live and on reload.
 */
export function postListCardFromToolResult(toolName: string, result: unknown): UiCard | null {
  if (!(POST_FETCHING_TOOL_NAMES as readonly string[]).includes(toolName)) return null;
  const posts = normalizePostToolResult(toolName, result);
  if (posts.length === 0) return null;
  return { type: "post_list", data: posts, label: POST_TOOL_LABELS[toolName] };
}

export type ParsedPipelineStage = {
  jobId: string;
  brandId: string;
  planId: string | null;
  planItemId: string | null;
  stage: PipelineStage;
  agentName?: string;
  pct?: number;
  status?: "active" | "done" | "failed";
};

export type ParsedPlanStatus = {
  planId: string | null;
  itemId: string;
  status: PlanItemStatus;
  jobId?: string;
  draftId?: string;
};

export type ParsedOrganicStreamEvent =
  | { kind: "delta"; delta: string }
  | { kind: "toolCall"; event: ToolCallEvent }
  | { kind: "toolResult"; toolCallId: string; toolName: string; result: unknown }
  | { kind: "postList"; posts: UiFetchedPost[] }
  | { kind: "error"; message: string }
  | { kind: "complete" }
  | { kind: "uiCard"; card: UiCard }
  | { kind: "postCard"; card: UiPostCard }
  | { kind: "jobUpdate"; job: Partial<AgentJobState> & { jobId: string } }
  | { kind: "draftBlueprint"; draftId: string; previews: string[] }
  | { kind: "runStarted"; runId: string; jobId: string }
  | { kind: "pipelineStage"; event: ParsedPipelineStage }
  | { kind: "pipelineCard"; card: Partial<PipelineCardState> & { jobId: string } }
  | { kind: "planStatus"; event: ParsedPlanStatus }
  | { kind: "toolApproval"; approval: ToolApproval }
  | { kind: "bulkRun"; run: ParsedBulkRun }
  | { kind: "mediaSearchResults"; frame: MediaSearchResultsFrame }
  | { kind: "ignored"; type?: string }
  | { kind: "invalid"; type?: string };

export type ParsedBulkRun = {
  runId: string;
  planId: string;
  brandId: string;
  total: number;
};

export type OrganicWireFrame = OrganicStreamFrame;

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
    toolName,
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

// draft.blueprint_ready carries the persisted 512px storyboard frames. Pull the
// draftId (the blueprint job's own jobId differs from the post-generation card's,
// so callers match by draftId) and the signed preview URLs — base64 is excluded so
// only re-signable URLs reach the chat thumbnails.
function parseDraftBlueprint(
  event: Record<string, unknown>,
): { draftId: string; previews: string[] } | null {
  const payload = getEventPayload(event);
  const draftId = readNonEmptyString(payload.draftId);
  if (!draftId) return null;
  const rawPreviews = Array.isArray(payload.previews) ? payload.previews : [];
  const previews = rawPreviews
    .map((p) => (isRecord(p) ? readNonEmptyString(p.signedUrl) : undefined))
    .filter((url): url is string => Boolean(url) && !url!.startsWith("data:"));
  return { draftId, previews };
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

// The Backend emits the full ProposedPlan as the ui.plan_card payload, so the
// boundary check is a single safeParse against the shared contract schema — no
// hand-rolled parallel parser to drift. On failure we drop the card (the
// caller's tolerant fallthrough), preserving rolling-deploy resilience.
function parseUiPlanCard(event: Record<string, unknown>): UiPlanCard | null {
  const payload = getEventPayload(event);
  const result = proposedPlanSchema.safeParse(payload);
  return result.success ? result.data : null;
}

function parseBulkPlanCard(event: Record<string, unknown>): BulkContentPlan | null {
  const payload = getEventPayload(event);
  const result = bulkContentPlanSchema.safeParse(payload);
  return result.success ? result.data : null;
}

function parseSkillProposalCard(event: Record<string, unknown>): SkillProposalCardData | null {
  const payload = getEventPayload(event);
  const proposalId = readNonEmptyString(payload.proposalId);
  const brandId = readNonEmptyString(payload.brandId);
  const name = readNonEmptyString(payload.name);
  const directives = typeof payload.directives === "string" ? payload.directives : "";
  if (!proposalId || !brandId || !name || !directives) return null;
  const kind = payload.kind === "analytic" ? "analytic" : "creative_direction";
  return {
    proposalId,
    brandId,
    name,
    kind,
    description: typeof payload.description === "string" ? payload.description : null,
    directives,
    tags: Array.isArray(payload.tags)
      ? payload.tags.filter((t): t is string => typeof t === "string")
      : [],
  };
}

function parseBulkRun(event: Record<string, unknown>): ParsedBulkRun | null {
  const payload = getEventPayload(event);
  const runId = readNonEmptyString(payload.runId);
  const planId = readNonEmptyString(payload.planId);
  const brandId = readNonEmptyString(payload.brandId);
  if (!runId || !planId || !brandId) return null;
  return {
    runId,
    planId,
    brandId,
    total: typeof payload.total === "number" ? payload.total : 0,
  };
}

const PIPELINE_STAGE_SET = new Set<string>(PIPELINE_STAGES);

function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && PIPELINE_STAGE_SET.has(value);
}

function parsePipelineStage(event: Record<string, unknown>): ParsedPipelineStage | null {
  const payload = getEventPayload(event);
  const jobId = readNonEmptyString(payload.jobId);
  const brandId = readNonEmptyString(payload.brandId);
  if (!jobId || !brandId) return null;
  if (!isPipelineStage(payload.stage)) return null;

  const status =
    payload.status === "active" || payload.status === "done" || payload.status === "failed"
      ? payload.status
      : undefined;

  return {
    jobId,
    brandId,
    planId: typeof payload.planId === "string" ? payload.planId : null,
    planItemId: typeof payload.planItemId === "string" ? payload.planItemId : null,
    stage: payload.stage,
    agentName: readNonEmptyString(payload.agentName) ?? undefined,
    pct: typeof payload.pct === "number" && Number.isFinite(payload.pct) ? payload.pct : undefined,
    status,
  };
}

const MEDIA_STATUS_VALUES = new Set(["pending", "generating", "ready", "user_supplied", "skipped"])

function parseCheckpoint(raw: unknown): CheckpointState | undefined {
  if (!isRecord(raw)) return undefined
  const mediaStatus =
    typeof raw.mediaStatus === "string" && MEDIA_STATUS_VALUES.has(raw.mediaStatus)
      ? (raw.mediaStatus as CheckpointState["mediaStatus"])
      : undefined
  return {
    textReady: raw.textReady === true ? true : raw.textReady === false ? false : undefined,
    blueprintReady: raw.blueprintReady === true ? true : raw.blueprintReady === false ? false : undefined,
    mediaStatus,
    awaitingMediaChoice: raw.awaitingMediaChoice === true ? true : undefined,
  }
}

function parsePipelineQuality(raw: unknown): PipelineQuality | null {
  if (!isRecord(raw)) return null;
  const num = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;
  return {
    passed: raw.passed === true,
    overallScore: num(raw.overallScore) ?? 0,
    brandFitScore: num(raw.brandFitScore),
    platformFitScore: num(raw.platformFitScore),
    noveltyScore: num(raw.noveltyScore),
    complianceScore: num(raw.complianceScore),
    summary: readNonEmptyString(raw.summary) ?? undefined,
  };
}

function parsePipelineCard(
  event: Record<string, unknown>,
): (Partial<PipelineCardState> & { jobId: string }) | null {
  const payload = getEventPayload(event);
  const jobId = readNonEmptyString(payload.jobId);
  if (!jobId) return null;

  const status =
    payload.status === "running" ||
    payload.status === "completed" ||
    payload.status === "failed" ||
    payload.status === "cancelled"
      ? payload.status
      : "running";

  const preview = isRecord(payload.preview)
    ? {
        caption: typeof payload.preview.caption === "string" ? payload.preview.caption : null,
        imageUrl: typeof payload.preview.imageUrl === "string" ? payload.preview.imageUrl : null,
        images: Array.isArray(payload.preview.images)
          ? (payload.preview.images as unknown[]).filter((u): u is string => typeof u === "string")
          : undefined,
        format: typeof payload.preview.format === "string" ? payload.preview.format : null,
      }
    : undefined;

  return {
    jobId,
    brandId: readNonEmptyString(payload.brandId) ?? undefined,
    planId: typeof payload.planId === "string" ? payload.planId : null,
    planItemId: typeof payload.planItemId === "string" ? payload.planItemId : null,
    platform: readNonEmptyString(payload.platform) ?? undefined,
    status,
    currentStage: isPipelineStage(payload.currentStage) ? payload.currentStage : undefined,
    preview,
    quality: parsePipelineQuality(payload.quality),
    draftId: typeof payload.draftId === "string" ? payload.draftId : null,
    error: isRecord(payload.error)
      ? {
          code: readNonEmptyString(payload.error.code) ?? undefined,
          message: readNonEmptyString(payload.error.message) ?? "Pipeline failed",
        }
      : undefined,
    checkpoint: parseCheckpoint(payload.checkpoint),
  };
}

function parsePlanStatus(event: Record<string, unknown>): ParsedPlanStatus | null {
  const payload = getEventPayload(event);
  const itemId = readNonEmptyString(payload.itemId);
  if (!itemId) return null;
  const status = (readNonEmptyString(payload.status) ?? "pending") as PlanItemStatus;
  return {
    planId: typeof payload.planId === "string" ? payload.planId : null,
    itemId,
    status,
    jobId: readNonEmptyString(payload.jobId) ?? undefined,
    draftId: readNonEmptyString(payload.draftId) ?? undefined,
  };
}

function parseToolApproval(event: Record<string, unknown>): ToolApproval | null {
  const payload = getEventPayload(event);
  const approvalId = readNonEmptyString(payload.approvalId);
  const toolCallId = readNonEmptyString(payload.toolCallId);
  const toolName = readNonEmptyString(payload.toolName);
  if (!approvalId || !toolCallId || !toolName) return null;
  return { approvalId, toolCallId, toolName, input: payload.input };
}

function toSourcePlatform(raw: unknown): UiFetchedPost["source"] {
  if (raw === "facebook") return "facebook";
  if (raw === "tiktok") return "tiktok";
  if (raw === "instagram") return "instagram";
  return "instagram";
}

function extractArray(result: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(result)) return result;
  if (!isRecord(result)) return [];
  for (const key of keys) {
    if (Array.isArray(result[key])) return result[key] as unknown[];
  }
  return [];
}

export function normalizePostToolResult(toolName: string, result: unknown): UiFetchedPost[] {
  switch (toolName) {
    case "listDrafts": {
      return extractArray(result, "drafts").flatMap((item) => {
        if (!isRecord(item)) return [];
        const draftId = readNonEmptyString(item.draftId);
        if (!draftId) return [];
        return [{
          postId: draftId,
          source: "draft" as const,
          platform: readNonEmptyString(item.platform),
          caption: readNonEmptyString(item.caption),
          mediaUrl: null,
          permalink: null,
          postedAt: null,
          scheduledAt: readNonEmptyString(item.scheduledAt),
          format: readNonEmptyString(item.format),
          status: readNonEmptyString(item.status),
          topic: readNonEmptyString(item.topic),
          metrics: null,
          rank: null,
          quality: isRecord(item.quality) ? { passed: item.quality.passed === true } : null,
        }];
      });
    }

    case "getTopPosts": {
      if (!isRecord(result) || !result.ok) return [];
      const platform = toSourcePlatform(result.platform);
      return extractArray(result, "rows").flatMap((item) => {
        if (!isRecord(item)) return [];
        const postId = readNonEmptyString(item.post_id);
        if (!postId) return [];
        const metrics = isRecord(item.metrics)
          ? (item.metrics as Record<string, number | null>)
          : null;
        return [{
          postId,
          source: platform,
          platform: typeof result.platform === "string" ? result.platform : null,
          caption: readNonEmptyString(item.caption_snippet),
          mediaUrl: readNonEmptyString(item.thumbnail_url),
          permalink: readNonEmptyString(item.permalink),
          postedAt: readNonEmptyString(item.posted_at),
          scheduledAt: null,
          format: null,
          status: "published",
          topic: null,
          metrics,
          rank: typeof item.rank === "number" ? item.rank : null,
          quality: null,
        }];
      });
    }

    case "listOwnInstagramMedia": {
      return extractArray(result, "posts").flatMap((item) => {
        if (!isRecord(item)) return [];
        const mediaId = readNonEmptyString(item.mediaId);
        if (!mediaId) return [];
        const likeCount = typeof item.likeCount === "number" ? item.likeCount : null;
        const commentsCount = typeof item.commentsCount === "number" ? item.commentsCount : null;
        return [{
          postId: mediaId,
          source: "instagram" as const,
          platform: "instagram",
          caption: readNonEmptyString(item.captionSnippet),
          mediaUrl: null,
          permalink: readNonEmptyString(item.permalink),
          postedAt: readNonEmptyString(item.timestamp),
          scheduledAt: null,
          format: readNonEmptyString(item.productType) ?? readNonEmptyString(item.mediaType),
          status: "published",
          topic: null,
          metrics: { likes: likeCount, comments: commentsCount },
          rank: typeof item.rank === "number" ? item.rank : null,
          quality: null,
        }];
      });
    }

    case "getCalendarPostedContent": {
      if (!isRecord(result) || !result.ok) return [];
      return extractArray(result, "posts").flatMap((item) => {
        if (!isRecord(item)) return [];
        const postId = readNonEmptyString(item.post_id);
        if (!postId) return [];
        const platform = toSourcePlatform(item.platform);
        const metrics = isRecord(item.metrics)
          ? (item.metrics as Record<string, number | null>)
          : null;
        return [{
          postId,
          source: platform,
          platform: typeof item.platform === "string" ? item.platform : null,
          caption: readNonEmptyString(item.caption),
          mediaUrl: readNonEmptyString(item.media_url),
          permalink: readNonEmptyString(item.permalink),
          postedAt: readNonEmptyString(item.posted_at),
          scheduledAt: null,
          format: null,
          status: "published",
          topic: null,
          metrics,
          rank: null,
          quality: null,
        }];
      });
    }

    case "rankPostPerformers": {
      if (!isRecord(result) || !result.ok) return [];
      const metric = readNonEmptyString(result.metric);
      const allRows = [
        ...extractArray(result, "top"),
        ...extractArray(result, "bottom"),
      ];
      return allRows.flatMap((item, i) => {
        if (!isRecord(item)) return [];
        const mediaId = readNonEmptyString(item.mediaId);
        if (!mediaId) return [];
        const metricValue = typeof item.metricValue === "number" ? item.metricValue : null;
        return [{
          postId: mediaId,
          source: "instagram" as const,
          platform: "instagram",
          caption: readNonEmptyString(item.captionSnippet),
          mediaUrl: null,
          permalink: readNonEmptyString(item.permalink),
          postedAt: null,
          scheduledAt: null,
          format: null,
          status: typeof item.bucket === "string" ? item.bucket : "published",
          topic: metric ?? null,
          metrics: metric && metricValue !== null ? { [metric]: metricValue } : null,
          rank: i + 1,
          quality: null,
        }];
      });
    }

    case "getCompetitorInstagramTopPosts": {
      if (!isRecord(result) || !result.found) return [];
      return extractArray(result, "posts").flatMap((item) => {
        if (!isRecord(item)) return [];
        const postId = readNonEmptyString(item.id);
        if (!postId) return [];
        const creative = isRecord(item.creative) ? item.creative : null;
        const children = Array.isArray(creative?.children) ? (creative.children as unknown[]) : [];
        const firstChild = children.length > 0 && isRecord(children[0]) ? (children[0] as Record<string, unknown>) : null;
        const firstChildMedia = firstChild
          ? (readNonEmptyString(firstChild.mediaUrl) ?? readNonEmptyString(firstChild.thumbnailUrl))
          : null;
        const resolvedMediaUrl =
          firstChildMedia ??
          readNonEmptyString(creative?.mediaUrl as unknown) ??
          readNonEmptyString(creative?.thumbnailUrl as unknown);
        return [{
          postId,
          source: "instagram" as const,
          platform: "instagram",
          caption: readNonEmptyString(item.captionSnippet),
          mediaUrl: resolvedMediaUrl,
          permalink: readNonEmptyString(item.permalink),
          postedAt: readNonEmptyString(item.timestamp),
          scheduledAt: null,
          format: readNonEmptyString(item.mediaType),
          status: null,
          topic: null,
          metrics: {
            likes: typeof item.likes === "number" ? item.likes : null,
            comments: typeof item.comments === "number" ? item.comments : null,
            engagement: typeof item.engagement === "number" ? item.engagement : null,
          },
          rank: null,
          quality: null,
        }];
      });
    }

    default:
      return [];
  }
}

export function parseOrganicStreamEvent(raw: unknown): ParsedOrganicStreamEvent {
  if (!isRecord(raw)) return { kind: "invalid" };
  const type = readNonEmptyString(raw.type);
  if (!type) return { kind: "invalid" };

  const validation = organicStreamFrameSchema.safeParse(raw);
  if (!validation.success && type !== "response.source" && type !== "response.output_text.done") {
    console.warn("Invalid Organic stream frame schema for type:", type);
  }

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
    case "tool.result": {
      const { toolCallId, toolName, result } = normalizeToolResultEvent(raw);
      return { kind: "toolResult", toolCallId, toolName, result };
    }
    case "ui.trend_chart":
      return { kind: "uiCard", card: { type: "trend_chart", data: normalizeTrendChartEvent(raw) } };
    case "ui.plan_card": {
      // The bulk plan rides on the same frame, discriminated by data.kind.
      if (getEventPayload(raw).kind === "bulk") {
        const bulk = parseBulkPlanCard(raw);
        return bulk
          ? { kind: "uiCard", card: { type: "bulk_plan_card", data: bulk } }
          : { kind: "invalid", type };
      }
      const card = parseUiPlanCard(raw);
      return card ? { kind: "uiCard", card: { type: "plan_card", data: card } } : { kind: "invalid", type };
    }
    case "ui.post_card": {
      const card = parseUiPostCard(raw);
      return card ? { kind: "postCard", card } : { kind: "invalid", type };
    }
    case "ui.skill_proposal": {
      const card = parseSkillProposalCard(raw);
      return card
        ? { kind: "uiCard", card: { type: "skill_proposal", data: card } }
        : { kind: "invalid", type };
    }
    case "agent.run_started": {
      const payload = getEventPayload(raw);
      const runId = readNonEmptyString(payload.runId);
      if (!runId) return { kind: "invalid", type };
      return { kind: "runStarted", runId, jobId: readNonEmptyString(payload.jobId) ?? "" };
    }
    case "draft.blueprint_ready": {
      const blueprint = parseDraftBlueprint(raw);
      return blueprint ? { kind: "draftBlueprint", ...blueprint } : { kind: "invalid", type };
    }
    case "job.enqueued":
    case "job.progress":
    case "draft.ready":
    case "draft.text_ready":
    case "job.completed":
    case "job.failed":
    case "job.cancelled": {
      const job = parseJobUpdate(type, raw);
      return job ? { kind: "jobUpdate", job } : { kind: "invalid", type };
    }
    case "pipeline.stage": {
      const event = parsePipelineStage(raw);
      return event ? { kind: "pipelineStage", event } : { kind: "invalid", type };
    }
    case "ui.pipeline_card": {
      const card = parsePipelineCard(raw);
      return card ? { kind: "pipelineCard", card } : { kind: "invalid", type };
    }
    case "ui.plan_status": {
      const event = parsePlanStatus(raw);
      return event ? { kind: "planStatus", event } : { kind: "invalid", type };
    }
    case "tool.approval_required": {
      const approval = parseToolApproval(raw);
      return approval ? { kind: "toolApproval", approval } : { kind: "invalid", type };
    }
    case "ui.bulk_run": {
      const run = parseBulkRun(raw);
      return run ? { kind: "bulkRun", run } : { kind: "invalid", type };
    }
    case "media.search_results": {
      const result = mediaSearchResultsFrameSchema.safeParse(raw);
      return result.success
        ? { kind: "mediaSearchResults", frame: result.data }
        : { kind: "invalid", type };
    }
    default:
      return { kind: "ignored", type };
  }
}
