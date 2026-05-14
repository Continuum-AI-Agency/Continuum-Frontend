"use client";

import React from "react";
import { Box, Button, TextArea } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  DownloadIcon,
  Edit2Icon,
  FileTextIcon,
  Loader2Icon,
  PlayIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import dynamic from "next/dynamic";

const AnimatedShaderBackground = dynamic(
  () => import("@/components/ui/animated-shader-background").then((mod) => mod.AnimatedShaderBackground),
  { ssr: false }
);
import { useToast } from "@/components/ui/ToastProvider";
import { useJainaChatStream } from "@/hooks/useJainaChatStream";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import type { Attachment } from "@/components/ai-elements/attachments";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Queue,
  QueueItem,
  QueueItemActions,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
  QueueItemAction,
} from "@/components/ai-elements/queue";
import { cn } from "@/lib/utils";
import type { JainaChatMessage } from "./types";
import {
  enqueueMessage,
  removeQueuedMessage,
  shouldQueueSubmission,
  updateQueuedMessageContent,
  type QueuedJainaMessage,
} from "./queueing";

import { JainaHeader } from "./components/JainaHeader";
import { JainaEmptyState } from "./components/JainaEmptyState";
import { JainaMessageItem } from "./components/JainaMessageItem";
import type { PlanFeedbackPayload } from "./components/PlanSection";
import { JainaConversationSidebar } from "./components/JainaConversationSidebar";
import {
  extractRenderableFallbackFromStructuredContent,
  getFinalThought,
  getReportSummary,
  hasReportContent,
  isLikelyStructuredJsonContent,
  isStreamingPlaceholderMessage,
  resolveReportSignal,
} from "./jainaUtils";
import {
  parsePersistedReportV2Value,
  parsePersistedReportValue,
} from "./persistedReport";
import {
  isPersistedResultStub,
  parsePersistedResultWrapper,
} from "@/lib/jaina/unwrapping";
import type { JainaStreamState } from "@/lib/jaina/stream";
import type { CampaignCanvasPayload } from "@/lib/campaign-canvas/payload";
import { useCampaignAI } from "@/CampaignCanvas/hooks/useCampaignAI";
import { extractCampaignCanvasActionsEnvelope } from "@/lib/campaign-canvas/agent-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  usePaidMediaPerformanceStore,
} from "@/lib/paid-media/performance-store";
import type { CampaignPerformanceRow } from "@/lib/paid-media/performance-types";
import type {
  AgentMentionProvider,
  AgentMentionReference,
  AgentMentionSuggestion,
} from "@/lib/agent-references";
import {
  createConversationSessionResponseSchema,
  jainaConversationListResponseSchema,
  jainaConversationRunsHydrationResponseSchema,
  type JainaConversationRun,
  mapConversationCreateResponse,
  type JainaConversationMessage,
  type JainaConversationSession,
} from "@/lib/jaina/conversations";
import { frontendCheckpointReportSchema, reportAssemblySchema, type JainaPlanAction } from "@/lib/jaina/schemas";
import { useJainaConversationSidebarStore } from "@/lib/jaina/conversation-sidebar-store";
import { http } from "@/lib/api/http";
import type { RealtimeChannel } from "@supabase/supabase-js";

export { parsePersistedResultWrapper } from "@/lib/jaina/unwrapping";

function ConversationSkeleton() {
  return (
    <div className="space-y-6 px-4 py-6" aria-hidden="true">
      <div className="flex justify-end">
        <div className="h-9 w-48 animate-pulse rounded-2xl bg-muted/50" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="flex justify-end">
        <div className="h-9 w-64 animate-pulse rounded-2xl bg-muted/50" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-2/5 animate-pulse rounded bg-muted/30" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/20" />
      </div>
    </div>
  );
}

type JainaChatSurfaceProps = {
  brandProfileId: string;
  brandName: string;
  adAccountId: string | null;
  campaignId?: string | null;
  campaignCanvasPayload?: CampaignCanvasPayload | null;
  userId?: string | null;
  onCanvasActionApplied?: () => void;
  className?: string;
};

type ReportArtifactJobStatus = "pending" | "running" | "done" | "failed";

type ReportArtifactJobTracker = {
  jobId: string;
  status: ReportArtifactJobStatus;
  reportModel?: string;
  statusEndpoint: string;
  fileUrlEndpoint: string;
  fileUrl?: string;
  error?: string;
};

const REPORT_ARTIFACT_POLL_INTERVAL_MS = 3500;

type JainaMentionAdSet = {
  id: string;
  name: string;
  status?: string;
};

function matchesJainaMentionQuery(
  query: string,
  values: Array<string | null | undefined>
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function formatMetricHint(campaign: CampaignPerformanceRow): string | undefined {
  const spend = campaign.metrics?.spend;
  const roas = campaign.metrics?.roas;
  if (typeof spend !== "number" && typeof roas !== "number") return undefined;
  const parts: string[] = [];
  if (typeof spend === "number") {
    parts.push(`$${Math.round(spend).toLocaleString()} spend`);
  }
  if (typeof roas === "number") {
    parts.push(`${roas.toFixed(2)} ROAS`);
  }
  return parts.join(" · ");
}

function createCampaignReference(
  campaign: CampaignPerformanceRow,
  adAccountId: string
): AgentMentionReference {
  return {
    id: campaign.id,
    type: "campaign",
    label: campaign.name,
    source: "jaina",
    metadata: {
      campaignId: campaign.id,
      adAccountId,
      status: campaign.status,
      objective: campaign.objective,
    },
  };
}

function createCampaignSuggestion(
  campaign: CampaignPerformanceRow,
  adAccountId: string,
  options?: { children?: boolean }
): AgentMentionSuggestion {
  const metricHint = formatMetricHint(campaign);
  return {
    key: `${options?.children ? "campaign-adsets" : "campaign"}:${campaign.id}`,
    label: options?.children ? `Ad sets in ${campaign.name}` : campaign.name,
    type: "campaign",
    source: "jaina",
    group: options?.children ? "Ad Sets" : "Campaigns",
    description: [campaign.status, campaign.objective, metricHint].filter(Boolean).join(" · "),
    badge: options?.children ? "choose" : "campaign",
    reference: createCampaignReference(campaign, adAccountId),
    ...(options?.children ? { childrenLabel: "Choose an ad set" } : {}),
  };
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function createJainaSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `jaina-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createQueuedMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `queued-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSessionTitle(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "execution plan") return null;
  return trimmed;
}

function resolveReportSummaryForMessage(report: JainaChatMessage["report"] | undefined): string {
  if (!report) return "";
  const summary = getReportSummary(report).trim();
  const isUnavailableSummary = /synthesis summary unavailable/i.test(summary);
  if (!isUnavailableSummary) return summary;
  if ("type" in report) return summary;

  const v1 = frontendCheckpointReportSchema.safeParse(report);
  if (!v1.success) return summary;

  const firstSectionSummary = v1.data.sections.find((section) =>
    Boolean(section.summary?.trim())
  )?.summary;
  if (firstSectionSummary) return firstSectionSummary;

  const firstRecommendation = v1.data.strategic_recommendations[0];
  if (firstRecommendation?.title) {
    return firstRecommendation.rationale
      ? `${firstRecommendation.title}: ${firstRecommendation.rationale}`
      : firstRecommendation.title;
  }

  return summary;
}

type RenderableContentSources = {
  sessionTitle?: string;
  pendingClarification?: { question: string } | null;
  responseText: string;
  report?: JainaChatMessage["report"] | null;
  reportV2?: JainaChatMessage["reportV2"] | null;
  latestCheckpointSummary?: string;
  checkpointSummarySource?: "synthesis" | "tool_fallback" | "default_unavailable" | null;
  plan?: JainaChatMessage["plan"] | null;
  progress: Parameters<typeof getFinalThought>[0];
};

function pickRenderableContent(sources: RenderableContentSources): string {
  const clarification = sources.pendingClarification?.question?.trim();
  if (clarification) return clarification;

  const safeText = isLikelyStructuredJsonContent(sources.responseText)
    ? (extractRenderableFallbackFromStructuredContent(sources.responseText) ?? "").trim()
    : sources.responseText.trim();
  if (safeText) return safeText;

  const v2Summary = sources.reportV2?.executive_summary?.trim();
  if (v2Summary) return v2Summary;

  const reportSummary = resolveReportSummaryForMessage(sources.report ?? undefined).trim();
  if (reportSummary) return reportSummary;

  const checkpointSummary =
    sources.checkpointSummarySource !== "default_unavailable"
      ? (sources.latestCheckpointSummary ?? "").trim()
      : "";
  if (checkpointSummary) return checkpointSummary;

  const planTitle = sources.plan?.title?.trim();
  if (planTitle) return planTitle;

  const finalThought = getFinalThought(sources.progress)?.trim();
  if (finalThought) return finalThought;

  const sessionTitle = sources.sessionTitle?.trim();
  if (sessionTitle) return sessionTitle;

  return "";
}

async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const detail = await response.text().catch(() => fallback);
  if (!detail) return fallback;
  try {
    const parsed = JSON.parse(detail) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    // plain text
  }
  return detail;
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getNestedRecord(
  record: Record<string, unknown>,
  key: "data" | "job"
): Record<string, unknown> | null {
  return asPlainRecord(record[key]);
}

function getStringFromRecords(
  records: Array<Record<string, unknown> | null>,
  keys: string[]
): string | undefined {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return undefined;
}

function normalizeReportArtifactJobStatus(
  value: unknown
): ReportArtifactJobStatus {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["done", "completed", "complete", "ready", "success", "succeeded"].includes(status)) {
    return "done";
  }
  if (["failed", "failure", "error", "errored"].includes(status)) return "failed";
  if (["running", "processing", "in_progress", "generating"].includes(status)) {
    return "running";
  }
  return "pending";
}

function resolveReportArtifactEndpoint(
  endpoint: string | undefined,
  fallback: string
): string {
  const candidate = endpoint?.trim();
  if (candidate?.startsWith("/api/agents/jaina/")) return candidate;
  return fallback;
}

function buildReportArtifactJobTracker(
  job: NonNullable<ReturnType<typeof createReportArtifactJobFromEvent>>
): ReportArtifactJobTracker {
  return {
    jobId: job.jobId,
    status: job.status,
    reportModel: job.reportModel,
    statusEndpoint: resolveReportArtifactEndpoint(
      job.statusEndpoint,
      `/api/agents/jaina/report-artifacts/jobs/${job.jobId}`
    ),
    fileUrlEndpoint: resolveReportArtifactEndpoint(
      job.fileUrlEndpoint,
      `/api/agents/jaina/report-artifacts/jobs/${job.jobId}/file-url`
    ),
  };
}

