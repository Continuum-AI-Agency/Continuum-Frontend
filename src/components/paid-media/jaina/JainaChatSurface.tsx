"use client";

import React from "react";
import { Box, Button } from "@radix-ui/themes";
import { AnimatePresence } from "framer-motion";

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

function mapConversationMessageToChatMessage(
  message: JainaConversationMessage
): JainaChatMessage {
  return {
    id: `persisted-${message.id}`,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(message.role === "assistant"
      ? {
          status: "done",
          title: "Jaina Analyst",
        }
      : {}),
  };
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
  const [isHistoryLoading, setIsHistoryLoading] = React.useState(false);
  const [isConversationSwitching, setIsConversationSwitching] = React.useState(false);
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
        setMessages((payload.messages ?? []).map(mapConversationMessageToChatMessage));
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
          setMessages(payload.messages.map(mapConversationMessageToChatMessage));
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
      const reportSummary = getReportSummary(state.report);
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
        ? reportSummary || "Report ready."
        : state.responseText ||
          state.pendingClarification?.question ||
          finalThought ||
          reportSummary ||
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
    state.error,
    state.finalContentKind,
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
        setMessages(
          (conversationPayload.messages ?? []).map(mapConversationMessageToChatMessage)
        );
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.08),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.12),transparent_50%)]" />

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
          isInteractionDisabled={isStreaming || isConversationSwitching}
          onCreateConversation={handleClearConversation}
          onSelectConversation={handleSelectConversation}
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
