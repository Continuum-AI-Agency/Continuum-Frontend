"use client";

import React from "react";
import { Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import { CheckCircle2Icon, CircleIcon, Loader2Icon } from "lucide-react";
import { Message } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
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
import { SafeMarkdown } from "@/components/ui/SafeMarkdown";
import { JainaReportView } from "../JainaReportView";
import { CreativeCard } from "./CreativeCard";
import type { JainaChatMessage } from "../types";
import type { JainaProgressEntry, JainaStreamState } from "@/lib/jaina/stream";
import { formatStageLabel, formatToolLabel } from "../jainaUtils";

import { Agent, AgentContent, AgentHeader } from "@/components/ai-elements/agent";
import { Checkpoint } from "@/components/ai-elements/checkpoint";
import {
  frontendSoTReportSchema,
  hasReportContent,
  type CreativeArtifact,
  type ToolResultEventData,
} from "@/lib/jaina/schemas";

function extractCreativeFromToolResult(toolResult: ToolResultEventData): CreativeArtifact | null {
  if (!toolResult.ok || !toolResult.output) return null;
  
  const output = toolResult.output as Record<string, unknown>;
  const creativeDetails = output.creative_details as Record<string, unknown> | undefined;
  
  if (creativeDetails) {
    return {
      id: String(creativeDetails.id || `creative-${Date.now()}`),
      type: "creative",
      url: String(creativeDetails.image_url || ""),
      thumbnail_url: creativeDetails.thumbnail_url ? String(creativeDetails.thumbnail_url) : undefined,
      post_copy: creativeDetails.body ? String(creativeDetails.body) : undefined,
      headline: creativeDetails.title ? String(creativeDetails.title) : undefined,
      description: creativeDetails.name ? String(creativeDetails.name) : undefined,
      call_to_action: creativeDetails.call_to_action_type ? String(creativeDetails.call_to_action_type) : undefined,
    };
  }
  
  if (output.preview_iframe && typeof output.preview_iframe === "string") {
    return {
      id: `preview-${Date.now()}`,
      type: "creative",
      url: "",
      format: "video",
    };
  }
  
  return null;
}

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

function tryParseJsonArray(detail: string): unknown[] | null {
  const trimmed = detail.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  return null;
}

function getProgressValueAsString(data: unknown, key: string): string {
  if (!data || typeof data !== "object") return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolveToolProgressMetadata(entry: JainaProgressEntry) {
  const toolCallId =
    getProgressValueAsString(entry.data, "tool_call_id") ||
    getProgressValueAsString(entry.data, "call_id");
  const toolName = getProgressValueAsString(entry.data, "tool_name");
  return { toolCallId, toolName };
}

function JsonTable({ data }: { data: unknown[] }) {
  if (data.length === 0) return null;
  
  const firstItem = data[0];
  if (typeof firstItem !== "object" || firstItem === null) {
    return <Text size="2" className="text-white/80">{JSON.stringify(data)}</Text>;
  }

  const keys = Object.keys(firstItem as Record<string, unknown>);
  const displayKeys = keys.filter(k => !k.toLowerCase().includes("id") && k !== "metadata");

  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-white/20">
            {displayKeys.map((key) => (
              <th key={key} className="text-left px-2 py-1 text-indigo-400 font-medium">
                {key.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 5).map((item, i) => (
            <tr key={i} className="border-b border-white/10 hover:bg-white/5">
              {displayKeys.map((key) => {
                const value = (item as Record<string, unknown>)[key];
                let displayValue: string;
                if (typeof value === "number") {
                  displayValue = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
                } else if (typeof value === "object" && value !== null) {
                  displayValue = JSON.stringify(value).slice(0, 30);
                } else {
                  displayValue = String(value);
                }
                return (
                  <td key={key} className="px-2 py-1.5 text-white/70 truncate max-w-[150px]">
                    {displayValue}
                  </td>
                );
              })}
            </tr>
          ))}
          {data.length > 5 && (
            <tr>
              <td colSpan={displayKeys.length} className="px-2 py-1 text-white/50 italic">
                +{data.length - 5} more rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

type JainaMessageItemProps = {
  message: JainaChatMessage;
  activeResponseId: string | null;
  state: JainaStreamState;
  onSuggestionClick?: (query: string) => void;
  onPlanFeedback?: (payload: {
    planId: string;
    approved: boolean;
    reason?: string;
  }) => void;
};

export function JainaMessageItem({
  message,
  activeResponseId,
  state,
  onSuggestionClick,
  onPlanFeedback,
}: JainaMessageItemProps) {
  const isStreaming = message.id === activeResponseId;
  const reasoning = isStreaming ? state.progress : message.reasoning;
  const toolCalls = isStreaming ? state.toolCalls : message.toolCalls;
  const toolResults = isStreaming ? state.toolResults : message.toolResults;
  const report = isStreaming ? state.report : message.report;
  const plan = message.plan;
  const renderAsReport = message.renderAsReport ?? false;
  const structuredReport = React.useMemo(() => {
    if (!report || ("type" in report && report.type === "direct_answer")) {
      return null;
    }
    const parsed = frontendSoTReportSchema.safeParse(report);
    return parsed.success ? parsed.data : null;
  }, [report]);
  const shouldRenderReport = Boolean(
    structuredReport && (renderAsReport || hasReportContent(structuredReport))
  );

  const { surfacedThoughts, chainOfThoughtEntries } = React.useMemo(() => {
    if (!reasoning) {
      return { surfacedThoughts: [], chainOfThoughtEntries: [] };
    }
    const surfaced: typeof reasoning = [];
    const cot: typeof reasoning = [];
    for (const entry of reasoning) {
      if (entry.stage === "thinking") {
        surfaced.push(entry);
      } else {
        cot.push(entry);
      }
    }
    return { surfacedThoughts: surfaced, chainOfThoughtEntries: cot };
  }, [reasoning]);

  const toolCallCount = toolCalls?.length ?? 0;
  const artifacts = isStreaming ? state.artifacts : message.artifacts;
  const artifactCreatives = artifacts?.creatives ?? [];
  
  const toolCreatives = React.useMemo(() => {
    const results = isStreaming ? state.toolResults : message.toolResults;
    if (!results) return [];
    return results
      .map(extractCreativeFromToolResult)
      .filter((c): c is CreativeArtifact => c !== null);
  }, [isStreaming, state.toolResults, message.toolResults]);
  
  const allCreatives = [...toolCreatives, ...artifactCreatives];

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
              mode={isStreaming ? "streaming" : "static"}
              isAnimating={isStreaming}
            />

            <div className="mt-4 space-y-3">
              {surfacedThoughts.length > 0 && (
                <div className="space-y-2">
                  {surfacedThoughts.map((entry, index) => {
                    const label = formatStageLabel(entry.stage);
                    const detail = cleanseReasoning(entry.detail);
                    const jsonArray = detail ? tryParseJsonArray(detail) : null;
                    
                    return (
                      <motion.div
                        key={`surfaced-${index}`}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className="text-sm text-muted-foreground border-l-2 border-indigo-500/50 pl-3 py-2"
                      >
                        <Text size="1" className="text-indigo-400 font-medium">
                          {label}
                        </Text>
                        {detail && (
                          jsonArray ? (
                            <JsonTable data={jsonArray} />
                          ) : (
                            <Text size="2" className="block text-white/80 mt-0.5">
                              {detail}
                            </Text>
                          )
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {chainOfThoughtEntries.length > 0 && (
                <ChainOfThought defaultOpen={false} className="border rounded-md bg-muted/20">
                  <ChainOfThoughtHeader className="text-base px-4 py-3">
                    <span className="font-semibold text-foreground/90">Jaina thoughts</span>
                    {toolCallCount > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
                        {toolCallCount} tool{toolCallCount !== 1 ? "s" : ""} called
                      </span>
                    )}
                  </ChainOfThoughtHeader>
                  <ChainOfThoughtContent className="max-h-[300px] overflow-y-auto px-4 pb-4 custom-scrollbar">
                    {chainOfThoughtEntries.map((entry, index) => {
                      const isToolStep =
                        entry.stage === "tool_start" || entry.stage === "tool_complete";
                      const isHandoffStep = entry.stage === "handoff_start";
                      const isCheckpoint =
                        entry.stage === "synthesis_start" ||
                        entry.stage === "report_ready";

                      const prevEntry = index > 0 ? chainOfThoughtEntries[index - 1] : null;
                      const showBreakpoint = prevEntry && prevEntry.stage !== entry.stage;

                      const { toolCallId, toolName } = resolveToolProgressMetadata(entry);

                      const toolCall = isToolStep
                        ? toolCalls?.find(
                            (tc) =>
                              (toolCallId && tc.id === toolCallId) ||
                              (!toolCallId && toolName && tc.name === toolName)
                          )
                        : undefined;

                      const toolResult = toolCall
                        ? toolResults?.find((tr) => tr.id === toolCall.id)
                        : toolResults?.find(
                            (tr) =>
                              (toolCallId && tr.id === toolCallId) ||
                              (!toolCallId && toolName && tr.name === toolName)
                          );

                      const toolState: "output-available" | "error" | "running" = toolResult
                        ? toolResult.ok
                          ? "output-available"
                          : "error"
                        : getProgressValueAsString(entry.data, "error")
                          ? "error"
                          : "running";

                      if (isCheckpoint) {
                        return (
                          <React.Fragment key={`${entry.stage}-${index}`}>
                            {showBreakpoint && <div className="h-px bg-border/40 my-3" />}
                            <Checkpoint className="my-2">
                              <Text size="1" color="gray" weight="bold" className="uppercase tracking-widest">
                                {entry.stage === "report_ready" ? "Final Report Generated" : "Synthesizing Insights"}
                              </Text>
                            </Checkpoint>
                          </React.Fragment>
                        );
                      }

                      const label = formatStageLabel(entry.stage);

                      return (
                        <React.Fragment key={`${entry.stage}-${index}`}>
                           {showBreakpoint && <div className="h-px bg-border/40 my-3" />}
                           <ChainOfThoughtStep
                           status={
                              entry.stage === "tool_start" && isStreaming && toolState === "running"
                                ? "active"
                                : "complete"
                            }
                            label={label}
                            description={
                              cleanseReasoning(entry.detail) ??
                              (isToolStep ? "Tool execution update." : "Working…")
                            }
                          >
                            {isToolStep && (toolCall || toolName) && (
                              <div className="mt-2">
                                <Tool type={toolCall?.name || toolName} state={toolState}>
                                  <ToolHeader
                                    title={formatToolLabel(toolCall?.name || toolName)}
                                  />
                                  <ToolContent>
                                    <ToolInput
                                      value={
                                        toolCall?.args ??
                                        ((entry.data as Record<string, unknown>)?.args ?? {})
                                      }
                                    />
                                    {toolResult ? (
                                      <ToolOutput
                                        value={
                                          toolResult.output ?? toolResult.error
                                        }
                                      />
                                    ) : (
                                      getProgressValueAsString(entry.data, "error") && (
                                        <ToolOutput
                                          value={getProgressValueAsString(entry.data, "error")}
                                        />
                                      )
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
                        </React.Fragment>
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
                    <div className="space-y-4">
                      {plan.steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <div className="mt-0.5">
                            {step.status === "completed" && (
                              <CheckCircle2Icon className="size-4 text-emerald-500" />
                            )}
                            {step.status === "in_progress" && (
                              <Loader2Icon className="size-4 text-indigo-500 animate-spin" />
                            )}
                            {step.status === "pending" && (
                              <CircleIcon className="size-4 text-muted-foreground/30" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {step.title}
                            </div>
                            {step.description && (
                              <div className="text-muted-foreground text-xs">
                                {step.description}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {plan.status === "awaiting_approval" && (
                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              onPlanFeedback?.({
                                planId: plan.id,
                                approved: false,
                                reason: "Rejected by user",
                              })
                            }
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              onPlanFeedback?.({
                                planId: plan.id,
                                approved: true,
                                reason: "Proceed",
                              })
                            }
                          >
                            Approve Plan
                          </Button>
                        </div>
                      )}
                    </div>
                  </PlanContent>
                </Plan>
              )}

            </div>

            {shouldRenderReport && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <JainaReportView
                  report={structuredReport}
                  status={isStreaming ? state.status : "complete"}
                  onSuggestionClick={onSuggestionClick}
                  idPrefix={message.id}
                />
              </div>
            )}

            {allCreatives.length > 0 && (
              <div className="mt-6 space-y-4">
                <Text size="3" className="font-semibold text-white/90">
                  Creatives
                </Text>
                <div className="flex flex-wrap gap-4">
                  {allCreatives.map((creative) => (
                    <CreativeCard key={creative.id} creative={creative} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </Message>
  );
}
