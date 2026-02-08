"use client";

import React from "react";
import { Badge, Flex, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { Message } from "@/components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Spinner } from "@/components/ui/Loading";
import { JainaReportView } from "../JainaReportView";
import type { JainaChatMessage } from "../types";
import type { JainaStreamState } from "@/lib/jaina/stream";

type JainaMessageItemProps = {
  message: JainaChatMessage;
  activeResponseId: string | null;
  state: JainaStreamState;
};

export function JainaMessageItem({
  message,
  activeResponseId,
  state,
}: JainaMessageItemProps) {
  const isStreaming = message.id === activeResponseId;
  const reasoning = isStreaming ? state.progress : message.reasoning;
  const toolCalls = isStreaming ? state.toolCalls : message.toolCalls;
  const toolResults = isStreaming ? state.toolResults : message.toolResults;
  const report = isStreaming ? state.report : message.report;

  return (
    <Message role={message.role}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        {message.role === "user" ? (
          <Text size="2" className="font-medium">
            {message.content}
          </Text>
        ) : (
          <>
            <SafeMarkdown
              content={message.content}
              className="text-[15px] text-white"
              mode="static"
            />

            <div className="mt-4 space-y-3">
              {reasoning && reasoning.length > 0 && (
                <ChainOfThought defaultOpen={isStreaming}>
                  <ChainOfThoughtHeader>Jaina thoughts</ChainOfThoughtHeader>
                  <ChainOfThoughtContent>
                    {reasoning.map((entry, index) => (
                      <ChainOfThoughtStep
                        key={`${entry.stage}-${index}`}
                        status={
                          entry.stage === "thinking"
                            ? isStreaming
                              ? "active"
                              : "complete"
                            : "complete"
                        }
                        label={
                          entry.stage === "thinking"
                            ? "Thinking"
                            : entry.stage
                        }
                        description={
                          entry.detail ??
                          (entry.stage === "thinking"
                            ? "Analyzing request..."
                            : "Working…")
                        }
                      />
                    ))}
                  </ChainOfThoughtContent>
                </ChainOfThought>
              )}

              {toolCalls && toolCalls.length > 0 && (
                <Accordion
                  type="single"
                  collapsible
                  defaultValue={isStreaming ? "tool-calls" : undefined}
                  className="w-full"
                >
                  <AccordionItem value="tool-calls" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-2 px-0 text-gray-400 font-medium text-xs uppercase tracking-wider">
                      <Flex align="center" gap="2">
                        <span>Tool Calls ({toolCalls.length})</span>
                        {isStreaming && <Spinner size={12} />}
                      </Flex>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0">
                      <div className="space-y-2 pt-2">
                        {toolCalls.map((call) => {
                          const result = toolResults?.find(
                            (r) => r.id === call.id
                          );
                          const toolState = result
                            ? result.ok
                              ? "output-available"
                              : "error"
                            : "running";
                          return (
                            <Tool
                              key={call.id}
                              type={call.name}
                              state={toolState as any}
                            >
                              <ToolHeader title={call.name.replace(/_/g, " ")} />
                              <ToolContent>
                                <ToolInput value={call.args} />
                                {result && (
                                  <ToolOutput
                                    value={result.output ?? result.error}
                                  />
                                )}
                              </ToolContent>
                            </Tool>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>

            {report && (
              <div className="mt-6 border-t border-white/10 pt-6">
                {"type" in report && report.type === "direct_answer" ? (
                  <SafeMarkdown
                    content={(report as any).content}
                    className="text-[15px] text-white"
                    mode="static"
                  />
                ) : (
                  <JainaReportView
                    report={report as any}
                    status={isStreaming ? state.status : "complete"}
                  />
                )}
              </div>
            )}
          </>
        )}
      </motion.div>
    </Message>
  );
}
