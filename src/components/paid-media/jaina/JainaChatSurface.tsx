"use client";

import React from "react";
import { Box } from "@radix-ui/themes";
import { AnimatePresence } from "framer-motion";

import { useToast } from "@/components/ui/ToastProvider";
import { useJainaChatStream } from "@/hooks/useJainaChatStream";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import type { JainaChatMessage } from "./types";

import { JainaHeader } from "./components/JainaHeader";
import { JainaEmptyState } from "./components/JainaEmptyState";
import { JainaMessageItem } from "./components/JainaMessageItem";
import { getFinalThought, getReportSummary, resolveReportSignal } from "./jainaUtils";

type JainaChatSurfaceProps = {
  brandProfileId: string;
  brandName: string;
  adAccountId: string | null;
  campaignId?: string | null;
};

export function JainaChatSurface({
  brandProfileId,
  brandName,
  adAccountId,
  campaignId,
}: JainaChatSurfaceProps) {
  const { show } = useToast();
  
  const { state, start, cancel, reset, clearMemory } = useJainaChatStream();

  const [messages, setMessages] = React.useState<JainaChatMessage[]>([]);
  const [activeResponseId, setActiveResponseId] = React.useState<string | null>(
    null
  );

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
    if (state.status === "complete") {
      const finalThought = getFinalThought(state.progress);
      const reportSummary = getReportSummary(state.report);
      const content = finalThought || reportSummary || "Response ready.";
      const renderAsReport = state.report
        ? resolveReportSignal(state.progress, state.stateDeltas)
        : false;
      updateMessage(activeResponseId, {
        status: "done",
        content,
        report: state.report ?? undefined,
        finalThought,
        renderAsReport,
        reasoning: state.progress,
        toolCalls: state.toolCalls,
        toolResults: state.toolResults,
      });
      setActiveResponseId(null);
    }
    if (state.status === "error" && state.error) {
      updateMessage(activeResponseId, {
        status: "error",
        content: state.error,
        title: "Jaina error",
        reasoning: state.progress,
        toolCalls: state.toolCalls,
        toolResults: state.toolResults,
      });
      setActiveResponseId(null);
    }
  }, [
    activeResponseId,
    state.status,
    state.report,
    state.error,
    updateMessage,
    state.progress,
    state.toolCalls,
    state.toolResults,
    state.stateDeltas,
  ]);

  React.useEffect(() => {
    if (adAccountId) {
      reset();
      setMessages([]);
      setActiveResponseId(null);
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

      const result = await start({
        query: query,
        adAccountId: adAccountId,
        brandId: brandProfileId,
      });

      if (result.error) {
        show({
          title: "Request failed",
          description: result.error,
          variant: "error",
        });
      }
    },
    [brandProfileId, adAccountId, show, start]
  );

  const handleClearConversation = React.useCallback(() => {
    reset();
    setMessages([]);
    setActiveResponseId(null);
  }, [reset]);

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
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20 backdrop-blur-xl">
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
        />
      </Box>
    </div>
  );
}