function createReportArtifactJobFromEvent(
  job: JainaStreamState["reportArtifactJob"]
): {
  jobId: string;
  status: ReportArtifactJobStatus;
  reportModel?: string;
  statusEndpoint?: string;
  fileUrlEndpoint?: string;
} | null {
  if (!job?.job_id) return null;
  return {
    jobId: job.job_id,
    status: normalizeReportArtifactJobStatus(job.status),
    reportModel: job.report_model,
    statusEndpoint: job.status_endpoint,
    fileUrlEndpoint: job.file_url_endpoint,
  };
}

function extractReportArtifactJobStatus(
  payload: unknown
): { status: ReportArtifactJobStatus; error?: string } {
  const root = asPlainRecord(payload) ?? {};
  const data = getNestedRecord(root, "data");
  const job = getNestedRecord(root, "job");
  const status = getStringFromRecords([root, data, job], ["status", "state"]);
  const error = getStringFromRecords(
    [root, data, job],
    ["error", "error_message", "message"]
  );
  return {
    status: normalizeReportArtifactJobStatus(status),
    error,
  };
}

function extractReportArtifactFileUrl(payload: unknown): string | undefined {
  const root = asPlainRecord(payload) ?? {};
  const data = getNestedRecord(root, "data");
  const job = getNestedRecord(root, "job");
  return getStringFromRecords(
    [root, data, job],
    ["url", "file_url", "signed_url", "download_url"]
  );
}

function parsePersistedReport(
  message: JainaConversationMessage
): JainaChatMessage["report"] | undefined {
  return parsePersistedReportValue({
    report: message.report,
    content: message.content,
    reasoning: message.reasoning,
  });
}

function parsePersistedReportV2(
  message: JainaConversationMessage
): JainaChatMessage["reportV2"] | undefined {
  return parsePersistedReportV2Value({
    report: message.report,
    content: message.content,
    reasoning: message.reasoning,
  });
}

function parsePersistedReportAssembly(
  message: JainaConversationMessage
): JainaChatMessage["reportAssembly"] | undefined {
  const parsed = reportAssemblySchema.safeParse(message.reportAssembly);
  return parsed.success ? parsed.data : undefined;
}

function parseReportAssemblyFromUnknown(
  value: unknown,
  depth = 0
): JainaChatMessage["reportAssembly"] | undefined {
  if (depth > 5 || value == null) return undefined;

  const direct = reportAssemblySchema.safeParse(value);
  if (direct.success) return direct.data;

  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;

  const candidates = [
    record.report_assembly,
    record.reportAssembly,
    record.result_payload,
    record.report,
    record.payload,
    record.data,
    record.content,
    record.detail,
    record.message,
    record.response,
  ];

  for (const candidate of candidates) {
    const parsed = parseReportAssemblyFromUnknown(candidate, depth + 1);
    if (parsed) return parsed;
  }

  return undefined;
}

function deriveObjectivesFromReport(
  report: JainaChatMessage["report"] | undefined
): JainaChatMessage["objectives"] | undefined {
  if (!report || ("type" in report && report.type === "direct_answer")) {
    return undefined;
  }

  const parsedReport = frontendCheckpointReportSchema.safeParse(report);
  if (!parsedReport.success) {
    return undefined;
  }

  if (
    !Array.isArray(parsedReport.data.execution_objectives) ||
    parsedReport.data.execution_objectives.length === 0
  ) {
    return undefined;
  }

  const objectives = parsedReport.data.execution_objectives
    .filter((objective) => typeof objective?.id === "string" && objective.id.trim().length > 0)
    .map((objective) => ({
      id: objective.id,
      title: objective.title || objective.id,
      status: normalizePersistedObjectiveStatus(objective.status),
      description: objective.details ?? objective.scope ?? undefined,
    }));

  return objectives.length > 0 ? objectives : undefined;
}

function hydrateMessagesWithConversationRuns(
  messages: JainaChatMessage[],
  runs: JainaConversationRun[]
): { messages: JainaChatMessage[]; changed: boolean } {
  type HydratedRunPayload = {
    report: JainaChatMessage["report"] | undefined;
    reportV2: JainaChatMessage["reportV2"] | undefined;
    reportAssembly: JainaChatMessage["reportAssembly"] | undefined;
    objectives: JainaChatMessage["objectives"] | undefined;
  };

  const hydrateableAssistantCount = messages.reduce((count, message) => {
    if (message.role !== "assistant" || message.reportV2) {
      return count;
    }
    return count + 1;
  }, 0);
  if (hydrateableAssistantCount === 0) {
    return { messages, changed: false };
  }

  const hydratedPayloads = runs
    .map((run) => {
      const reportV2 = parsePersistedReportV2Value({
        report: run.resultPayload,
        content: typeof run.resultPayload === "string" ? run.resultPayload : "",
      });
      const report = parsePersistedReportValue({
        report: run.resultPayload,
        content: typeof run.resultPayload === "string" ? run.resultPayload : "",
      });
      if (!report && !reportV2) return null;

      const reportAssembly = parseReportAssemblyFromUnknown(run.resultPayload);
      const objectives = deriveObjectivesFromReport(report);

      return {
        report,
        reportV2,
        reportAssembly,
        objectives,
      };
    })
    .filter(
      (value): value is HydratedRunPayload => value !== null
    );

  if (hydratedPayloads.length === 0) {
    return { messages, changed: false };
  }

  let changed = false;
  let payloadIndex = 0;
  const nextMessages = [...messages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];
    if (
      !message ||
      message.role !== "assistant" ||
      message.reportV2
    ) {
      continue;
    }

    const payload = hydratedPayloads[payloadIndex];
    if (!payload) break;
    payloadIndex += 1;

    nextMessages[index] = {
      ...message,
      ...(payload.report && !message.report ? { report: payload.report } : {}),
      ...(payload.reportV2 ? { reportV2: payload.reportV2 } : {}),
      ...(payload.reportAssembly && !message.reportAssembly
        ? { reportAssembly: payload.reportAssembly }
        : {}),
      ...(payload.objectives && !message.objectives
        ? { objectives: payload.objectives }
        : {}),
      ...(typeof message.renderAsReport === "boolean"
        ? {}
        : {
            renderAsReport:
              Boolean(payload.reportV2) ||
              Boolean(
                payload.report &&
                  !("type" in payload.report && payload.report.type === "direct_answer") &&
                  hasReportContent(payload.report)
              ),
          }),
    };
    changed = true;
  }

  return { messages: nextMessages, changed };
}

function normalizePersistedObjectiveStatus(
  value: unknown
): "pending" | "in_progress" | "completed" | "failed" {
  if (value === "pending" || value === "in_progress" || value === "completed" || value === "failed") {
    return value;
  }
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    normalized === "in_progress" ||
    normalized === "in-progress" ||
    normalized === "running" ||
    normalized === "active"
  ) {
    return "in_progress";
  }
  if (
    normalized === "completed" ||
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "success"
  ) {
    return "completed";
  }
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "errored" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  ) {
    return "failed";
  }
  return "pending";
}

const messageObjectiveStatusRank: Record<"pending" | "in_progress" | "completed" | "failed", number> = {
  pending: 0,
  in_progress: 1,
  failed: 2,
  completed: 3,
};

function mergeMessageObjectives(
  persistedObjectives: JainaChatMessage["objectives"],
  localObjectives: JainaChatMessage["objectives"]
): JainaChatMessage["objectives"] | undefined {
  if (!localObjectives || localObjectives.length === 0) return persistedObjectives;
  if (!persistedObjectives || persistedObjectives.length === 0) return localObjectives;

  const byId = new Map<string, NonNullable<JainaChatMessage["objectives"]>[number]>();
  const titleToId = new Map<string, string>();

  for (const objective of persistedObjectives) {
    byId.set(objective.id, objective);
    titleToId.set(objective.title.trim().toLowerCase(), objective.id);
  }

  for (const localObjective of localObjectives) {
    const titleKey = localObjective.title.trim().toLowerCase();
    const targetId = byId.has(localObjective.id)
      ? localObjective.id
      : titleToId.get(titleKey) ?? localObjective.id;
    const persistedObjective = byId.get(targetId);

    if (!persistedObjective) {
      byId.set(targetId, localObjective);
      titleToId.set(titleKey, targetId);
      continue;
    }

    const localRank = messageObjectiveStatusRank[localObjective.status];
    const persistedRank = messageObjectiveStatusRank[persistedObjective.status];
    const status =
      localRank >= persistedRank ? localObjective.status : persistedObjective.status;

    byId.set(targetId, {
      ...persistedObjective,
      ...localObjective,
      id: targetId,
      title: localObjective.title || persistedObjective.title,
      description: localObjective.description ?? persistedObjective.description,
      status,
    });
  }

  return Array.from(byId.values());
}

function objectivesChanged(
  previous: JainaChatMessage["objectives"],
  next: JainaChatMessage["objectives"]
): boolean {
  return JSON.stringify(previous ?? []) !== JSON.stringify(next ?? []);
}

function deriveObjectivesFromPersistedSources(input: {
  message: JainaConversationMessage;
  report: JainaChatMessage["report"] | undefined;
}): JainaChatMessage["objectives"] | undefined {
  if (Array.isArray(input.message.objectives) && input.message.objectives.length > 0) {
    return input.message.objectives as JainaChatMessage["objectives"];
  }

  const report = input.report;
  if (!report || ("type" in report && report.type === "direct_answer")) {
    return undefined;
  }

  const parsedReport = frontendCheckpointReportSchema.safeParse(report);
  if (!parsedReport.success) {
    return undefined;
  }

  if (
    !Array.isArray(parsedReport.data.execution_objectives) ||
    parsedReport.data.execution_objectives.length === 0
  ) {
    return undefined;
  }

  const objectives = parsedReport.data.execution_objectives
    .filter((objective) => typeof objective?.id === "string" && objective.id.trim().length > 0)
    .map((objective) => ({
      id: objective.id,
      title: objective.title || objective.id,
      status: normalizePersistedObjectiveStatus(objective.status),
      description: objective.details ?? objective.scope ?? undefined,
    }));

  return objectives.length > 0 ? objectives : undefined;
}

