"use client";

import React from "react";
import { Box, Flex, Text, Badge } from "@radix-ui/themes";
import { motion, AnimatePresence } from "framer-motion";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { useJainaSocket } from "./useJainaSocket";
import { JainaHeader } from "../components/JainaHeader";
import { JainaEmptyState } from "../components/JainaEmptyState";
import { JainaSocketMessageItem } from "./JainaSocketMessageItem";
import type { JainaChatMessage } from "../types";

type JainaSocketSurfaceProps = {
  brandProfileId: string;
  brandName: string;
  adAccountId: string | null;
  campaignId?: string | null;
};

export function JainaSocketSurface({
  brandProfileId,
  brandName,
  adAccountId,
  campaignId,
}: JainaSocketSurfaceProps) {
  const { state, socketStatus, sendPrompt, sendFeedback, reset } = useJainaSocket(
    brandProfileId,
    adAccountId
  );

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

  const handleFeedback = React.useCallback((feedback: string, planId: string) => {
    sendFeedback(feedback, planId);
  }, [sendFeedback]);

  React.useEffect(() => {
    if (state.status === "complete" && state.report && activeResponseId) {
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
  }, [state.status, state.report, state.progress, state.toolCalls, state.toolResults, activeResponseId, updateMessage]);

  const handleSubmit = React.useCallback(
    async (query: string) => {
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
        content: "Processing request...",
        createdAt: now,
        status: "streaming",
        title: "Jaina Analyst",
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setActiveResponseId(assistantMessage.id);
      
      sendPrompt(query, { adAccountId, campaignId });
    },
    [adAccountId, campaignId, sendPrompt]
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/20 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.08),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.12),transparent_50%)]" />

      <JainaHeader
        brandName={brandName}
        campaignId={campaignId}
        onClearMemory={() => {}} 
        onClearConversation={() => {
            setMessages([]);
            reset();
        }}
        onStop={() => {}}
        isStreaming={state.status === "streaming"}
      />
      
      <Flex align="center" gap="2" className="px-4 pb-2">
        <Badge 
          variant="soft" 
          color={
            socketStatus === "connected" ? "green" : 
            socketStatus === "connecting" ? "amber" : "red"
          }
        >
          <div className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
            socketStatus === "connected" ? "bg-green-500" : 
            socketStatus === "connecting" ? "bg-amber-500 animate-pulse" : "bg-red-500"
          }`} />
          {socketStatus.charAt(0).toUpperCase() + socketStatus.slice(1)}
        </Badge>
      </Flex>

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
                <JainaSocketMessageItem
                  key={message.id}
                  message={message}
                  activeResponseId={activeResponseId}
                  state={state}
                  onFeedback={handleFeedback}
                />
              ))}
            </AnimatePresence>
          </ConversationContent>
        </Conversation>
      </div>

      <Box p="4" className="relative z-10">
        <PromptInput
          onSubmit={(v) => handleSubmit(v)}
          disabled={socketStatus !== "connected" || state.status === "streaming"}
          placeholder={socketStatus === "connected" ? "Ask Jaina anything..." : "Waiting for connection..."}
        />
      </Box>
    </div>
  );
}
