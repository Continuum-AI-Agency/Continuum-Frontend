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
import { getFinalThought, getReportSummary, resolveReportSignal, hasReportContent } from "./jainaUtils";
import type { CampaignCanvasPayload } from "@/lib/campaign-canvas/payload";
import { useCampaignAI } from "@/CampaignCanvas/hooks/useCampaignAI";
import { extractCampaignCanvasActionsEnvelope } from "@/lib/campaign-canvas/agent-actions";

type JainaChatSurfaceProps = {
  brandProfileId: string;
  brandName: string;
  adAccountId: string | null;
  campaignId?: string | null;
  campaignCanvasPayload?: CampaignCanvasPayload | null;
  userId?: string | null;
  className?: string;
};

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function JainaChatSurface({
  brandProfileId,
  brandName,
  adAccountId,
  campaignId,
  campaignCanvasPayload,
  userId,
  className,
}: JainaChatSurfaceProps) {
  const { show } = useToast();
  const { processAIAction } = useCampaignAI();

  const { state, start, cancel, reset, clearMemory, approvePlan } = useJainaChatStream();
  const [isPlanMode, setIsPlanMode] = React.useState(false);

  const [messages, setMessages] = React.useState<JainaChatMessage[]>([]);
  const [activeResponseId, setActiveResponseId] = React.useState<string | null>(
    null
  );
  const processedToolResultIdsRef = React.useRef<Set<string>>(new Set());
  const processedCanvasEnvelopeKeysRef = React.useRef<Set<string>>(new Set());

  const updateMessage = React.useCallback(
    (id: string, update: Partial<JainaChatMessage>) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === id ? { ...msg, ...update } : msg))
      );
    },
    []
  );

  React.useEffect(() => {
    if (!activeResponseId) return;

    if (state.plan) {
      updateMessage(activeResponseId, {
        plan: state.plan,
      });
    }

    if (state.status === "streaming" && state.responseText) {
      const isJsonStart = state.responseText.trim().startsWith("{");
      updateMessage(activeResponseId, {
        content: isJsonStart ? "Generating analysis..." : state.responseText,
      });
    }

    if (state.status === "complete") {
      const finalThought = getFinalThought(state.progress);
      const reportSummary = getReportSummary(state.report);
      
      // If we have streaming text, prefer that as the content, unless a structured report summary overrides it
      let content = state.responseText || finalThought || reportSummary || "Response ready.";
      
      // Special case: If the streaming text looks like a raw JSON report, we might want to hide it 
      // and show the summary instead. But for now, we assume text delta is conversational.
      if (typeof content === 'string' && content.trim().startsWith('{') && state.report) {
         content = reportSummary || "Report generated.";
      }

      const reportType =
        state.report && typeof state.report === "object" && "type" in state.report
          ? (state.report as { type?: unknown }).type
          : undefined;
      const isDirectAnswer = reportType === "direct_answer";
      const hasReportSignal = resolveReportSignal(state.progress, state.stateDeltas);
      const reportHasContent = hasReportContent(state.report);
      const renderAsReport = !!(state.report && !isDirectAnswer && reportHasContent && hasReportSignal);
        
      updateMessage(activeResponseId, {
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
      });
      setActiveResponseId(null);
    }
    if (state.status === "error" && state.error) {
      updateMessage(activeResponseId, {
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
      });
      setActiveResponseId(null);
    }
  }, [
    activeResponseId,
    state.status,
    state.report,
    state.reportAssembly,
    state.reportAssemblyHtml,
    state.error,
    state.plan,
    updateMessage,
    state.progress,
    state.toolCalls,
    state.toolResults,
    state.stateDeltas,
    state.responseText,
    state.artifacts,
  ]);

  React.useEffect(() => {
    if (state.toolResults.length === 0 && state.canvasActions.length === 0) return;

    const envelopesToApply: Array<ReturnType<typeof extractCampaignCanvasActionsEnvelope>> = [];

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

      show({
        title: "Canvas updated by Jaina",
        description: `${envelope.actions.length} change(s) applied to this session.`,
        variant: "success",
      });
    }
  }, [brandProfileId, processAIAction, show, state.canvasActions, state.toolResults, userId]);

  React.useEffect(() => {
    if (adAccountId) {
      reset();
      setMessages([]);
      setActiveResponseId(null);
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();
    }
  }, [adAccountId, reset]);

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
      const userMessage: JainaChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: query,
        createdAt: now,
      };

      const assistantMessage: JainaChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "Thinking through your request…",
        createdAt: now,
        status: "streaming",
        title: "Jaina Analyst",
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setActiveResponseId(assistantMessage.id);
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();

      const result = await start({
        query: query,
        canvas: isPlanMode || Boolean(campaignCanvasPayload),
        adAccountId: adAccountId,
        brandId: brandProfileId,
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
    [brandProfileId, adAccountId, campaignCanvasPayload, isPlanMode, show, start, userId]
  );

  const handleClearConversation = React.useCallback(() => {
    reset();
    setMessages([]);
    setActiveResponseId(null);
    processedToolResultIdsRef.current.clear();
    processedCanvasEnvelopeKeysRef.current.clear();
  }, [reset]);

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
    <div className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20 backdrop-blur-xl", className)}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.12),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.16),transparent_50%)]" />

      <JainaHeader
        brandName={brandName}
        adAccountId={adAccountId}
        campaignId={campaignId}
        onClearMemory={handleClearMemory}
        onClearConversation={handleClearConversation}
        onStop={cancel}
        isStreaming={state.status === "streaming"}
      />

      <div className="relative z-0 flex-1 min-h-0">
        <Conversation>
          <ConversationContent>
            {messages.length === 0 && (
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

      <Box p="4" className="relative z-10">
        <PromptInput
          onSubmit={(v) => handleSubmit(v)}
          disabled={state.status === "streaming"}
          placeholder="Ask Jaina anything..."
          actions={
            <Button
              type="button"
              size="1"
              variant={isPlanMode ? "solid" : "soft"}
              color={isPlanMode ? "amber" : "gray"}
              disabled={state.status === "streaming"}
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