function mapConversationMessageToChatMessage(
  message: JainaConversationMessage,
  sessionTitle?: string
): JainaChatMessage {
  const persistedReport = parsePersistedReport(message);
  const persistedReportV2 = parsePersistedReportV2(message);
  const persistedReportAssembly = parsePersistedReportAssembly(message);
  const persistedObjectives = deriveObjectivesFromPersistedSources({
    message,
    report: persistedReport,
  });
  const unwrappedResult = !persistedReport
    ? parsePersistedResultWrapper(message.content, sessionTitle)
    : null;
  const content =
    unwrappedResult !== null
      ? unwrappedResult.text ?? ""
      : persistedReport &&
        (isFallbackCheckpointMessage(message.content) ||
          isPersistedErrorMessage(message.content) ||
          isLikelyStructuredJsonContent(message.content))
        ? resolveReportSummaryForMessage(persistedReport) || message.content
        : message.content;
  const persistedPlan = unwrappedResult?.plan;

  return {
    id: `persisted-${message.id}`,
    role: message.role,
    content,
    createdAt: message.createdAt,
    ...(persistedReport ? { report: persistedReport } : {}),
    ...(persistedReportV2 ? { reportV2: persistedReportV2 } : {}),
    ...(persistedReportAssembly ? { reportAssembly: persistedReportAssembly } : {}),
    ...(persistedPlan ? { plan: persistedPlan } : {}),
    ...(typeof message.reportAssemblyHtml === "string"
      ? { reportAssemblyHtml: message.reportAssemblyHtml }
      : {}),
    ...(typeof message.finalThought === "string"
      ? { finalThought: message.finalThought }
      : {}),
    ...(typeof message.renderAsReport === "boolean"
      ? { renderAsReport: message.renderAsReport }
      : {}),
    ...(Array.isArray(message.reasoning)
      ? { reasoning: message.reasoning as JainaChatMessage["reasoning"] }
      : {}),
    ...(Array.isArray(message.toolCalls)
      ? { toolCalls: message.toolCalls as JainaChatMessage["toolCalls"] }
      : {}),
    ...(Array.isArray(message.toolResults)
      ? { toolResults: message.toolResults as JainaChatMessage["toolResults"] }
      : {}),
    ...(message.artifacts && typeof message.artifacts === "object"
      ? { artifacts: message.artifacts as JainaChatMessage["artifacts"] }
      : {}),
    ...(message.pendingClarification &&
    typeof message.pendingClarification === "object" &&
    typeof message.pendingClarification.question === "string"
      ? {
          pendingClarification: {
            id: message.pendingClarification.id,
            question: message.pendingClarification.question,
          },
        }
      : {}),
    ...(persistedObjectives ? { objectives: persistedObjectives } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
    ...(message.role === "assistant"
      ? {
          status: "done",
          title: "Jaina Analyst",
        }
      : {}),
  };
}

function isFallbackCheckpointMessage(content: string): boolean {
  return /synthesis summary unavailable/i.test(content);
}

function isPersistedErrorMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "stream error" ||
    normalized.startsWith("jaina error") ||
    normalized.startsWith("malformed ") ||
    normalized.startsWith("invalid ") ||
    normalized.includes("failed to parse jaina stream event json")
  );
}

function findPendingPlanId(messages: JainaChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const plan = messages[i].plan;
    if (plan?.status === "awaiting_approval") return plan.id;
  }
  return null;
}

export function mergePersistedMessagesWithLocal(
  persistedMessages: JainaChatMessage[],
  localMessages: JainaChatMessage[]
): JainaChatMessage[] {
  if (persistedMessages.length === 0 || localMessages.length === 0) {
    return persistedMessages;
  }

  // Local messages with non-"persisted-" IDs are optimistic — they were added to
  // local state while the backend was still writing. The previous implementation
  // always returned persistedMessages as the base, silently dropping these pending
  // messages. This caused the visible "clear": the current exchange (user + assistant)
  // disappeared as soon as any refreshConversationSnapshot resolved, because the DB
  // hadn't written the new messages yet. Then the Realtime broadcast (which fires
  // when the backend finishes) caused a second overwrite with just plain text.
  const pendingLocal = localMessages.filter((msg) => !msg.id.startsWith("persisted-"));

  if (pendingLocal.length > 0) {
    // Dedup: if the last pending user message content already matches the last
    // persisted user message, the backend *may* have written this exchange.
    // We also require the pending assistant to be present in persisted history.
    // Without this guard, a user-first DB write can cause us to drop the local
    // assistant (including reasoning/tool traces) on refresh.
    const lastPendingUser = [...pendingLocal].reverse().find((m) => m.role === "user");
    const lastPendingAssistant = [...pendingLocal].reverse().find(
      (m) => m.role === "assistant"
    );
    const lastPersistedUser = [...persistedMessages].reverse().find((m) => m.role === "user");
    const lastPersistedAssistant = [...persistedMessages]
      .reverse()
      .find((m) => m.role === "assistant");
    const localAssistantHasRichState = Boolean(
      lastPendingAssistant &&
        (lastPendingAssistant.plan ||
          lastPendingAssistant.report ||
          lastPendingAssistant.reportV2 ||
          lastPendingAssistant.reportAssembly ||
          (lastPendingAssistant.reasoning?.length ?? 0) > 0 ||
          (lastPendingAssistant.toolCalls?.length ?? 0) > 0 ||
          (lastPendingAssistant.toolResults?.length ?? 0) > 0 ||
          (lastPendingAssistant.objectives?.length ?? 0) > 0)
    );
    const persistedAssistantHasMeaningfulContent = Boolean(
      lastPersistedAssistant &&
        lastPersistedAssistant.content.trim().length > 0 &&
        !isFallbackCheckpointMessage(lastPersistedAssistant.content) &&
        !isPersistedErrorMessage(lastPersistedAssistant.content) &&
        !isPersistedResultStub(lastPersistedAssistant.content)
    );
    const userAlreadySynced =
      lastPendingUser &&
      lastPersistedUser &&
      lastPendingUser.content.trim() === lastPersistedUser.content.trim();
    const assistantAlreadySynced =
      !lastPendingAssistant ||
      Boolean(
        lastPersistedAssistant &&
          ((lastPendingAssistant.plan?.id &&
            lastPersistedAssistant.plan?.id === lastPendingAssistant.plan.id) ||
            (lastPendingAssistant.report && lastPersistedAssistant.report) ||
            (lastPendingAssistant.reportV2 && lastPersistedAssistant.reportV2) ||
            (lastPendingAssistant.content.trim().length > 0 &&
              lastPendingAssistant.content.trim() ===
                lastPersistedAssistant.content.trim()) ||
            (!localAssistantHasRichState && persistedAssistantHasMeaningfulContent))
      );
    const alreadySynced = Boolean(userAlreadySynced && assistantAlreadySynced);

    if (!alreadySynced) {
      // The current exchange hasn't landed in the DB yet. Return the persisted
      // history (without touching it — the last persisted assistant belongs to a
      // previous exchange, not this one) plus the pending local pair.
      const pendingToAppend = userAlreadySynced
        ? pendingLocal.filter((message) => message.role !== "user")
        : pendingLocal;
      return [...persistedMessages, ...pendingToAppend];
    }
    // alreadySynced: fall through — the DB has the new messages so we want the
    // persisted version and can apply report-data enrichment below.
  }

  // From here on, all local messages are accounted for in persistedMessages.
  // Apply the assistant report-data merge: local in-memory state may have richer
  // data (report, reportAssembly, etc.) than what the backend persisted, either
  // because the backend saved placeholder text or because it hasn't persisted the
  // full report JSON yet.

  let persistedAssistantIndex = -1;
  for (let index = persistedMessages.length - 1; index >= 0; index -= 1) {
    if (persistedMessages[index]?.role === "assistant") {
      persistedAssistantIndex = index;
      break;
    }
  }
  if (persistedAssistantIndex === -1) {
    return persistedMessages;
  }

  let localAssistant: JainaChatMessage | null = null;
  for (let index = localMessages.length - 1; index >= 0; index -= 1) {
    const candidate = localMessages[index];
    if (candidate?.role !== "assistant") continue;
    const candidateHasRichState =
      Boolean(candidate.plan) ||
      Boolean(candidate.report) ||
      Boolean(candidate.reportV2) ||
      Boolean(candidate.reportAssembly) ||
      (candidate.reasoning?.length ?? 0) > 0 ||
      (candidate.toolCalls?.length ?? 0) > 0 ||
      (candidate.toolResults?.length ?? 0) > 0 ||
      (candidate.objectives?.length ?? 0) > 0;
    if (
      candidateHasRichState ||
      !isFallbackCheckpointMessage(candidate.content)
    ) {
      localAssistant = candidate;
      break;
    }
  }

  if (!localAssistant) {
    return persistedMessages;
  }

  const persistedAssistant = persistedMessages[persistedAssistantIndex];

  // Bail out if the persisted message is already authoritative — UNLESS the
  // persisted copy lacks report data that the local state already holds.
  // This guards the race where the backend saved real text content but hadn't
  // yet written the report JSON when the snapshot resolved.
  const persistedLacksReport =
    !persistedAssistant.report && !persistedAssistant.reportV2 && !persistedAssistant.reportAssembly;
  const localHasReport = Boolean(
    localAssistant.report || localAssistant.reportV2 || localAssistant.reportAssembly
  );
  const localHasRicherReportV2 = Boolean(
    localAssistant.reportV2 && !persistedAssistant.reportV2
  );
  const persistedPlanOnly =
    Boolean(persistedAssistant.plan) &&
    !persistedAssistant.report &&
    !persistedAssistant.reportV2 &&
    !persistedAssistant.reportAssembly &&
    persistedAssistant.content.trim().length === 0;
  const persistedTraceCount =
    (persistedAssistant.reasoning?.length ?? 0) +
    (persistedAssistant.toolCalls?.length ?? 0) +
    (persistedAssistant.toolResults?.length ?? 0) +
    (persistedAssistant.objectives?.length ?? 0);
  const localTraceCount =
    (localAssistant.reasoning?.length ?? 0) +
    (localAssistant.toolCalls?.length ?? 0) +
    (localAssistant.toolResults?.length ?? 0) +
    (localAssistant.objectives?.length ?? 0);
  const shouldPreserveLocalTrace = persistedTraceCount === 0 && localTraceCount > 0;
  const mergedObjectives = mergeMessageObjectives(
    persistedAssistant.objectives,
    localAssistant.objectives
  );
  const hasObjectiveUpgrade = objectivesChanged(
    persistedAssistant.objectives,
    mergedObjectives
  );
  if (
    !isFallbackCheckpointMessage(persistedAssistant.content) &&
    !isPersistedErrorMessage(persistedAssistant.content) &&
    !isPersistedResultStub(persistedAssistant.content) &&
    !(persistedLacksReport && localHasReport) &&
    !localHasRicherReportV2 &&
    !persistedPlanOnly &&
    !shouldPreserveLocalTrace
  ) {
    if (hasObjectiveUpgrade) {
      const mergedMessages = [...persistedMessages];
      mergedMessages[persistedAssistantIndex] = {
        ...persistedAssistant,
        objectives: mergedObjectives,
      };
      return mergedMessages;
    }
    return persistedMessages;
  }

  const mergedMessages = [...persistedMessages];
  mergedMessages[persistedAssistantIndex] = {
    ...persistedAssistant,
    content: localAssistant.content || persistedAssistant.content,
    plan: localAssistant.plan ?? persistedAssistant.plan,
    finalThought: localAssistant.finalThought ?? persistedAssistant.finalThought,
    renderAsReport: localAssistant.renderAsReport ?? persistedAssistant.renderAsReport,
    reasoning: localAssistant.reasoning ?? persistedAssistant.reasoning,
    toolCalls: localAssistant.toolCalls ?? persistedAssistant.toolCalls,
    toolResults: localAssistant.toolResults ?? persistedAssistant.toolResults,
    report: localAssistant.report ?? persistedAssistant.report,
    reportV2: localAssistant.reportV2 ?? persistedAssistant.reportV2,
    reportAssembly: localAssistant.reportAssembly ?? persistedAssistant.reportAssembly,
    reportAssemblyHtml:
      localAssistant.reportAssemblyHtml ?? persistedAssistant.reportAssemblyHtml,
    artifacts: localAssistant.artifacts ?? persistedAssistant.artifacts,
    pendingClarification:
      localAssistant.pendingClarification ?? persistedAssistant.pendingClarification,
    objectives: mergedObjectives,
  };
  return mergedMessages;
}

