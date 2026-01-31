"use client";

import React from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  Badge,
} from "@radix-ui/themes";
import { Cross2Icon, ResetIcon, RocketIcon } from "@radix-ui/react-icons";

import { useToast } from "@/components/ui/ToastProvider";
import { useJainaChatStream } from "@/hooks/useJainaChatStream";
import { Conversation } from "@/components/ai-elements/conversation";
import { Message } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { JainaReportView } from "./JainaReportView";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import type { JainaChatMessage } from "./types";

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
  campaignId 
}: JainaChatSurfaceProps) {
  const { show } = useToast();
  const { state, start, cancel, reset, clearMemory } = useJainaChatStream();

  const [messages, setMessages] = React.useState<JainaChatMessage[]>([]);
  const [activeResponseId, setActiveResponseId] = React.useState<string | null>(null);

  const updateMessage = React.useCallback((id: string, update: Partial<JainaChatMessage>) => {
    setMessages((prev) => prev.map((msg) => (msg.id === id ? { ...msg, ...update } : msg)));
  }, []);

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
      updateMessage(activeResponseId, {
        status: "done",
        content: state.report.executive_summary,
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
      });
      setActiveResponseId(null);
    }
  }, [activeResponseId, state.status, state.report, state.error, updateMessage, state.progress, state.toolCalls, state.toolResults]);

  const handleSubmit = React.useCallback(
    async (query: string) => {
      if (!adAccountId) {
        show({ title: "Select an ad account", description: "Jaina needs an ad account context.", variant: "warning" });
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
        show({ title: "Stream failed", description: result.error, variant: "error" });
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
      show({ title: "Select an ad account", description: "Choose an ad account before clearing memory.", variant: "warning" });
      return;
    }
    try {
      await clearMemory(adAccountId);
      show({ title: "Memory cleared", description: "Jaina will start fresh for this ad account.", variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to clear memory.";
      show({ title: "Clear failed", description: message, variant: "error" });
    }
  }, [clearMemory, adAccountId, show]);

  if (!adAccountId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-indigo-50 p-4 dark:bg-indigo-950/30">
          <RocketIcon className="h-8 w-8 text-indigo-500" />
        </div>
        <div className="space-y-1">
          <Heading size="4">Select an Ad Account</Heading>
          <Text color="gray">Choose an ad account above to start analyzing with Jaina.</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.12),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.16),transparent_50%)]" />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <Flex align="center" gap="2">
            <Heading size="4">Jaina Analyst</Heading>
            {campaignId && <Badge variant="soft" color="blue">Campaign Context</Badge>}
          </Flex>
          <Text size="2" className="text-secondary">
            Streaming performance intelligence for <span className="text-primary font-medium">{brandName}</span>
          </Text>
        </div>

        <Flex align="center" gap="2">
          <Button variant="soft" color="gray" size="1" onClick={handleClearMemory}>
            <ResetIcon />
            Reset Memory
          </Button>
          <Button variant="soft" color="gray" size="1" onClick={handleClearConversation}>
            <Cross2Icon />
            Clear
          </Button>
          {state.status === "streaming" && (
            <Button variant="solid" color="red" size="1" onClick={cancel}>
              Stop
            </Button>
          )}
        </Flex>
      </header>

      <div className="relative z-0 flex-1 min-h-0">
        <Conversation>
          {messages.length === 0 && (
            <Flex direction="column" gap="2" className="mt-20 items-center justify-center text-center">
              <div className="rounded-full bg-purple-500/10 p-4 mb-2">
                 <RocketIcon className="h-8 w-8 text-purple-400" />
              </div>
              <Heading size="5" className="text-white">How can Jaina help today?</Heading>
              <Text size="2" className="text-gray-400 max-w-sm">
                Ask about campaign performance, creative ROAS, or budget optimizations.
              </Text>
              <Flex gap="2" mt="4" wrap="wrap" justify="center">
                {[
                    "Which creatives improved ROAS week-over-week?",
                    "Summarize spend shifts and recommend budget moves.",
                    "What audiences are declining?"
                ].map(s => (
                    <button 
                        key={s}
                        onClick={() => handleSubmit(s)}
                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-secondary hover:bg-white/10 transition-colors"
                    >
                        {s}
                    </button>
                ))}
              </Flex>
            </Flex>
          )}
          
          {messages.map((message) => {
            const isStreaming = message.id === activeResponseId;
            const reasoning = isStreaming ? state.progress : message.reasoning;
            const toolCalls = isStreaming ? state.toolCalls : message.toolCalls;
            const toolResults = isStreaming ? state.toolResults : message.toolResults;
            const report = isStreaming ? state.report : message.report;

            return (
              <Message key={message.id} role={message.role}>
                <div className="space-y-4">
                  {message.role === "user" ? (
                    <Text size="2" className="font-medium">
                      {message.content}
                    </Text>
                  ) : (
                    <>
                      <SafeMarkdown content={message.content} className="text-[15px] text-white" mode="static" />

                      <div className="mt-4 space-y-3">
                        {reasoning && reasoning.length > 0 && (
                          <Reasoning defaultOpen={isStreaming} isStreaming={isStreaming}>
                            <ReasoningTrigger>Jaina thoughts</ReasoningTrigger>
                            <ReasoningContent>
                              <Flex direction="column" gap="2">
                                {reasoning.map((entry, index) => (
                                  <Flex key={`${entry.stage}-${index}`} align="center" gap="2">
                                    <Badge color="blue" variant="soft" size="1">
                                      {entry.stage}
                                    </Badge>
                                    <Text size="1" className="text-gray-400">
                                      {entry.detail ?? "Working…"}
                                    </Text>
                                  </Flex>
                                ))}
                              </Flex>
                            </ReasoningContent>
                          </Reasoning>
                        )}

                        {toolCalls && toolCalls.length > 0 && (
                          <div className="space-y-2">
                            {toolCalls.map((call) => {
                              const result = toolResults?.find((r) => r.id === call.id);
                              const toolState = result ? (result.ok ? "output-available" : "error") : "running";
                              return (
                                <Tool key={call.id} type={call.name} state={toolState as any}>
                                  <ToolHeader title={call.name.replace(/_/g, " ")} />
                                  <ToolContent>
                                    <ToolInput value={call.args} />
                                    {result && <ToolOutput value={result.output ?? result.error} />}
                                  </ToolContent>
                                </Tool>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {report && (
                        <div className="mt-6 border-t border-white/10 pt-6">
                          <JainaReportView report={report} status={isStreaming ? state.status : "complete"} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Message>
            );
          })}
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
