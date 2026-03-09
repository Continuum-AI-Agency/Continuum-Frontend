"use client";

import React from "react";
import { Box, Button } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { AnimatedShaderBackground } from "@/components/ui/animated-shader-background";
import { useToast } from "@/components/ui/ToastProvider";
import { useJainaChatStream } from "@/hooks/useJainaChatStream";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";
import type { JainaChatMessage } from "./types";

import { JainaHeader } from "./components/JainaHeader";
import { JainaEmptyState } from "./components/JainaEmptyState";
import { JainaMessageItem } from "./components/JainaMessageItem";
import { JainaConversationSidebar } from "./components/JainaConversationSidebar";
import { getFinalThought, getReportSummary, resolveReportSignal, hasReportContent } from "./jainaUtils";
import type { CampaignCanvasPayload } from "@/lib/campaign-canvas/payload";
import { useCampaignAI } from "@/CampaignCanvas/hooks/useCampaignAI";
import { extractCampaignCanvasActionsEnvelope } from "@/lib/campaign-canvas/agent-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createConversationSessionResponseSchema,
  jainaConversationListResponseSchema,
  mapConversationCreateResponse,
  type JainaConversationMessage,
  type JainaConversationSession,
} from "@/lib/jaina/conversations";
import {
  reportAssemblySchema,
  reportPayloadSchema,
} from "@/lib/jaina/schemas";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function createJainaSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `jaina-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

  const firstSectionSummary = report.sections.find((section) =>
    Boolean(section.summary?.trim())
  )?.summary;
  if (firstSectionSummary) return firstSectionSummary;

  const firstRecommendation = report.strategic_recommendations[0];
  if (firstRecommendation?.title) {
    return firstRecommendation.rationale
      ? `${firstRecommendation.title}: ${firstRecommendation.rationale}`
      : firstRecommendation.title;
  }

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

function extractJsonObjectCandidate(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const firstBraceIndex = trimmed.indexOf("{");
  const lastBraceIndex = trimmed.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    const sliced = trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
    if (sliced !== trimmed) candidates.push(sliced);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return null;
}

function parsePersistedReport(
  message: JainaConversationMessage
): JainaChatMessage["report"] | undefined {
  const direct = reportPayloadSchema.safeParse(message.report);
  if (direct.success) return direct.data;

  const embedded = extractJsonObjectCandidate(message.content);
  const embeddedReport = reportPayloadSchema.safeParse(embedded);
  if (embeddedReport.success) return embeddedReport.data;

  return undefined;
}

function parsePersistedReportAssembly(
  message: JainaConversationMessage
): JainaChatMessage["reportAssembly"] | undefined {
  const parsed = reportAssemblySchema.safeParse(message.reportAssembly);
  return parsed.success ? parsed.data : undefined;
}

function mapConversationMessageToChatMessage(
  message: JainaConversationMessage
): JainaChatMessage {
  const persistedReport = parsePersistedReport(message);
  const persistedReportAssembly = parsePersistedReportAssembly(message);
  const content =
    persistedReport && isFallbackCheckpointMessage(message.content)
      ? resolveReportSummaryForMessage(persistedReport) || message.content
      : message.content;

  return {
    id: `persisted-${message.id}`,
    role: message.role,
    content,
    createdAt: message.createdAt,
    ...(persistedReport ? { report: persistedReport } : {}),
    ...(persistedReportAssembly ? { reportAssembly: persistedReportAssembly } : {}),
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
    ...(Array.isArray(message.objectives)
      ? { objectives: message.objectives as JainaChatMessage["objectives"] }
      : {}),
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

function mergePersistedMessagesWithLocal(
  persistedMessages: JainaChatMessage[],
  localMessages: JainaChatMessage[]
): JainaChatMessage[] {
  if (persistedMessages.length === 0 || localMessages.length === 0) {
    return persistedMessages;
  }

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
    if (
      candidate.report ||
      candidate.reportAssembly ||
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
  if (!isFallbackCheckpointMessage(persistedAssistant.content)) {
    return persistedMessages;
  }

  const mergedMessages = [...persistedMessages];
  mergedMessages[persistedAssistantIndex] = {
    ...persistedAssistant,
    content: localAssistant.content || persistedAssistant.content,
    finalThought: localAssistant.finalThought ?? persistedAssistant.finalThought,
    renderAsReport: localAssistant.renderAsReport ?? persistedAssistant.renderAsReport,
    reasoning: localAssistant.reasoning ?? persistedAssistant.reasoning,
    toolCalls: localAssistant.toolCalls ?? persistedAssistant.toolCalls,
    toolResults: localAssistant.toolResults ?? persistedAssistant.toolResults,
    report: localAssistant.report ?? persistedAssistant.report,
    reportAssembly: localAssistant.reportAssembly ?? persistedAssistant.reportAssembly,
    reportAssemblyHtml:
      localAssistant.reportAssemblyHtml ?? persistedAssistant.reportAssemblyHtml,
    artifacts: localAssistant.artifacts ?? persistedAssistant.artifacts,
    pendingClarification:
      localAssistant.pendingClarification ?? persistedAssistant.pendingClarification,
    objectives: localAssistant.objectives ?? persistedAssistant.objectives,
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
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const prefersReducedMotion = useReducedMotion();

  const { state, start, cancel, reset, clearMemory, approvePlan } = useJainaChatStream();
  const isStreaming = state.status === "streaming" || state.status === "starting";

  const [isPlanMode, setIsPlanMode] = React.useState(false);
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
  const [isHistoryLoading, setIsHistoryLoading] = React.useState(false);
  const [isConversationSwitching, setIsConversationSwitching] = React.useState(false);
  const [deletingSessionId, setDeletingSessionId] = React.useState<string | null>(null);
  const [activeResponseId, setActiveResponseId] = React.useState<string | null>(null);
  const processedToolResultIdsRef = React.useRef<Set<string>>(new Set());
  const processedCanvasEnvelopeKeysRef = React.useRef<Set<string>>(new Set());
  const persistedAssistantResponseIdsRef = React.useRef<Set<string>>(new Set());
  const conversationChannelRef = React.useRef<RealtimeChannel | null>(null);
  const activeSessionIdRef = React.useRef(sessionId);
  const streamBusyRef = React.useRef(false);

  React.useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  React.useEffect(() => {
    streamBusyRef.current = isStreaming || Boolean(activeResponseId);
  }, [activeResponseId, isStreaming]);

  React.useEffect(() => {
    if (shaderState !== "sweeping") return;
    const timeoutMs = prefersReducedMotion ? 80 : 820;
    const timer = window.setTimeout(() => {
      setShaderState("hidden");
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion, shaderState]);

  const updateMessage = React.useCallback(
    (id: string, update: Partial<JainaChatMessage>) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === id ? { ...msg, ...update } : msg))
      );
    },
    []
  );

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

      setConversationSessions((previous) =>
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
    [adAccountId, brandProfileId]
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
        setSessionId(targetSessionId);
        setConversationSessions(sortConversationSessions(payload.sessions));
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
        const mappedMessages = (payload.messages ?? []).map(
          mapConversationMessageToChatMessage
        );
        setMessages(mappedMessages);
        setShaderState(mappedMessages.length > 0 ? "hidden" : "visible");
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
    [adAccountId, fetchConversationHistory, reset, show]
  );

  const refreshConversationSnapshot = React.useCallback(
    async (targetSessionId: string) => {
      if (!adAccountId) return;
      try {
        const payload = await fetchConversationHistory(targetSessionId);
        if (!payload) return;
        setConversationSessions(sortConversationSessions(payload.sessions));
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
          const mappedMessages = payload.messages.map(mapConversationMessageToChatMessage);
          setMessages((previous) =>
            mergePersistedMessagesWithLocal(mappedMessages, previous)
          );
          setShaderState(mappedMessages.length > 0 ? "hidden" : "visible");
        }
      } catch {
        // Silent polling refresh; keep existing UI state when sync fails.
      }
    },
    [adAccountId, fetchConversationHistory]
  );

  React.useEffect(() => {
    if (!activeResponseId) return;

      if (state.plan) {
        updateMessage(activeResponseId, {
          plan: state.plan,
        });

        const sessionTitle = normalizeSessionTitle(state.plan.title);
        if (sessionTitle) {
          setSessionTitleById((previous) => ({
            ...previous,
            [sessionId]: sessionTitle,
          }));
        }
      }

    if (state.status === "streaming" && (state.responseText || state.objectives.length > 0)) {
      const shouldPreferReport =
        state.finalContentKind === "report" || Boolean(state.report);
      if (shouldPreferReport) {
        updateMessage(activeResponseId, {
          content: "Building checkpoint report…",
          objectives: state.objectives,
        });
      } else {
        const isJsonStart = state.responseText.trim().startsWith("{");
        updateMessage(activeResponseId, {
          content:
            isJsonStart
              ? "Generating analysis..."
              : state.responseText || "Working through objectives…",
          objectives: state.objectives,
        });
      }
    }

    if (state.status === "complete") {
      const completedResponseId = activeResponseId;
      const finalThought = getFinalThought(state.progress);
      const reportSummary = resolveReportSummaryForMessage(state.report ?? undefined);
      const checkpointSummary =
        state.checkpointSummarySource !== "default_unavailable"
          ? state.latestCheckpointSummary?.trim() ?? ""
          : "";
      const resolvedSummary = reportSummary || checkpointSummary;
      const hasClarificationRequest = Boolean(state.pendingClarification);

      const reportType =
        state.report && typeof state.report === "object" && "type" in state.report
          ? (state.report as { type?: unknown }).type
          : undefined;
      const isDirectAnswer = reportType === "direct_answer";
      const shouldPreferReport =
        !hasClarificationRequest &&
        !isDirectAnswer &&
        (state.finalContentKind === "report" ||
          (Boolean(state.report) && state.lastEventType === "response.content_part.done"));
      const content = shouldPreferReport
        ? resolvedSummary || "Report ready."
        : state.responseText ||
          state.pendingClarification?.question ||
          finalThought ||
          resolvedSummary ||
          "Response ready.";

      const hasReportSignal = resolveReportSignal(state.progress, state.stateDeltas);
      const reportHasContent = hasReportContent(state.report);
      const renderAsReport = !!(
        !hasClarificationRequest &&
        state.report &&
        !isDirectAnswer &&
        reportHasContent &&
        (hasReportSignal || shouldPreferReport)
      );

      updateMessage(completedResponseId, {
        status: "done",
        content,
        report: state.report ?? undefined,
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

      setActiveResponseId(null);
    }
    if (state.status === "error" && state.error) {
      const failedResponseId = activeResponseId;
      updateMessage(failedResponseId, {
        status: "error",
        content: state.error,
        title: "Jaina error",
        reportAssembly: state.reportAssembly ?? undefined,
        reportAssemblyHtml: state.reportAssemblyHtml ?? undefined,
        plan: state.plan ?? undefined,
        reasoning: state.progress,
        toolCalls: state.toolCalls,
        toolResults: state.toolResults,
        artifacts: state.artifacts,
        objectives: state.objectives,
      });

      persistedAssistantResponseIdsRef.current.add(failedResponseId);

      setActiveResponseId(null);
    }
  }, [
    activeResponseId,
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
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();
      persistedAssistantResponseIdsRef.current.clear();
      setIsHistoryLoading(true);

      try {
        const sessionsPayload = await fetchConversationHistory();
        if (!sessionsPayload || cancelled) return;

        const sessions = sortConversationSessions(sessionsPayload.sessions);
        setConversationSessions(sessions);
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
          setShaderState("visible");
          return;
        }

        setSessionId(mostRecentSessionId);
        const conversationPayload = await fetchConversationHistory(mostRecentSessionId);
        if (!conversationPayload || cancelled) return;
        setConversationSessions(sortConversationSessions(conversationPayload.sessions));
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
        const mappedMessages = (conversationPayload.messages ?? []).map(
          mapConversationMessageToChatMessage
        );
        setMessages(mappedMessages);
        setShaderState(mappedMessages.length > 0 ? "hidden" : "visible");
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
  }, [adAccountId, fetchConversationHistory, reset, show]);

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
                setConversationSessions(sortConversationSessions(history.sessions));
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
    supabase,
  ]);

  const handleSubmit = React.useCallback(
    async (query: string) => {
      if (!adAccountId) {
        show({
          title: "Select an ad account",
          description: "Jaina needs an ad account context.",
          variant: "warning",
        });
        return;
      }

      const now = new Date().toISOString();
      const clarificationId = pendingClarificationId;
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
        return;
      }

      const userMessage: JainaChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: query,
        createdAt: now,
      };

      const assistantMessage: JainaChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: clarificationId
          ? "Processing your clarification…"
          : "Thinking through your request…",
        createdAt: now,
        status: "streaming",
        title: "Jaina Analyst",
      };

      if (shaderState === "visible") {
        setShaderState("sweeping");
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setConversationSessions((previous) =>
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
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();

      const result = await start({
        query,
        canvas: isPlanMode || Boolean(campaignCanvasPayload),
        adAccountId,
        brandId: brandProfileId,
        sessionId: activeSessionId,
        clarificationId,
        userId: userId ?? undefined,
        campaignCanvas: campaignCanvasPayload ?? undefined,
      });

      if (result.error) {
        show({
          title: "Request failed",
          description: result.error,
          variant: "error",
        });
      }
    },
    [
      adAccountId,
      brandProfileId,
      campaignCanvasPayload,
      isPlanMode,
      pendingClarificationId,
      ensureConversationSession,
      sessionId,
      sessionTitleById,
      shaderState,
      show,
      start,
      userId,
    ]
  );

  const handleClearConversation = React.useCallback(() => {
    if (isStreaming) {
      cancel();
    }
    reset();
    setMessages([]);
    setActiveResponseId(null);
    setSessionId(createJainaSessionId());
    setShaderState("visible");
    processedToolResultIdsRef.current.clear();
    processedCanvasEnvelopeKeysRef.current.clear();
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
        setConversationSessions(remainingSessions);
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
            setSessionId(createJainaSessionId());
            setShaderState("visible");
            processedToolResultIdsRef.current.clear();
            processedCanvasEnvelopeKeysRef.current.clear();
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
      show,
    ]
  );

  const handlePlanFeedback = React.useCallback(
    async (payload: { planId: string; approved: boolean; reason?: string }) => {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.plan && msg.plan.id === payload.planId) {
            return {
              ...msg,
              plan: {
                ...msg.plan,
                status: payload.approved ? "approved" : "rejected",
              },
            };
          }
          return msg;
        })
      );

      const result = await approvePlan(payload);
      if (result.error) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.plan && msg.plan.id === payload.planId) {
              return {
                ...msg,
                plan: {
                  ...msg.plan,
                  status: "awaiting_approval",
                },
              };
            }
            return msg;
          })
        );
        show({
          title: "Plan decision failed",
          description: result.error,
          variant: "error",
        });
        return;
      }

      const statusLabel = payload.approved ? "approved" : "rejected";
      show({
        title: "Plan decision sent",
        description: `Plan ${statusLabel}.`,
        variant: payload.approved ? "success" : "warning",
      });
    },
    [approvePlan, show]
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

  if (!adAccountId) {
    return <JainaEmptyState adAccountId={null} />;
  }

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/70 backdrop-blur-xl",
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
            <AnimatedShaderBackground intensity={1} />
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

        <div className="min-h-0 min-w-0 flex-1">
          <Conversation>
            <ConversationContent>
              {isConversationSwitching ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  Loading conversation…
                </div>
              ) : null}

              {!isConversationSwitching && messages.length === 0 && (
                <JainaEmptyState
                  adAccountId={adAccountId}
                  onExampleClick={(q) => handleSubmit(q)}
                />
              )}

              <AnimatePresence mode="popLayout">
                {messages.map((message) => (
                  <JainaMessageItem
                    key={message.id}
                    message={message}
                    activeResponseId={activeResponseId}
                    state={state}
                    onSuggestionClick={handleSubmit}
                    onPlanFeedback={handlePlanFeedback}
                  />
                ))}
              </AnimatePresence>
            </ConversationContent>
          </Conversation>
        </div>
      </div>

      <Box p="4" className="relative z-10">
        <PromptInput
          onSubmit={(value) => handleSubmit(value)}
          disabled={isStreaming || isHistoryLoading || isConversationSwitching}
          placeholder="Ask Jaina anything..."
          actions={
            <Button
              type="button"
              size="1"
              variant={isPlanMode ? "solid" : "soft"}
              color={isPlanMode ? "amber" : "gray"}
              disabled={isStreaming || isHistoryLoading || isConversationSwitching}
              aria-pressed={isPlanMode}
              onClick={() => setIsPlanMode((prev) => !prev)}
            >
              Plan
            </Button>
          }
        />
      </Box>
    </div>
  );
}
