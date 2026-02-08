"use client";

import React from "react";
import { Box } from "@radix-ui/themes";

import { useToast } from "@/components/ui/ToastProvider";
import { useJainaChatStream } from "@/hooks/useJainaChatStream";
import { Conversation } from "@/components/ai-elements/conversation";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { type Attachment } from "@/components/ai-elements/attachments";
import type { JainaChatMessage } from "./types";

import { JainaHeader } from "./components/JainaHeader";
import { JainaEmptyState } from "./components/JainaEmptyState";
import { JainaMessageItem } from "./components/JainaMessageItem";

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
    if (adAccountId) {
      reset();
      setMessages([]);
      setActiveResponseId(null);
    }
  }, [adAccountId, reset]);

  React.useEffect(() => {
    if (!activeResponseId) return;
    if (state.status === "complete" && state.report) {
      let content = "";
      if ("executive_summary" in state.report) {
        content = state.report.executive_summary;
      } else if (state.report.type === "direct_answer") {
        content = state.report.content;
      }

      updateMessage(activeResponseId, {
        status: "done",
        content: content,
        report: state.report,
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
  ]);

  const handleSubmit = React.useCallback(
    async (query: string, attachments: Attachment[]) => {
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
        content: "Building your paid media report…",
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
          title: "Stream failed",
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
    if (!adAccountId) {
      show({
        title: "Select an ad account",
        description: "Choose an ad account before clearing memory.",
        variant: "warning",
      });
      return;
    }
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
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.12),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.16),transparent_50%)]" />

      <JainaHeader
        brandName={brandName}
        campaignId={campaignId}
        onClearMemory={handleClearMemory}
        onClearConversation={handleClearConversation}
        onStop={cancel}
        isStreaming={state.status === "streaming"}
      />

      <div className="relative z-0 flex-1 min-h-0">
        <Conversation>
          {messages.length === 0 && (
            <JainaEmptyState
              adAccountId={adAccountId}
              onExampleClick={handleSubmit}
            />
          )}

          {messages.map((message) => (
            <JainaMessageItem
              key={message.id}
              message={message}
              activeResponseId={activeResponseId}
              state={state}
            />
          ))}
        </Conversation>
      </div>

      <Box p="4" className="relative z-10">
        <PromptInput
          onSubmit={handleSubmit}
          disabled={state.status === "streaming"}
          placeholder="Analyze performance..."
        />
      </Box>
    </div>
  );
}
