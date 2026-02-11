"use client";

import React from "react";
import { Text } from "@radix-ui/themes";
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
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { JainaReportView } from "../JainaReportView";
import type { JainaChatMessage } from "../types";
import type { JainaStreamState } from "@/lib/jaina/stream";
import { formatStageLabel, formatToolLabel } from "../jainaUtils";

import { Agent, AgentContent, AgentHeader } from "@/components/ai-elements/agent";
import { Checkpoint } from "@/components/ai-elements/checkpoint";

function cleanseReasoning(detail: string | undefined): string | undefined {
  if (!detail) return detail;
  try {
    const trimmed = detail.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const parsed = JSON.parse(trimmed);
      return parsed.reasoning ?? parsed.flow ?? parsed.summary ?? detail;
    }
  } catch {}
  return detail;
}

type JainaMessageItemProps = {
  message: JainaChatMessage;
  activeResponseId: string | null;
  state: JainaStreamState;
  onSuggestionClick?: (query: string) => void;
};

export function JainaMessageItem({
  message,
  activeResponseId,
  state,
  onSuggestionClick,
}: JainaMessageItemProps) {
  const isStreaming = message.id === activeResponseId;
  const reasoning = isStreaming ? state.progress : message.reasoning;
  const toolCalls = isStreaming ? state.toolCalls : message.toolCalls;
  const toolResults = isStreaming ? state.toolResults : message.toolResults;
  const report = isStreaming ? state.report : message.report;
  const plan = message.plan;
  const finalThought = message.finalThought;
  const renderAsReport = message.renderAsReport ?? false;
  const displayReasoning = React.useMemo(() => {
    if (!reasoning || !finalThought) return reasoning;
    const lastIndex = [...reasoning]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(
        ({ entry }) =>
          entry.stage === "thinking" && entry.detail === finalThought
      )?.index;
    if (lastIndex === undefined) return reasoning;
    return reasoning.filter((_, index) => index !== lastIndex);
  }, [reasoning, finalThought]);

  return (
    <Message role={message.role}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4 w-full"
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
              {displayReasoning && displayReasoning.length > 0 && (
                <ChainOfThought defaultOpen={isStreaming}>
                  <ChainOfThoughtHeader>Jaina thoughts</ChainOfThoughtHeader>
                  <ChainOfThoughtContent>
                    {displayReasoning.map((entry, index) => {
                      const isToolStep = entry.stage === "tool_start";
                      const isHandoffStep = entry.stage === "handoff_start";
                      const isCheckpoint =
                        entry.stage === "synthesis_start" ||
                        entry.stage === "report_ready";

                      const toolCall = isToolStep
                        ? toolCalls?.find(
                            (tc) =>
                              tc.id === entry.data.tool_call_id ||
                              tc.name === entry.data.tool_name
                          )
                        : null;

                      const toolResult = toolCall
                        ? toolResults?.find((tr) => tr.id === toolCall.id)
                        : null;

                      const toolState = toolResult
                        ? toolResult.ok
                          ? "output-available"
                          : "error"
                        : "running";

                      if (isCheckpoint) {
                        return (
                          <Checkpoint
                            key={`${entry.stage}-${index}`}
                            className="my-4"
                          >
                            <Text size="1" color="gray" weight="bold" className="uppercase tracking-widest">
                              {entry.stage === "report_ready" ? "Final Report Generated" : "Synthesizing Insights"}
                            </Text>
                          </Checkpoint>
                        );
                      }

                      const label = formatStageLabel(entry.stage);

                      return (
                        <ChainOfThoughtStep
                          key={`${entry.stage}-${index}`}
                          status={
                            (entry.stage === "thinking" ||
                              entry.stage === "tool_start") &&
                            isStreaming
                              ? "active"
                              : "complete"
                          }
                          label={
                            entry.stage === "thinking" && isStreaming ? (
                              <Shimmer>{label}</Shimmer>
                            ) : (
                              label
                            )
                          }
                          description={
                            cleanseReasoning(entry.detail) ??
                            (entry.stage === "thinking"
                              ? "Analyzing request..."
                              : "Working…")
                          }
                        >
                          {toolCall && (
                            <div className="mt-2">
                              <Tool type={toolCall.name} state={toolState as any}>
                                <ToolHeader title={formatToolLabel(toolCall.name)} />
                                <ToolContent>
                                  <ToolInput value={toolCall.args} />
                                  {toolResult && (
                                    <ToolOutput
                                      value={
                                        toolResult.output ?? toolResult.error
                                      }
                                    />
                                  )}
                                </ToolContent>
                              </Tool>
                            </div>
                          )}

                          {isHandoffStep && (
                            <div className="mt-2">
                              <Agent className="border-white/10 bg-white/5 shadow-inner">
                                <AgentHeader
                                  name={entry.data.to || "Media Specialist"}
                                />
                                <AgentContent>
                                  <Text size="1" color="gray">
                                    {entry.data.from
                                      ? `Transferring control from ${entry.data.from} to ${entry.data.to}.`
                                      : `Delegating task to ${entry.data.to}.`}
                                  </Text>
                                </AgentContent>
                              </Agent>
                            </div>
                          )}
                        </ChainOfThoughtStep>
                      );
                    })}
                  </ChainOfThoughtContent>
                </ChainOfThought>
              )}

              {plan && (
                <Plan status={plan.status} isStreaming={isStreaming}>
                  <PlanHeader>
                    <PlanTitle>{plan.title}</PlanTitle>
                    <PlanDescription>{plan.description}</PlanDescription>
                    <PlanTrigger />
                  </PlanHeader>
                  <PlanContent>
                    <div className="space-y-4" />
                  </PlanContent>
                </Plan>
              )}

            </div>

            {report &&
            !("type" in report && report.type === "direct_answer") &&
            renderAsReport && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <JainaReportView
                  report={report as any}
                  status={isStreaming ? state.status : "complete"}
                  onSuggestionClick={onSuggestionClick}
                />
              </div>
            )}
          </>
        )}
      </motion.div>
    </Message>
  );
}