function sortConversationSessions(
  sessions: JainaConversationSession[]
): JainaConversationSession[] {
  const sorted = [...sessions];
  sorted.sort((a, b) => {
    const aLast = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bLast = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (aLast !== bLast) return bLast - aLast;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return sorted;
}

function upsertConversationSession(
  sessions: JainaConversationSession[],
  nextSession: JainaConversationSession
): JainaConversationSession[] {
  const existingIndex = sessions.findIndex(
    (session) => session.sessionId === nextSession.sessionId
  );
  if (existingIndex === -1) {
    return sortConversationSessions([nextSession, ...sessions]);
  }

  const updated = [...sessions];
  updated[existingIndex] = nextSession;
  return sortConversationSessions(updated);
}

export function JainaChatSurface({
  brandProfileId,
  brandName,
  adAccountId,
  campaignId,
  campaignCanvasPayload,
  userId,
  onCanvasActionApplied,
  className,
}: JainaChatSurfaceProps) {
  const { show } = useToast();
  const { processAIAction } = useCampaignAI();
  const loadCampaignPerformance = usePaidMediaPerformanceStore(
    (store) => store.loadCampaignPerformance
  );
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const prefersReducedMotion = useReducedMotion();

  const { state, start, cancel, reset, clearMemory } = useJainaChatStream();
  const isStreaming = state.status === "streaming" || state.status === "starting";

  const [isJainaProMode, setIsJainaProMode] = React.useState(false);
  const [reportArtifactJob, setReportArtifactJob] =
    React.useState<ReportArtifactJobTracker | null>(null);
  const [isReportArtifactDownloading, setIsReportArtifactDownloading] =
    React.useState(false);
  const [pendingReportArtifactResponseId, setPendingReportArtifactResponseId] =
    React.useState<string | null>(null);
  const [sessionId, setSessionId] = React.useState<string>(() => createJainaSessionId());
  const pendingClarificationId = state.pendingClarification?.id;

  const [messages, setMessages] = React.useState<JainaChatMessage[]>([]);
  const [conversationSessions, setConversationSessions] = React.useState<
    JainaConversationSession[]
  >([]);
  const [sessionTitleById, setSessionTitleById] = React.useState<
    Record<string, string>
  >({});
  const [shaderState, setShaderState] = React.useState<"visible" | "sweeping" | "hidden">(
    "visible"
  );
  const [shaderReady, setShaderReady] = React.useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = React.useState(false);
  const [isConversationSwitching, setIsConversationSwitching] = React.useState(false);
  const [deletingSessionId, setDeletingSessionId] = React.useState<string | null>(null);
  const [activeResponseId, setActiveResponseId] = React.useState<string | null>(null);
  const [queuedMessages, setQueuedMessages] = React.useState<QueuedJainaMessage[]>([]);
  const [editingQueueMessageId, setEditingQueueMessageId] = React.useState<string | null>(
    null
  );
  const [queueEditDraft, setQueueEditDraft] = React.useState("");
  const processedToolResultIdsRef = React.useRef<Set<string>>(new Set());
  const processedCanvasEnvelopeKeysRef = React.useRef<Set<string>>(new Set());
  const processedReportArtifactJobIdsRef = React.useRef<Set<string>>(new Set());
  const persistedAssistantResponseIdsRef = React.useRef<Set<string>>(new Set());
  const conversationChannelRef = React.useRef<RealtimeChannel | null>(null);
  const activeSessionIdRef = React.useRef(sessionId);
  const streamBusyRef = React.useRef(false);
  const queueDispatchInFlightRef = React.useRef(false);
  const promptInputWrapperRef = React.useRef<HTMLDivElement>(null);
  const mentionAdSetsCacheRef = React.useRef<Map<string, JainaMentionAdSet[]>>(new Map());

  const jainaMentionProvider = React.useMemo<AgentMentionProvider>(
    () => ({
      getSuggestions: async ({ query }) => {
        if (!adAccountId) return [];
        const campaigns = await loadCampaignPerformance(
          {
            brandId: brandProfileId,
            adAccountId,
            platform: "meta",
            range: { preset: "last_7d" },
          },
          { force: false }
        ).catch(() => [] as CampaignPerformanceRow[]);

        const filteredCampaigns = campaigns
          .filter((campaign) =>
            matchesJainaMentionQuery(query, [
              campaign.name,
              campaign.status,
              campaign.objective,
            ])
          )
          .slice(0, 8);

        return [
          ...filteredCampaigns.map((campaign) =>
            createCampaignSuggestion(campaign, adAccountId)
          ),
          ...filteredCampaigns.map((campaign) =>
            createCampaignSuggestion(campaign, adAccountId, { children: true })
          ),
        ];
      },
      getChildSuggestions: async (parent) => {
        if (!adAccountId || !parent.reference) return [];
        const campaignId =
          typeof parent.reference.metadata?.campaignId === "string"
            ? parent.reference.metadata.campaignId
            : parent.reference.id;
        const campaignName = parent.reference.label;
        const cached = mentionAdSetsCacheRef.current.get(campaignId);
        const adSets =
          cached ??
          (await supabase.functions
            .invoke(
              `fetch-meta-adsets?brandId=${brandProfileId}&adAccountId=${adAccountId}&campaignId=${campaignId}`,
              {
                method: "POST",
                body: {
                  brandId: brandProfileId,
                  adAccountId,
                  campaignId,
                },
              }
            )
            .then(({ data, error }) => {
              if (error) throw new Error(error.message);
              const rows = Array.isArray((data as { adsets?: unknown[] } | null)?.adsets)
                ? ((data as { adsets: unknown[] }).adsets)
                : [];
              return rows
                .map((row): JainaMentionAdSet | null => {
                  if (!row || typeof row !== "object") return null;
                  const record = row as Record<string, unknown>;
                  const id = typeof record.id === "string" ? record.id : null;
                  const name = typeof record.name === "string" ? record.name : null;
                  if (!id || !name) return null;
                  return {
                    id,
                    name,
                    status: typeof record.status === "string" ? record.status : undefined,
                  };
                })
                .filter((row): row is JainaMentionAdSet => row !== null);
            })
            .catch(() => []));

        if (!cached) {
          mentionAdSetsCacheRef.current.set(campaignId, adSets);
        }

        return adSets.slice(0, 20).map((adSet) => ({
          key: `adset:${campaignId}:${adSet.id}`,
          label: adSet.name,
          type: "adset" as const,
          source: "jaina" as const,
          group: "Ad Sets",
          description: [campaignName, adSet.status].filter(Boolean).join(" · "),
          badge: "adset",
          reference: {
            id: adSet.id,
            type: "adset" as const,
            label: adSet.name,
            source: "jaina" as const,
            metadata: {
              adsetId: adSet.id,
              campaignId,
              campaignName,
              adAccountId,
              status: adSet.status,
            },
          },
        }));
      },
    }),
    [adAccountId, brandProfileId, loadCampaignPerformance, supabase]
  );

  const setConversationSessionsWithCache = React.useCallback(
    (next: React.SetStateAction<JainaConversationSession[]>) => {
      setConversationSessions((previous) => {
        const resolved =
          typeof next === "function"
            ? (next as (sessions: JainaConversationSession[]) => JainaConversationSession[])(
                previous
              )
            : next;
        if (adAccountId) {
          useJainaConversationSidebarStore.getState().setSessions(
            { brandProfileId, adAccountId },
            resolved
          );
        }
        return resolved;
      });
    },
    [adAccountId, brandProfileId]
  );

  const getFreshConversationSessionsFromCache = React.useCallback(() => {
    if (!adAccountId) return null;
    return useJainaConversationSidebarStore.getState().getFreshSessions({
      brandProfileId,
      adAccountId,
    });
  }, [adAccountId, brandProfileId]);

  const currentSessionTitle = sessionTitleById[sessionId];

  React.useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  React.useEffect(() => {
    streamBusyRef.current = isStreaming || Boolean(activeResponseId);
  }, [activeResponseId, isStreaming]);

  React.useEffect(() => {
    const eventJob = createReportArtifactJobFromEvent(state.reportArtifactJob);
    if (!eventJob) return;
    if (processedReportArtifactJobIdsRef.current.has(eventJob.jobId)) return;

    processedReportArtifactJobIdsRef.current.add(eventJob.jobId);
    setPendingReportArtifactResponseId(null);
    setReportArtifactJob(buildReportArtifactJobTracker(eventJob));
  }, [state.reportArtifactJob]);

  React.useEffect(() => {
    if (!reportArtifactJob) return;
    if (reportArtifactJob.status === "done" || reportArtifactJob.status === "failed") {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const pollJob = async () => {
      try {
        const payload = await http.request<Record<string, unknown>>({
          path: reportArtifactJob.statusEndpoint,
          cache: "no-store",
        });
        if (cancelled) return;

        const next = extractReportArtifactJobStatus(payload);

        if (next.status === "done") {
          const filePayload = await http.request<Record<string, unknown>>({
            path: reportArtifactJob.fileUrlEndpoint,
            cache: "no-store",
          });
          if (cancelled) return;
          const fileUrl = extractReportArtifactFileUrl(filePayload);
          setReportArtifactJob((previous) =>
            previous?.jobId === reportArtifactJob.jobId
              ? {
                  ...previous,
                  fileUrl,
                  status: "done",
                  error: next.error ?? previous.error,
                }
              : previous
          );
          return;
        }

        setReportArtifactJob((previous) =>
          previous?.jobId === reportArtifactJob.jobId
            ? {
                ...previous,
                status: next.status,
                error: next.error ?? previous.error,
              }
            : previous
        );

        if (next.status === "failed") return;
        timer = window.setTimeout(pollJob, REPORT_ARTIFACT_POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Unable to refresh report job.";
        setReportArtifactJob((previous) =>
          previous?.jobId === reportArtifactJob.jobId
            ? { ...previous, error: message }
            : previous
        );
        timer = window.setTimeout(pollJob, REPORT_ARTIFACT_POLL_INTERVAL_MS);
      }
    };

    timer = window.setTimeout(pollJob, 800);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reportArtifactJob]);

  React.useEffect(() => {
    if (shaderState !== "sweeping") return;
    const timeoutMs = prefersReducedMotion ? 80 : 820;
    const timer = window.setTimeout(() => {
      setShaderState("hidden");
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion, shaderState]);

  const updateMessage = React.useCallback(
    (
      id: string,
      update:
        | Partial<JainaChatMessage>
        | ((message: JainaChatMessage) => Partial<JainaChatMessage>)
    ) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === id
            ? {
                ...msg,
                ...(typeof update === "function" ? update(msg) : update),
              }
            : msg
        )
      );
    },
    []
  );

  const handleReportArtifactAction = React.useCallback(async () => {
    if (reportArtifactJob?.status === "failed") {
      setReportArtifactJob(null);
      setIsJainaProMode(true);
      return;
    }

    if (!reportArtifactJob || reportArtifactJob.status !== "done") {
      setIsJainaProMode((previous) => !previous);
      return;
    }

    setIsReportArtifactDownloading(true);
    try {
      const fileUrl =
        reportArtifactJob.fileUrl ??
        extractReportArtifactFileUrl(
          await http.request<Record<string, unknown>>({
            path: reportArtifactJob.fileUrlEndpoint,
            cache: "no-store",
          })
        );

      if (!fileUrl) {
        throw new Error("Report file URL is not available yet.");
      }

      setReportArtifactJob((previous) =>
        previous?.jobId === reportArtifactJob.jobId
          ? { ...previous, fileUrl }
          : previous
      );
      window.open(fileUrl, "_blank");
    } catch (error) {
      show({
        title: "Report unavailable",
        description:
          error instanceof Error
            ? error.message
            : "Unable to open the generated report.",
        variant: "error",
      });
    } finally {
      setIsReportArtifactDownloading(false);
    }
  }, [reportArtifactJob, show]);

  const fetchConversationHistory = React.useCallback(
    async (targetSessionId?: string) => {
      if (!adAccountId) return null;

      const searchParams = new URLSearchParams({
        brandId: brandProfileId,
        adAccountId,
        sessionsLimit: "40",
        messagesLimit: "300",
      });

      if (targetSessionId) {
        searchParams.set("sessionId", targetSessionId);
      }

      const response = await fetch(
        `/api/agents/jaina/chat/conversations?${searchParams.toString()}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const detail = await response
          .text()
          .catch(() => "Failed to load conversation history.");
        throw new Error(detail || "Failed to load conversation history.");
      }

      const payload = await response.json().catch(() => null);
      const parsed = jainaConversationListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Invalid conversation history payload.");
      }

      return parsed.data;
    },
    [adAccountId, brandProfileId]
  );

  const hydrateConversationMessagesFromRuns = React.useCallback(
    async (input: {
      targetSessionId: string;
      baseMessages: JainaChatMessage[];
    }) => {
      if (!adAccountId) return;
      if (!input.baseMessages.some(
        (message) =>
          message.role === "assistant" &&
          !message.report &&
          !message.reportV2 &&
          !message.reportAssembly
      )) {
        return;
      }

      try {
        const searchParams = new URLSearchParams({
          brandId: brandProfileId,
          limit: "300",
        });
        if (adAccountId) {
          searchParams.set("adAccountId", adAccountId);
        }

        const response = await fetch(
          `/api/agents/jaina/chat/conversations/${encodeURIComponent(
            input.targetSessionId
          )}/runs?${searchParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );
        if (!response.ok) return;

        const payload = await response.json().catch(() => null);
        const parsed =
          jainaConversationRunsHydrationResponseSchema.safeParse(payload);
        if (!parsed.success) return;

        const hydrated = hydrateMessagesWithConversationRuns(
          input.baseMessages,
          parsed.data.runs
        );
        if (!hydrated.changed) return;
        if (activeSessionIdRef.current !== input.targetSessionId) return;

        setMessages((previous) =>
          mergePersistedMessagesWithLocal(hydrated.messages, previous)
        );
      } catch {
        // Best-effort lazy hydration; ignore failures to avoid interrupting chat load.
      }
    },
    [adAccountId, brandProfileId]
  );

  const ensureConversationSession = React.useCallback(
    async (preferredSessionId?: string) => {
      if (!adAccountId) return null;

      const response = await fetch("/api/agents/jaina/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          context: {
            adAccountId,
            brandId: brandProfileId,
            ...(preferredSessionId ? { sessionId: preferredSessionId } : {}),
          },
        }),
      });

      if (!response.ok) {
        const detail = await response
          .text()
          .catch(() => "Failed to create conversation session.");
        throw new Error(detail || "Failed to create conversation session.");
      }

      const payload = await response.json().catch(() => null);
      const parsed = createConversationSessionResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Invalid conversation session response.");
      }

      const mapped = mapConversationCreateResponse(parsed.data);
      const now = new Date().toISOString();
      const normalizedSessionTitle = normalizeSessionTitle(mapped.title);

      setConversationSessionsWithCache((previous) =>
        upsertConversationSession(previous, {
          sessionId: mapped.sessionId,
          brandId: mapped.brandId,
          adAccountId: mapped.adAccountId,
          title: normalizedSessionTitle,
          lastMessageRole: null,
          lastMessagePreview: null,
          lastMessageAt: null,
          createdAt: now,
          updatedAt: now,
        })
      );

      if (normalizedSessionTitle) {
        setSessionTitleById((previous) => ({
          ...previous,
          [mapped.sessionId]: normalizedSessionTitle,
        }));
      }

      return mapped;
    },
    [adAccountId, brandProfileId, setConversationSessionsWithCache]
  );

  const loadConversationSession = React.useCallback(
    async (targetSessionId: string, options?: { silent?: boolean }) => {
      if (!adAccountId) return;

      setIsConversationSwitching(true);
      try {
        const payload = await fetchConversationHistory(targetSessionId);
        if (!payload) return;

        reset();
        processedToolResultIdsRef.current.clear();
        processedCanvasEnvelopeKeysRef.current.clear();
        persistedAssistantResponseIdsRef.current.clear();
        setActiveResponseId(null);
        setQueuedMessages([]);
        setEditingQueueMessageId(null);
        setQueueEditDraft("");
        queueDispatchInFlightRef.current = false;
        setSessionId(targetSessionId);
        setConversationSessionsWithCache(sortConversationSessions(payload.sessions));
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of payload.sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });
        const sessionTitleForTarget = normalizeSessionTitle(
          payload.sessions?.find((s) => s.sessionId === targetSessionId)?.title ?? null
        ) ?? undefined;
        const mappedMessages = (payload.messages ?? []).map((msg) =>
          mapConversationMessageToChatMessage(msg, sessionTitleForTarget)
        );
        setMessages(mappedMessages);
        setShaderState(mappedMessages.length > 0 ? "hidden" : "visible");
        void hydrateConversationMessagesFromRuns({
          targetSessionId,
          baseMessages: mappedMessages,
        });
      } catch (error) {
        if (!options?.silent) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load conversation history.";
          show({
            title: "History unavailable",
            description: message,
            variant: "error",
          });
        }
      } finally {
        setIsConversationSwitching(false);
      }
    },
    [
      adAccountId,
      fetchConversationHistory,
      hydrateConversationMessagesFromRuns,
      reset,
      setConversationSessionsWithCache,
      show,
    ]
  );

  const refreshConversationSnapshot = React.useCallback(
    async (targetSessionId: string) => {
      if (!adAccountId) return;
      try {
        const payload = await fetchConversationHistory(targetSessionId);
        if (!payload) return;
        setConversationSessionsWithCache(sortConversationSessions(payload.sessions));
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of payload.sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });
        if (payload.messages) {
          const sessionTitleForTarget = normalizeSessionTitle(
            payload.sessions?.find((s) => s.sessionId === targetSessionId)?.title ?? null
          ) ?? undefined;
          const mappedMessages = payload.messages.map((msg) =>
            mapConversationMessageToChatMessage(msg, sessionTitleForTarget)
          );
          setMessages((previous) =>
            mergePersistedMessagesWithLocal(mappedMessages, previous)
          );
          setShaderState(mappedMessages.length > 0 ? "hidden" : "visible");
          void hydrateConversationMessagesFromRuns({
            targetSessionId,
            baseMessages: mappedMessages,
          });
        }
      } catch {
        // Silent polling refresh; keep existing UI state when sync fails.
      }
    },
    [
      adAccountId,
      fetchConversationHistory,
      hydrateConversationMessagesFromRuns,
      setConversationSessionsWithCache,
    ]
  );

  React.useEffect(() => {
    if (!activeResponseId) return;

      if (state.plan) {
        updateMessage(activeResponseId, {
          plan: state.plan,
        });

        const sessionTitle = normalizeSessionTitle(state.plan.title);
        if (sessionTitle) {
          setSessionTitleById((previous) => {
            if (previous[sessionId] === sessionTitle) return previous;
            return { ...previous, [sessionId]: sessionTitle };
          });
        }
      }

    if (
      state.status === "streaming" &&
      (state.responseText ||
        state.objectives.length > 0 ||
        state.plan ||
        state.report ||
        state.reportV2 ||
        state.pendingClarification)
    ) {
      const streamingContent = pickRenderableContent({
        sessionTitle: currentSessionTitle,
        pendingClarification: state.pendingClarification,
        responseText: state.responseText,
        report: state.report,
        reportV2: state.reportV2,
        latestCheckpointSummary: state.latestCheckpointSummary,
        checkpointSummarySource: state.checkpointSummarySource,
        plan: state.plan ?? undefined,
        progress: state.progress,
      });
      updateMessage(activeResponseId, {
        content: streamingContent,
        objectives: state.objectives,
        plan: state.plan ?? undefined,
        report: state.report ?? undefined,
        reportV2: state.reportV2 ?? undefined,
        reportAssembly: state.reportAssembly ?? undefined,
      });
    }

    if (state.status === "complete") {
      const completedResponseId = activeResponseId;
      const finalThought = getFinalThought(state.progress);
      const content = pickRenderableContent({
        sessionTitle: currentSessionTitle,
        pendingClarification: state.pendingClarification,
        responseText: state.responseText,
        report: state.report,
        reportV2: state.reportV2,
        latestCheckpointSummary: state.latestCheckpointSummary,
        checkpointSummarySource: state.checkpointSummarySource,
        plan: state.plan ?? undefined,
        progress: state.progress,
      });

      const hasClarificationRequest = Boolean(state.pendingClarification);
      const reportType =
        state.report && typeof state.report === "object" && "type" in state.report
          ? (state.report as { type?: unknown }).type
          : undefined;
      const isDirectAnswer = reportType === "direct_answer";
      const hasReportSignal = resolveReportSignal(state.progress, state.stateDeltas);
      const reportHasContent = hasReportContent(state.report);
      const renderAsReport = !!(
        !hasClarificationRequest &&
        state.report &&
        !isDirectAnswer &&
        reportHasContent &&
        (hasReportSignal || state.finalContentKind === "report")
      );

      updateMessage(completedResponseId, {
        status: "done",
        content,
        report: state.report ?? undefined,
        reportV2: state.reportV2 ?? undefined,
        reportAssembly: state.reportAssembly ?? undefined,
        reportAssemblyHtml: state.reportAssemblyHtml ?? undefined,
        plan: state.plan ?? undefined,
        finalThought,
        renderAsReport,
        reasoning: state.progress,
        toolCalls: state.toolCalls,
        toolResults: state.toolResults,
        artifacts: state.artifacts,
        pendingClarification: state.pendingClarification ?? undefined,
        objectives: state.objectives,
      });

      persistedAssistantResponseIdsRef.current.add(completedResponseId);

      void refreshConversationSnapshot(sessionId);

      setPendingReportArtifactResponseId((current) =>
        current === completedResponseId ? null : current
      );
      setActiveResponseId(null);
    }
    if (state.status === "error" && state.error) {
      const failedResponseId = activeResponseId;
      const reportHasContent = hasReportContent(state.report);
      const safeResponseText = isLikelyStructuredJsonContent(state.responseText)
        ? extractRenderableFallbackFromStructuredContent(state.responseText) || ""
        : state.responseText;
      const reportSummary = resolveReportSummaryForMessage(state.report ?? undefined);
      const checkpointSummary =
        state.checkpointSummarySource !== "default_unavailable"
          ? state.latestCheckpointSummary?.trim() ?? ""
          : "";
      const finalThought = getFinalThought(state.progress);
      const derivedErrorContent =
        reportSummary ||
        checkpointSummary ||
        safeResponseText ||
        state.pendingClarification?.question ||
        finalThought ||
        "";
      updateMessage(failedResponseId, (previousMessage) => ({
        status: "error",
        content:
          derivedErrorContent ||
          (!isStreamingPlaceholderMessage(previousMessage.content) &&
          previousMessage.content.trim().length > 0
            ? previousMessage.content
            : state.error || previousMessage.content),
        title: "Jaina error",
        report: state.report ?? undefined,
        reportV2: state.reportV2 ?? undefined,
        reportAssembly: state.reportAssembly ?? undefined,
        reportAssemblyHtml: state.reportAssemblyHtml ?? undefined,
        plan: state.plan ?? undefined,
        renderAsReport: reportHasContent,
        reasoning: state.progress,
        toolCalls: state.toolCalls,
        toolResults: state.toolResults,
        artifacts: state.artifacts,
        pendingClarification: state.pendingClarification ?? undefined,
        objectives: state.objectives,
      }));

      persistedAssistantResponseIdsRef.current.add(failedResponseId);
      void refreshConversationSnapshot(sessionId);

      setPendingReportArtifactResponseId((current) =>
        current === failedResponseId ? null : current
      );
      setActiveResponseId(null);
    }
  }, [
    activeResponseId,
    currentSessionTitle,
    refreshConversationSnapshot,
    sessionId,
    show,
    state.artifacts,
    state.checkpointSummarySource,
    state.error,
    state.finalContentKind,
    state.latestCheckpointSummary,
    state.lastEventType,
    state.objectives,
    state.pendingClarification,
    state.plan,
    state.progress,
    state.report,
    state.reportV2,
    state.reportAssembly,
    state.reportAssemblyHtml,
    state.responseText,
    state.stateDeltas,
    state.status,
    state.toolCalls,
    state.toolResults,
    updateMessage,
  ]);

  React.useEffect(() => {
    if (state.toolResults.length === 0 && state.canvasActions.length === 0) return;

    const envelopesToApply: Array<
      ReturnType<typeof extractCampaignCanvasActionsEnvelope>
    > = [];

    for (const toolResult of state.toolResults) {
      if (processedToolResultIdsRef.current.has(toolResult.id)) {
        continue;
      }
      processedToolResultIdsRef.current.add(toolResult.id);

      if (!toolResult.ok || !toolResult.output) {
        continue;
      }

      const envelope = extractCampaignCanvasActionsEnvelope(toolResult.output);
      if (envelope) {
        envelopesToApply.push(envelope);
      }
    }

    for (const envelope of state.canvasActions) {
      envelopesToApply.push(envelope);
    }

    for (const envelope of envelopesToApply) {
      if (!envelope) continue;

      const envelopeKey = JSON.stringify({
        brandId: envelope.brandId,
        userId: envelope.userId,
        sessionId: envelope.sessionId,
        actions: envelope.actions,
      });
      if (processedCanvasEnvelopeKeysRef.current.has(envelopeKey)) {
        continue;
      }
      processedCanvasEnvelopeKeysRef.current.add(envelopeKey);

      const hasBrandMatch = envelope.brandId === brandProfileId;
      if (!hasBrandMatch) {
        continue;
      }

      const normalizedEnvelopeUserId = normalizeIdentity(envelope.userId);
      const normalizedSessionUserId = normalizeIdentity(userId);
      const hasUserMatch =
        !normalizedSessionUserId ||
        !normalizedEnvelopeUserId ||
        normalizedEnvelopeUserId === normalizedSessionUserId;
      if (!hasUserMatch) {
        console.warn(
          "Applying canvas action envelope despite userId mismatch",
          envelope.userId,
          userId
        );
      }

      for (const action of envelope.actions) {
        processAIAction(action);
      }
      if (envelope.actions.length > 0) {
        onCanvasActionApplied?.();
      }

      show({
        title: "Canvas updated by Jaina",
        description: `${envelope.actions.length} change(s) applied to this session.`,
        variant: "success",
      });
    }
  }, [
    brandProfileId,
    onCanvasActionApplied,
    processAIAction,
    show,
    state.canvasActions,
    state.toolResults,
    userId,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function bootstrapHistory() {
      if (!adAccountId) {
        setConversationSessions([]);
        setShaderState("visible");
        return;
      }

      reset();
      setMessages([]);
      setActiveResponseId(null);
      setQueuedMessages([]);
      setEditingQueueMessageId(null);
      setQueueEditDraft("");
      setIsJainaProMode(false);
      setPendingReportArtifactResponseId(null);
      setReportArtifactJob(null);
      queueDispatchInFlightRef.current = false;
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();
      processedReportArtifactJobIdsRef.current.clear();
      persistedAssistantResponseIdsRef.current.clear();
      setIsHistoryLoading(true);

      try {
        const cachedSessions = getFreshConversationSessionsFromCache();
        const sessions =
          cachedSessions ??
          sortConversationSessions((await fetchConversationHistory())?.sessions ?? []);
        if (cancelled) return;

        setConversationSessionsWithCache(sessions);
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });

        const mostRecentSessionId = sessions[0]?.sessionId;
        if (!mostRecentSessionId) {
          setSessionId(createJainaSessionId());
          setMessages([]);
          setQueuedMessages([]);
          setShaderState("visible");
          return;
        }

        setSessionId(mostRecentSessionId);
        const conversationPayload = await fetchConversationHistory(mostRecentSessionId);
        if (!conversationPayload || cancelled) return;
        setConversationSessionsWithCache(
          sortConversationSessions(conversationPayload.sessions)
        );
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of conversationPayload.sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });
        const sessionTitleForTarget = normalizeSessionTitle(
          conversationPayload.sessions?.find((s) => s.sessionId === mostRecentSessionId)?.title ?? null
        ) ?? undefined;
        const mappedMessages = (conversationPayload.messages ?? []).map((msg) =>
          mapConversationMessageToChatMessage(msg, sessionTitleForTarget)
        );
        setMessages(mappedMessages);
        setShaderState(mappedMessages.length > 0 ? "hidden" : "visible");
        void hydrateConversationMessagesFromRuns({
          targetSessionId: mostRecentSessionId,
          baseMessages: mappedMessages,
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load conversation history.";
        show({
          title: "History unavailable",
          description: message,
          variant: "error",
        });
        setSessionId(createJainaSessionId());
        setQueuedMessages([]);
        setShaderState("visible");
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    }

    void bootstrapHistory();

    return () => {
      cancelled = true;
    };
  }, [
    adAccountId,
    fetchConversationHistory,
    getFreshConversationSessionsFromCache,
    hydrateConversationMessagesFromRuns,
    reset,
    setConversationSessionsWithCache,
    show,
  ]);

  React.useEffect(() => {
    if (!adAccountId) return;

    const topic = `jaina:conversations:${brandProfileId}:${adAccountId}`;
    const channel = supabase.channel(topic, {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on(
        "broadcast",
        { event: "conversation_updated" },
        ({ payload }: { payload: Record<string, unknown> }) => {
          if (streamBusyRef.current) return;

          const payloadSessionId =
            typeof payload.sessionId === "string" ? payload.sessionId : null;
          const currentSessionId = activeSessionIdRef.current;

          if (payloadSessionId && payloadSessionId !== currentSessionId) {
            void fetchConversationHistory()
              .then((history) => {
                if (!history) return;
                setConversationSessionsWithCache(
                  sortConversationSessions(history.sessions)
                );
              })
              .catch(() => {});
            return;
          }

          void refreshConversationSnapshot(currentSessionId);
        }
      )
      .subscribe();

    conversationChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      if (conversationChannelRef.current === channel) {
        conversationChannelRef.current = null;
      }
    };
  }, [
    adAccountId,
    brandProfileId,
    fetchConversationHistory,
    refreshConversationSnapshot,
    setConversationSessionsWithCache,
    supabase,
  ]);

  const dispatchMessage = React.useCallback(
    async (input: {
      query: string;
      canvas: boolean;
      clarificationId?: string;
      images?: Array<{ url: string; name?: string }>;
      references?: AgentMentionReference[];
      planAction?: JainaPlanAction;
      forceReportArtifact?: boolean;
      silentUserMessage?: boolean;
    }) => {
      const query = input.query.trim();
      if (!query) return false;

      if (!adAccountId) {
        show({
          title: "Select an ad account",
          description: "Jaina needs an ad account context.",
          variant: "warning",
        });
        return false;
      }

      const now = new Date().toISOString();
      let activeSessionId = sessionId;

      try {
        const ensuredSession = await ensureConversationSession(sessionId);
        if (ensuredSession?.sessionId) {
          activeSessionId = ensuredSession.sessionId;
          if (ensuredSession.sessionId !== sessionId) {
            setSessionId(ensuredSession.sessionId);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to initialize conversation session.";
        show({
          title: "Conversation setup failed",
          description: message,
          variant: "error",
        });
        return false;
      }

      const userMessage: JainaChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: query,
        createdAt: now,
        ...(input.references && input.references.length > 0
          ? { metadata: { references: input.references } }
          : {}),
      };

      const assistantMessage: JainaChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: input.clarificationId
          ? "Processing your clarification…"
          : "Thinking through your request…",
        createdAt: now,
        status: "streaming",
        title: "Jaina Analyst",
      };

      if (shaderState === "visible") {
        setShaderState("sweeping");
      }

      setMessages((prev) =>
        input.silentUserMessage
          ? [...prev, assistantMessage]
          : [...prev, userMessage, assistantMessage]
      );
      setConversationSessionsWithCache((previous) =>
        upsertConversationSession(previous, {
          sessionId: activeSessionId,
          brandId: brandProfileId,
          adAccountId,
          title: normalizeSessionTitle(sessionTitleById[activeSessionId]) ?? null,
          lastMessageRole: "user",
          lastMessagePreview: query,
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        })
      );
      setActiveResponseId(assistantMessage.id);
      if (input.forceReportArtifact) {
        setPendingReportArtifactResponseId(assistantMessage.id);
        setReportArtifactJob(null);
      }
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();

      void start({
        query,
        canvas: input.canvas || Boolean(campaignCanvasPayload),
        adAccountId,
        brandId: brandProfileId,
        sessionId: activeSessionId,
        clarificationId: input.clarificationId,
        userId: userId ?? undefined,
        images: input.images,
        references: input.references,
        planAction: input.planAction,
        forceReportArtifact: input.forceReportArtifact,
      }).then((result) => {
        if (result.error) {
          if (input.forceReportArtifact) {
            setPendingReportArtifactResponseId(null);
          }
          show({
            title: "Request failed",
            description: result.error,
            variant: "error",
          });
        }
      });

      return true;
    },
    [
      adAccountId,
      brandProfileId,
      campaignCanvasPayload,
      ensureConversationSession,
      sessionId,
      sessionTitleById,
      shaderState,
      show,
      start,
      setConversationSessionsWithCache,
      userId,
    ]
  );

  const queueMessageForLater = React.useCallback(
    (input: {
      query: string;
      canvas: boolean;
      clarificationId?: string;
      references?: AgentMentionReference[];
      forceReportArtifact?: boolean;
    }) => {
      const content = input.query.trim();
      if (!content) return;
      const queuedMessage: QueuedJainaMessage = {
        id: createQueuedMessageId(),
        content,
        createdAt: new Date().toISOString(),
        canvas: input.canvas,
        ...(input.references && input.references.length > 0
          ? { references: input.references }
          : {}),
        ...(input.forceReportArtifact
          ? { forceReportArtifact: input.forceReportArtifact }
          : {}),
        ...(input.clarificationId ? { clarificationId: input.clarificationId } : {}),
      };
      setQueuedMessages((previous) => enqueueMessage(previous, queuedMessage));
    },
    []
  );

  const handleSubmit = React.useCallback(
    async (
      query: string,
      attachments?: Attachment[],
      references: AgentMentionReference[] = []
    ) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) return;

      const images = attachments
        ?.filter((a) => Boolean(a.url))
        .map((a) => ({ url: a.url as string, name: a.name }));

      const pendingPlanId = findPendingPlanId(messages);

      const input = {
        query: normalizedQuery,
        canvas: false,
        clarificationId: pendingClarificationId,
        ...(references.length > 0 ? { references } : {}),
        forceReportArtifact: isJainaProMode,
        ...(images && images.length > 0 ? { images } : {}),
        ...(pendingPlanId
          ? {
              planAction: {
                type: "refine" as const,
                plan_id: pendingPlanId,
                edits: normalizedQuery,
              },
            }
          : {}),
      };

      const shouldQueue = shouldQueueSubmission({
        isStreaming,
        activeResponseId,
      });
      if (shouldQueue) {
        queueMessageForLater(input);
        if (isJainaProMode) {
          setIsJainaProMode(false);
        }
        return;
      }

      const started = await dispatchMessage(input);
      if (started && isJainaProMode) {
        setIsJainaProMode(false);
      }
    },
    [
      activeResponseId,
      dispatchMessage,
      queueMessageForLater,
      isJainaProMode,
      isStreaming,
      messages,
      pendingClarificationId,
    ]
  );

  const handleQueueEditStart = React.useCallback((message: QueuedJainaMessage) => {
    setEditingQueueMessageId(message.id);
    setQueueEditDraft(message.content);
  }, []);

  const handleQueueEditCancel = React.useCallback(() => {
    setEditingQueueMessageId(null);
    setQueueEditDraft("");
  }, []);

  const handleQueueEditSave = React.useCallback(() => {
    if (!editingQueueMessageId) return;
    const trimmedDraft = queueEditDraft.trim();
    if (!trimmedDraft) return;

    setQueuedMessages((previous) =>
      updateQueuedMessageContent(previous, editingQueueMessageId, trimmedDraft)
    );
    setEditingQueueMessageId(null);
    setQueueEditDraft("");
  }, [editingQueueMessageId, queueEditDraft]);

  const handleQueueRemove = React.useCallback(
    (queueMessageId: string) => {
      setQueuedMessages((previous) =>
        removeQueuedMessage(previous, queueMessageId)
      );
      if (editingQueueMessageId === queueMessageId) {
        setEditingQueueMessageId(null);
        setQueueEditDraft("");
      }
    },
    [editingQueueMessageId]
  );

  React.useEffect(() => {
    if (isHistoryLoading || isConversationSwitching) return;
    if (isStreaming || activeResponseId) return;
    if (queuedMessages.length === 0) return;
    if (queueDispatchInFlightRef.current) return;

    const nextQueuedMessage = queuedMessages[0];
    if (!nextQueuedMessage) return;

    queueDispatchInFlightRef.current = true;

    void (async () => {
      const started = await dispatchMessage({
        query: nextQueuedMessage.content,
        canvas: nextQueuedMessage.canvas,
        clarificationId: nextQueuedMessage.clarificationId,
        references: nextQueuedMessage.references,
        forceReportArtifact: nextQueuedMessage.forceReportArtifact,
      });

      if (started) {
        setQueuedMessages((previous) =>
          removeQueuedMessage(previous, nextQueuedMessage.id)
        );
        if (editingQueueMessageId === nextQueuedMessage.id) {
          setEditingQueueMessageId(null);
          setQueueEditDraft("");
        }
      }

      queueDispatchInFlightRef.current = false;
    })();
  }, [
    activeResponseId,
    dispatchMessage,
    editingQueueMessageId,
    isConversationSwitching,
    isHistoryLoading,
    isStreaming,
    queuedMessages,
  ]);

  const handleClearConversation = React.useCallback(() => {
    if (isStreaming) {
      cancel();
    }
    reset();
    setMessages([]);
    setActiveResponseId(null);
    setQueuedMessages([]);
    setEditingQueueMessageId(null);
    setQueueEditDraft("");
    setIsJainaProMode(false);
    setPendingReportArtifactResponseId(null);
    setReportArtifactJob(null);
    queueDispatchInFlightRef.current = false;
    setSessionId(createJainaSessionId());
    setShaderState("visible");
    processedToolResultIdsRef.current.clear();
    processedCanvasEnvelopeKeysRef.current.clear();
    processedReportArtifactJobIdsRef.current.clear();
    persistedAssistantResponseIdsRef.current.clear();
  }, [cancel, isStreaming, reset]);

  const handleSelectConversation = React.useCallback(
    async (targetSessionId: string) => {
      if (targetSessionId === sessionId) return;
      if (isStreaming) {
        show({
          title: "Stop current response first",
          description: "Finish or stop the current stream before switching chats.",
          variant: "warning",
        });
        return;
      }
      await loadConversationSession(targetSessionId);
    },
    [isStreaming, loadConversationSession, sessionId, show]
  );

  const handleDeleteConversation = React.useCallback(
    async (targetSessionId: string) => {
      if (!adAccountId) return;
      if (isStreaming && targetSessionId === sessionId) {
        show({
          title: "Stop current response first",
          description: "Finish or stop the current stream before deleting this chat.",
          variant: "warning",
        });
        return;
      }

      setDeletingSessionId(targetSessionId);
      try {
        const response = await fetch(
          `/api/agents/jaina/chat/conversations/${encodeURIComponent(targetSessionId)}`,
          {
            method: "DELETE",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          const detail = await readErrorMessage(
            response,
            "Failed to delete conversation."
          );
          throw new Error(detail);
        }

        const remainingSessions = sortConversationSessions(
          conversationSessions.filter(
            (conversationSession) => conversationSession.sessionId !== targetSessionId
          )
        );
        setConversationSessionsWithCache(remainingSessions);
        setSessionTitleById((previous) => {
          const next = { ...previous };
          delete next[targetSessionId];
          return next;
        });

        if (targetSessionId === sessionId) {
          const nextSessionId = remainingSessions[0]?.sessionId;
          if (nextSessionId) {
            await loadConversationSession(nextSessionId);
          } else {
            reset();
            setMessages([]);
            setActiveResponseId(null);
            setQueuedMessages([]);
            setEditingQueueMessageId(null);
            setQueueEditDraft("");
            setIsJainaProMode(false);
            setPendingReportArtifactResponseId(null);
            setReportArtifactJob(null);
            queueDispatchInFlightRef.current = false;
            setSessionId(createJainaSessionId());
            setShaderState("visible");
            processedToolResultIdsRef.current.clear();
            processedCanvasEnvelopeKeysRef.current.clear();
            processedReportArtifactJobIdsRef.current.clear();
            persistedAssistantResponseIdsRef.current.clear();
          }
        }

        show({
          title: "Conversation deleted",
          description: "This chat and its associated run history were removed.",
          variant: "success",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete conversation.";
        show({
          title: "Delete failed",
          description: message,
          variant: "error",
        });
      } finally {
        setDeletingSessionId((current) =>
          current === targetSessionId ? null : current
        );
      }
    },
    [
      adAccountId,
      conversationSessions,
      isStreaming,
      loadConversationSession,
      reset,
      sessionId,
      setConversationSessionsWithCache,
      show,
    ]
  );

  React.useEffect(() => {
    if (prefersReducedMotion || shaderState === "hidden") {
      setShaderReady(false);
      return;
    }

    const idleHandle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(() => setShaderReady(true), { timeout: 1200 })
        : setTimeout(() => setShaderReady(true), 800);

    return () => {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleHandle as number);
      } else {
        clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, [prefersReducedMotion, shaderState]);

  const handlePlanFeedback = React.useCallback(
    async (payload: PlanFeedbackPayload) => {
      const nextStatus =
        payload.type === "approve"
          ? "approved"
          : payload.type === "abandon"
            ? "rejected"
            : "awaiting_approval";

      setMessages((prev) =>
        prev.map((msg) =>
          msg.plan && msg.plan.id === payload.planId
            ? { ...msg, plan: { ...msg.plan, status: nextStatus } }
            : msg
        )
      );

      const queryByType: Record<PlanFeedbackPayload["type"], string> = {
        approve: "approved",
        abandon: "abandoned",
        refine: "refine plan",
      };

      await dispatchMessage({
        query: queryByType[payload.type],
        canvas: false,
        planAction: {
          type: payload.type,
          plan_id: payload.planId,
          ...(payload.type === "refine" ? { edits: payload.edits } : {}),
        },
        silentUserMessage: payload.type !== "refine",
      });
    },
    [dispatchMessage]
  );

  const handleClearMemory = React.useCallback(async () => {
    if (!adAccountId) return;
    try {
      await clearMemory(adAccountId);
      show({
        title: "Memory cleared",
        description: "Jaina will start fresh for this ad account.",
        variant: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to clear memory.";
      show({ title: "Clear failed", description: message, variant: "error" });
    }
  }, [clearMemory, adAccountId, show]);

  const handleFocusInput = React.useCallback(() => {
    const textarea = promptInputWrapperRef.current?.querySelector("textarea");
    textarea?.focus();
    textarea?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  React.useEffect(() => {
    if (pendingClarificationId) {
      const textarea = promptInputWrapperRef.current?.querySelector("textarea");
      textarea?.focus();
    }
  }, [pendingClarificationId]);

  const isInputDisabled = isHistoryLoading || isConversationSwitching;
  const isQueueStreaming = isStreaming || Boolean(activeResponseId);
  const canStartQueuedNow =
    !isQueueStreaming && !isHistoryLoading && !isConversationSwitching;
  const hasPendingReportArtifactRequest =
    Boolean(pendingReportArtifactResponseId) &&
    Boolean(activeResponseId) &&
    pendingReportArtifactResponseId === activeResponseId &&
    isStreaming &&
    !reportArtifactJob;
  const reportArtifactStatusLabel =
    reportArtifactJob?.status === "done"
      ? "Ready"
      : reportArtifactJob?.status === "failed"
        ? "Failed"
        : reportArtifactJob?.status === "running"
          ? "Generating"
          : reportArtifactJob?.status === "pending"
            ? "Queued"
            : hasPendingReportArtifactRequest
              ? "Starting"
              : isJainaProMode
                ? "Pro on"
                : "Pro";
  const reportArtifactTooltip =
    reportArtifactJob?.status === "done"
      ? "Open generated Jaina Pro report"
      : reportArtifactJob?.status === "failed"
        ? reportArtifactJob.error ?? "Jaina Pro report failed"
        : reportArtifactJob
          ? `Jaina Pro report ${reportArtifactJob.status}`
          : "Create a Jaina Pro report from this analysis";
  const reportArtifactButtonDisabled =
    isInputDisabled ||
    hasPendingReportArtifactRequest ||
    reportArtifactJob?.status === "pending" ||
    reportArtifactJob?.status === "running" ||
    isReportArtifactDownloading;
  const ReportArtifactButtonIcon =
    hasPendingReportArtifactRequest ||
    reportArtifactJob?.status === "pending" ||
    reportArtifactJob?.status === "running" ||
    isReportArtifactDownloading
      ? Loader2Icon
      : reportArtifactJob?.status === "done"
        ? DownloadIcon
        : FileTextIcon;

  if (!adAccountId) {
    return <JainaEmptyState adAccountId={null} />;
  }

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background/70 backdrop-blur-xl",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-background/80" />
      <AnimatePresence initial={false}>
        {shaderState !== "hidden" ? (
          <motion.div
            key={shaderState}
            className="pointer-events-none absolute inset-0 z-0 origin-left"
            initial={{ opacity: 0.68, scaleX: 1, x: 0 }}
            animate={
              shaderState === "sweeping"
                ? { opacity: 0, scaleX: 0.02, x: 96 }
                : { opacity: 0.68, scaleX: 1, x: 0 }
            }
            transition={
              shaderState === "sweeping"
                ? {
                    duration: prefersReducedMotion ? 0.12 : 0.82,
                    ease: [0.16, 1, 0.3, 1],
                  }
                : { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }
            }
          >
            {shaderReady ? <AnimatedShaderBackground intensity={1} /> : null}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.08),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.12),transparent_50%)]" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <JainaHeader
        brandName={brandName}
        adAccountId={adAccountId}
        campaignId={campaignId}
        onClearMemory={handleClearMemory}
        onClearConversation={handleClearConversation}
        onStop={cancel}
        isStreaming={state.status === "streaming"}
      />

      <div className="relative z-0 flex min-h-0 flex-1 flex-col md:flex-row">
        <JainaConversationSidebar
          sessions={conversationSessions}
          activeSessionId={sessionId}
          sessionTitleById={sessionTitleById}
          isLoading={isHistoryLoading}
          isInteractionDisabled={
            isStreaming || isConversationSwitching || Boolean(deletingSessionId)
          }
          deletingSessionId={deletingSessionId}
          onCreateConversation={handleClearConversation}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <Conversation>
              <ConversationContent>
                {isConversationSwitching ? (
                  <ConversationSkeleton />
                ) : null}

                {!isConversationSwitching && messages.length === 0 && (
                  <JainaEmptyState
                    adAccountId={adAccountId}
                    onExampleClick={(q) => handleSubmit(q)}
                  />
                )}

                <AnimatePresence mode="popLayout">
                  {messages.map((message, index) => {
                    const precedingUserMessage =
                      message.role === "assistant"
                        ? [...messages].slice(0, index).reverse().find((m) => m.role === "user")
                        : undefined;
                    return (
                      <JainaMessageItem
                        key={message.id}
                        message={message}
                        activeResponseId={activeResponseId}
                        state={state}
                        onSuggestionClick={handleSubmit}
                        onPlanFeedback={handlePlanFeedback}
                        onFocusInput={handleFocusInput}
                        onRegenerate={
                          precedingUserMessage
                            ? () => handleSubmit(precedingUserMessage.content)
                            : undefined
                        }
                      />
                    );
                  })}
                </AnimatePresence>
              </ConversationContent>
            </Conversation>
          </div>

          <div ref={promptInputWrapperRef} className="shrink-0">
            <Box px="2" py="2" className="sm:px-3">
              {queuedMessages.length > 0 ? (
                <div className="mx-auto mb-2 w-full max-w-[1600px] px-1 sm:px-2">
                  <Queue className="border-border/70 bg-card/80 shadow-none">
                    <QueueSection defaultOpen>
                      <QueueSectionTrigger>
                        <QueueSectionLabel
                          count={queuedMessages.length}
                          label="queued messages"
                        />
                        <span className="text-xs text-muted-foreground">
                          {isQueueStreaming ? "waiting for current response" : "next will send now"}
                        </span>
                      </QueueSectionTrigger>
                      <QueueSectionContent className="pt-2">
                        <QueueList className="h-[120px]">
                          {queuedMessages.map((queuedMessage, index) => {
                            const isEditing = editingQueueMessageId === queuedMessage.id;
                            return (
                              <QueueItem key={queuedMessage.id}>
                                <div className="flex items-start gap-2">
                                  <QueueItemIndicator completed={false} />
                                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    {isEditing ? (
                                      <TextArea
                                        size="2"
                                        value={queueEditDraft}
                                        onChange={(event) => setQueueEditDraft(event.target.value)}
                                        className="min-h-[74px] resize-none"
                                        aria-label="Edit queued message"
                                      />
                                    ) : (
                                      <QueueItemContent>{queuedMessage.content}</QueueItemContent>
                                    )}
                                    <div className="text-[11px] text-muted-foreground/90">
                                      #{index + 1} in queue
                                      {queuedMessage.canvas ? " • plan mode" : ""}
                                      {queuedMessage.forceReportArtifact ? " • Jaina Pro" : ""}
                                      {queuedMessage.clarificationId ? " • clarification" : ""}
                                    </div>
                                  </div>
                                  <QueueItemActions>
                                    {isEditing ? (
                                      <>
                                        <QueueItemAction
                                          aria-label="Save queued message"
                                          onClick={handleQueueEditSave}
                                        >
                                          <SaveIcon className="size-3.5" />
                                        </QueueItemAction>
                                        <QueueItemAction
                                          aria-label="Cancel queued message edit"
                                          onClick={handleQueueEditCancel}
                                        >
                                          <XIcon className="size-3.5" />
                                        </QueueItemAction>
                                      </>
                                    ) : (
                                      <>
                                        {index === 0 && canStartQueuedNow ? (
                                          <QueueItemAction
                                            aria-label="Send queued message now"
                                            onClick={() => {
                                              if (queueDispatchInFlightRef.current) return;
                                              queueDispatchInFlightRef.current = true;
                                              void (async () => {
                                                const started = await dispatchMessage({
                                                  query: queuedMessage.content,
                                                  canvas: queuedMessage.canvas,
                                                  clarificationId: queuedMessage.clarificationId,
                                                  references: queuedMessage.references,
                                                  forceReportArtifact:
                                                    queuedMessage.forceReportArtifact,
                                                });
                                                if (started) {
                                                  setQueuedMessages((previous) =>
                                                    removeQueuedMessage(
                                                      previous,
                                                      queuedMessage.id
                                                    )
                                                  );
                                                }
                                                queueDispatchInFlightRef.current = false;
                                              })();
                                            }}
                                          >
                                            <PlayIcon className="size-3.5" />
                                          </QueueItemAction>
                                        ) : null}
                                        <QueueItemAction
                                          aria-label="Edit queued message"
                                          onClick={() => handleQueueEditStart(queuedMessage)}
                                        >
                                          <Edit2Icon className="size-3.5" />
                                        </QueueItemAction>
                                        <QueueItemAction
                                          aria-label="Remove queued message"
                                          onClick={() => handleQueueRemove(queuedMessage.id)}
                                        >
                                          <Trash2Icon className="size-3.5" />
                                        </QueueItemAction>
                                      </>
                                    )}
                                  </QueueItemActions>
                                </div>
                              </QueueItem>
                            );
                          })}
                        </QueueList>
                      </QueueSectionContent>
                    </QueueSection>
                  </Queue>
                </div>
              ) : null}

              <div data-tour-id="paid-jaina-chat">
              <PromptInput
                onSubmit={(value, attachments, references) =>
                  handleSubmit(value, attachments, references)
                }
                disabled={isInputDisabled}
                mentionProvider={jainaMentionProvider}
                placeholder={pendingClarificationId ? "Reply to Jaina's question…" : "Ask Jaina anything…"}
                actions={
                  <TooltipProvider delayDuration={180}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="1"
                          variant={
                            isJainaProMode || reportArtifactJob ? "solid" : "soft"
                          }
                          color={
                            reportArtifactJob?.status === "failed"
                              ? "red"
                              : isJainaProMode || reportArtifactJob
                                ? "violet"
                                : "gray"
                          }
                          disabled={reportArtifactButtonDisabled}
                          aria-pressed={isJainaProMode}
                          aria-label={reportArtifactTooltip}
                          onClick={handleReportArtifactAction}
                          className="gap-1.5"
                        >
                          <ReportArtifactButtonIcon
                            className={cn(
                              "size-3.5",
                              (hasPendingReportArtifactRequest ||
                                reportArtifactJob?.status === "pending" ||
                                reportArtifactJob?.status === "running" ||
                                isReportArtifactDownloading) &&
                                "animate-spin"
                            )}
                          />
                          {reportArtifactStatusLabel}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {reportArtifactTooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                }
              />
              </div>
            </Box>
          </div>
        </div>
      </div>
    </div>
  );
}
