"use client";

import * as React from "react";
import { Badge, Text } from "@radix-ui/themes";
import { motion } from "motion/react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  ListChecksIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { Message } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Plan,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemDescription,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import {
  frontendCheckpointReportSchema,
  hasReportContent,
  type JainaObjective,
  type ToolCallEventData,
  type CreativeArtifact,
  type ToolResultEventData,
} from "@/lib/jaina/schemas";
import type { JainaProgressEntry, JainaStreamState } from "@/lib/jaina/stream";
import {
  extractRenderableFallbackFromReport,
  extractRenderableFallbackFromStructuredContent,
  formatToolLabel,
  isStreamingPlaceholderMessage,
} from "../jainaUtils";
import { ThinkingStatusGrid } from "./ThinkingStatusGrid";
import { CreativeCard } from "./CreativeCard";
import { JainaInlineReport } from "./JainaInlineReport";
import type { JainaChatMessage } from "../types";

function extractCreativeFromToolResult(toolResult: ToolResultEventData): CreativeArtifact | null {
  if (!toolResult.ok || !toolResult.output) return null;

  const output = toolResult.output as Record<string, unknown>;
  const creativeDetails = output.creative_details as Record<string, unknown> | undefined;

  if (creativeDetails) {
    return {
      id: String(creativeDetails.id || `creative-${Date.now()}`),
      type: "creative",
      url: String(creativeDetails.image_url || ""),
      thumbnail_url: creativeDetails.thumbnail_url
        ? String(creativeDetails.thumbnail_url)
        : undefined,
      post_copy: creativeDetails.body ? String(creativeDetails.body) : undefined,
      headline: creativeDetails.title ? String(creativeDetails.title) : undefined,
      description: creativeDetails.name ? String(creativeDetails.name) : undefined,
      call_to_action: creativeDetails.call_to_action_type
        ? String(creativeDetails.call_to_action_type)
        : undefined,
    };
  }

  if (typeof output.preview_iframe === "string") {
    return {
      id: `preview-${Date.now()}`,
      type: "creative",
      url: "",
      format: "video",
    };
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

function toMarkdownDetail(detail: string | undefined): string | null {
  if (!detail) return null;

  const trimmed = detail.trim();
  if (!trimmed) return null;

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const preferred = [
          record.reasoning,
          record.summary,
          record.message,
          record.flow,
          record.description,
        ].find((value) => typeof value === "string" && value.trim().length > 0);

        if (typeof preferred === "string") {
          return preferred;
        }
      }

      return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
    } catch {
      return detail;
    }
  }

  return detail;
}

function getObjectiveStatusLabel(status: JainaObjective["status"]): string {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return "Pending";
}

function getObjectiveStatusClasses(status: JainaObjective["status"]): string {
  if (status === "completed") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "in_progress") {
    return "border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }
  if (status === "failed") {
    return "border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300";
  }
  return "border-border/80 bg-muted/40 text-muted-foreground";
}

function isLikelyStructuredJsonMessage(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return true;
  }
  return (
    trimmed.includes("\"executive_summary\"") ||
    trimmed.includes("\"performance_snapshot\"") ||
    trimmed.includes("\"sections\"") ||
    trimmed.includes("\"strategic_recommendations\"")
  );
}

type ObjectivesQueueProps = {
  objectives: JainaObjective[];
  isStreaming: boolean;
};

function ObjectivesQueue({ objectives, isStreaming }: ObjectivesQueueProps) {
  if (!objectives.length) return null;

  const completedCount = objectives.filter(
    (objective) => objective.status === "completed"
  ).length;

  return (
    <Queue className="border-border/70 bg-card/80 shadow-none">
      <QueueSection defaultOpen={false}>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={objectives.length}
            label="objectives"
            icon={<ListChecksIcon className="size-3.5" />}
          />
          <span className="text-xs text-muted-foreground">
            {completedCount}/{objectives.length} done
            {isStreaming ? " • live" : ""}
          </span>
        </QueueSectionTrigger>
        <QueueSectionContent className="pt-2">
          <QueueList className="h-[170px]">
            {objectives.map((objective) => {
              const completed = objective.status === "completed";
              return (
                <QueueItem key={objective.id}>
                  <div className="flex items-start gap-2">
                    <QueueItemIndicator
                      completed={completed}
                      className={
                        objective.status === "in_progress"
                          ? "border-blue-400/60 bg-blue-500/30"
                          : objective.status === "failed"
                            ? "border-red-400/60 bg-red-500/30"
                            : undefined
                      }
                    />
                    <QueueItemContent completed={completed}>
                      {objective.title}
                    </QueueItemContent>
                    <span
                      className={`ml-auto inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${getObjectiveStatusClasses(
                        objective.status
                      )}`}
                    >
                      {getObjectiveStatusLabel(objective.status)}
                    </span>
                  </div>
                  {objective.description ? (
                    <QueueItemDescription completed={completed}>
                      {objective.description}
                    </QueueItemDescription>
                  ) : null}
                </QueueItem>
              );
            })}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
}

type ThinkingWindowProps = {
  reasoning: JainaProgressEntry[];
  toolCalls: JainaStreamState["toolCalls"];
  toolResults: JainaStreamState["toolResults"];
  isStreaming: boolean;
};

type ThinkingSegment =
  | {
      kind: "thought";
      id: string;
      entries: JainaProgressEntry[];
    }
  | {
      kind: "tools";
      id: string;
      toolRefs: string[];
    };

const NOISY_STAGE_PATTERNS = [
  "prefetch",
  "working_memory",
  "quick_path",
  "fallback",
  "memory_ready",
];

function isNoisyStage(stage: string): boolean {
  const normalized = stage.trim().toLowerCase();
  return NOISY_STAGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isToolProgressEntry(entry: JainaProgressEntry): boolean {
  if (entry.stage === "tool_start" || entry.stage === "tool_complete") {
    return true;
  }
  const { toolCallId, toolName } = resolveToolProgressMetadata(entry);
  return Boolean(toolCallId || toolName);
}

function resolveToolRef(
  entry: JainaProgressEntry,
  toolCalls: ToolCallEventData[],
  usedCallIds: Set<string>
): string | null {
  const { toolCallId, toolName } = resolveToolProgressMetadata(entry);
  if (toolCallId) return `id:${toolCallId}`;
  if (!toolName) return null;

  const matchingCall = toolCalls.find(
    (toolCall) =>
      toolCall.name === toolName &&
      !usedCallIds.has(toolCall.id)
  );
  if (matchingCall) {
    usedCallIds.add(matchingCall.id);
    return `id:${matchingCall.id}`;
  }

  return `name:${toolName}`;
}

function buildThinkingSegments(
  reasoning: JainaProgressEntry[],
  toolCalls: ToolCallEventData[]
): ThinkingSegment[] {
  const segments: ThinkingSegment[] = [];
  const currentThoughtEntries: JainaProgressEntry[] = [];
  const currentToolRefs: string[] = [];
  const usedCallIds = new Set<string>();

  const flushThoughts = () => {
    if (currentThoughtEntries.length === 0) return;
    segments.push({
      kind: "thought",
      id: `thought-${segments.length + 1}`,
      entries: [...currentThoughtEntries],
    });
    currentThoughtEntries.length = 0;
  };

  const flushTools = () => {
    if (currentToolRefs.length === 0) return;
    segments.push({
      kind: "tools",
      id: `tools-${segments.length + 1}`,
      toolRefs: [...currentToolRefs],
    });
    currentToolRefs.length = 0;
  };

  for (const entry of reasoning) {
    if (isToolProgressEntry(entry)) {
      flushThoughts();
      const toolRef = resolveToolRef(entry, toolCalls, usedCallIds);
      if (toolRef && !currentToolRefs.includes(toolRef)) {
        currentToolRefs.push(toolRef);
      }
      continue;
    }

    if (entry.stage !== "thinking" || isNoisyStage(entry.stage)) {
      continue;
    }

    if (!toMarkdownDetail(entry.detail)) {
      continue;
    }

    flushTools();
    currentThoughtEntries.push(entry);
  }

  flushThoughts();
  flushTools();

  if (segments.length === 0 && toolCalls.length > 0) {
    return [
      {
        kind: "tools",
        id: "tools-1",
        toolRefs: toolCalls.map((toolCall) => `id:${toolCall.id}`),
      },
    ];
  }

  return segments;
}

function resolveToolCallFromRef(
  toolRef: string,
  toolCalls: ToolCallEventData[]
): ToolCallEventData | undefined {
  if (toolRef.startsWith("id:")) {
    const id = toolRef.slice(3);
    return toolCalls.find((toolCall) => toolCall.id === id);
  }
  if (toolRef.startsWith("name:")) {
    const name = toolRef.slice(5);
    return toolCalls.find((toolCall) => toolCall.name === name);
  }
  return undefined;
}

function resolveToolResultFromRef(
  toolRef: string,
  toolResults: ToolResultEventData[]
): ToolResultEventData | undefined {
  if (toolRef.startsWith("id:")) {
    const id = toolRef.slice(3);
    return toolResults.find((toolResult) => toolResult.id === id);
  }
  if (toolRef.startsWith("name:")) {
    const name = toolRef.slice(5);
    return toolResults.find((toolResult) => toolResult.name === name);
  }
  return undefined;
}

type ResolvedToolEntry = {
  id: string;
  name: string;
  toolCall?: ToolCallEventData;
  toolResult?: ToolResultEventData;
  state: "output-available" | "error" | "running";
};

type ToolCluster = {
  key: string;
  name: string;
  entries: ResolvedToolEntry[];
  completedCount: number;
  errorCount: number;
  runningCount: number;
};

function resolveToolEntries(
  toolRefs: string[],
  toolCalls: ToolCallEventData[],
  toolResults: ToolResultEventData[]
): ResolvedToolEntry[] {
  return toolRefs.map((toolRef, index) => {
    const toolCall = resolveToolCallFromRef(toolRef, toolCalls);
    const toolResult = resolveToolResultFromRef(toolRef, toolResults);
    const name = toolCall?.name || toolResult?.name || toolRef.replace(/^name:/, "");
    const state: "output-available" | "error" | "running" = toolResult
      ? toolResult.ok
        ? "output-available"
        : "error"
      : "running";

    return {
      id: `${toolRef}-${toolCall?.id ?? toolResult?.id ?? index}`,
      name,
      toolCall,
      toolResult,
      state,
    };
  });
}

function clusterToolEntries(entries: ResolvedToolEntry[]): ToolCluster[] {
  const order: string[] = [];
  const groups = new Map<string, ToolCluster>();

  for (const entry of entries) {
    const key = entry.name || "tool";
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, {
        key,
        name: entry.name || "tool",
        entries: [],
        completedCount: 0,
        errorCount: 0,
        runningCount: 0,
      });
    }
    const group = groups.get(key);
    if (!group) continue;

    group.entries.push(entry);
    if (entry.state === "output-available") group.completedCount += 1;
    if (entry.state === "error") group.errorCount += 1;
    if (entry.state === "running") group.runningCount += 1;
  }

  return order
    .map((key) => groups.get(key))
    .filter((group): group is ToolCluster => Boolean(group));
}

function ThinkingWindow({
  reasoning,
  toolCalls,
  toolResults,
  isStreaming,
}: ThinkingWindowProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const safeToolCalls = React.useMemo(() => toolCalls ?? [], [toolCalls]);
  const safeToolResults = React.useMemo(() => toolResults ?? [], [toolResults]);

  const segments = React.useMemo(
    () => buildThinkingSegments(reasoning, safeToolCalls),
    [reasoning, safeToolCalls]
  );
  const thoughtCount = segments.reduce(
    (count, segment) =>
      segment.kind === "thought" ? count + segment.entries.length : count,
    0
  );
  const toolCount = segments.reduce(
    (count, segment) =>
      segment.kind === "tools" ? count + segment.toolRefs.length : count,
    0
  );

  const hasEntries = segments.length > 0;
  if (!hasEntries) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-xl border border-border/70 bg-card/80">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
          >
            <div className="flex min-w-0 items-center gap-2">
              <ThinkingStatusGrid isActive={isStreaming} />
              <div className="min-w-0">
                <Text size="2" weight="medium" className="block">
                  Thinking
                </Text>
                <Text size="1" className="text-muted-foreground">
                  {isStreaming
                    ? "Reasoning and tool calls"
                    : "Reasoning trace"}
                </Text>
              </div>
              {toolCount > 0 ? (
                <Badge variant="soft" color="gray" className="ml-1 shrink-0">
                  {toolCount} tool{toolCount !== 1 ? "s" : ""}
                </Badge>
              ) : null}
              {thoughtCount > 0 ? (
                <Badge variant="outline" className="ml-1 shrink-0">
                  {thoughtCount} thought{thoughtCount !== 1 ? "s" : ""}
                </Badge>
              ) : null}
            </div>
            <ChevronDownIcon
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                isOpen ? "rotate-180" : "rotate-0"
              }`}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="border-t border-border/70 px-4 py-4">
          <ScrollArea className="h-[320px] max-h-[55vh] pr-2">
            <div className="space-y-4">
              {(() => {
                let thoughtGroupIndex = 0;
                let toolGroupIndex = 0;
                return segments.map((segment) => {
                  if (segment.kind === "thought") {
                    thoughtGroupIndex += 1;
                    return (
                      <motion.div
                        key={segment.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                        className="rounded-lg border border-border/60 bg-background/70 p-4"
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px]">
                            Thoughts {thoughtGroupIndex > 1 ? `· ${thoughtGroupIndex}` : ""}
                          </Badge>
                        </div>
                        <div className="space-y-4">
                          {segment.entries.map((entry, entryIndex) => {
                            const detailMarkdown = toMarkdownDetail(entry.detail);
                            if (!detailMarkdown) return null;
                            return (
                              <div key={`${entry.at}-${entryIndex}`} className="space-y-1">
                                <SafeMarkdown
                                  content={detailMarkdown}
                                  className="text-[14px] leading-7 text-foreground/85"
                                  mode={isStreaming ? "streaming" : "static"}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  }

                  toolGroupIndex += 1;
                  return (
                    <motion.div
                      key={segment.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                      className="rounded-lg border border-border/60 bg-background/70 p-4"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">
                          Tool calls {toolGroupIndex > 1 ? `· ${toolGroupIndex}` : ""}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {clusterToolEntries(
                          resolveToolEntries(
                            segment.toolRefs,
                            safeToolCalls,
                            safeToolResults
                          )
                        ).map((cluster) => (
                          <details
                            key={cluster.key}
                            className="rounded-md border border-border/60 bg-background/60"
                            open={cluster.entries.length <= 1}
                          >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Text size="1" weight="medium">
                                  {formatToolLabel(cluster.name)}
                                </Text>
                                <Badge variant="outline" className="text-[10px]">
                                  {cluster.entries.length} call
                                  {cluster.entries.length !== 1 ? "s" : ""}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {cluster.errorCount > 0 ? (
                                  <Badge color="red" variant="soft" className="text-[10px]">
                                    {cluster.errorCount} failed
                                  </Badge>
                                ) : null}
                                {cluster.runningCount > 0 ? (
                                  <Badge color="amber" variant="soft" className="text-[10px]">
                                    {cluster.runningCount} running
                                  </Badge>
                                ) : null}
                                {cluster.completedCount > 0 ? (
                                  <Badge color="green" variant="soft" className="text-[10px]">
                                    {cluster.completedCount} done
                                  </Badge>
                                ) : null}
                              </div>
                            </summary>
                            <div className="space-y-2 px-3 pb-3">
                              {cluster.entries.map((entry) => (
                                <Tool key={entry.id} type={entry.name} state={entry.state}>
                                  <ToolHeader title={formatToolLabel(entry.name)} />
                                  <ToolContent>
                                    <ToolInput value={entry.toolCall?.args ?? {}} />
                                    {entry.toolResult ? (
                                      <ToolOutput
                                        value={
                                          entry.toolResult.output ??
                                          entry.toolResult.error
                                        }
                                      />
                                    ) : null}
                                  </ToolContent>
                                </Tool>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                  </motion.div>
                );
              });
              })()}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

type MessageActionBarProps = {
  content: string;
  onRegenerate?: () => void;
};

function MessageActionBar({ content, onRegenerate }: MessageActionBarProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard not available
    }
  }, [content]);

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy response"}
        onClick={handleCopy}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
      >
        {copied ? (
          <ClipboardCheckIcon className="size-3.5 text-emerald-500" />
        ) : (
          <ClipboardIcon className="size-3.5" />
        )}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
      {onRegenerate ? (
        <button
          type="button"
          aria-label="Regenerate response"
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <RefreshCwIcon className="size-3.5" />
          <span>Regenerate</span>
        </button>
      ) : null}
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
  onRegenerate?: () => void;
  onFocusInput?: () => void;
};

export function JainaMessageItem({
  message,
  activeResponseId,
  state,
  onSuggestionClick,
  onPlanFeedback,
  onRegenerate,
  onFocusInput,
}: JainaMessageItemProps) {
  const isStreaming = message.id === activeResponseId;
  const reasoning = isStreaming ? state.progress : message.reasoning;
  const toolCalls = isStreaming ? state.toolCalls : message.toolCalls;
  const toolResults = isStreaming ? state.toolResults : message.toolResults;
  const objectives = isStreaming ? state.objectives : message.objectives;
  const report = isStreaming ? state.report : message.report;
  const plan = message.plan;

  const structuredReport = React.useMemo(() => {
    if (!report || ("type" in report && report.type === "direct_answer")) {
      return null;
    }
    const parsed = frontendCheckpointReportSchema.safeParse(report);
    return parsed.success ? parsed.data : null;
  }, [report]);

  const shouldRenderInlineReport = Boolean(
    structuredReport && hasReportContent(structuredReport)
  );
  const isStructuredJsonContent = isLikelyStructuredJsonMessage(message.content);
  const shouldHideMarkdownContent = isStructuredJsonContent;
  const structuredFallbackContent = React.useMemo(() => {
    if (shouldRenderInlineReport) return null;
    return (
      extractRenderableFallbackFromReport(report ?? null) ??
      (isStructuredJsonContent
        ? extractRenderableFallbackFromStructuredContent(message.content)
        : null)
    );
  }, [isStructuredJsonContent, message.content, report, shouldRenderInlineReport]);
  const shouldShowStructuredFallback =
    isStructuredJsonContent && !shouldRenderInlineReport && !structuredFallbackContent;

  const artifacts = isStreaming ? state.artifacts : message.artifacts;
  const artifactCreatives = artifacts?.creatives ?? [];

  const toolCreatives = React.useMemo(() => {
    if (!toolResults) return [];
    return toolResults
      .map(extractCreativeFromToolResult)
      .filter((creative): creative is CreativeArtifact => creative !== null);
  }, [toolResults]);

  const allCreatives = [...toolCreatives, ...artifactCreatives];

  return (
    <Message role={message.role}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="group w-full space-y-4"
      >
        {message.role === "user" ? (
          <Text size="2" className="font-medium">
            {message.content}
          </Text>
        ) : (
          <>
            {!shouldHideMarkdownContent ? (
              <div className="relative">
                <SafeMarkdown
                  content={message.content}
                  className="text-[15px] leading-7 text-foreground"
                  mode={isStreaming ? "streaming" : "static"}
                  isAnimating={isStreaming}
                />
                {isStreaming && isStreamingPlaceholderMessage(message.content) ? (
                  <motion.span
                    aria-hidden="true"
                    className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] rounded-sm bg-primary"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : null}
              </div>
            ) : null}

            {structuredFallbackContent ? (
              <SafeMarkdown
                content={structuredFallbackContent}
                className="text-[15px] leading-7 text-foreground"
                mode="static"
                isAnimating={false}
              />
            ) : null}

            {shouldShowStructuredFallback ? (
              <Text size="2" className="text-muted-foreground">
                Structured analysis generated, but report blocks could not be rendered.
              </Text>
            ) : null}

            {message.pendingClarification ? (
              <div className="rounded-xl border-l-2 border-amber-400/60 border border-amber-300/30 bg-amber-50/8 px-4 py-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Badge color="amber" variant="soft" className="uppercase text-[10px] tracking-wide shrink-0">
                    Clarification needed
                  </Badge>
                </div>
                {message.pendingClarification.question ? (
                  <Text size="2" className="block text-foreground/90 leading-relaxed">
                    {message.pendingClarification.question}
                  </Text>
                ) : null}
                <button
                  type="button"
                  onClick={onFocusInput}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-400/20 cursor-pointer"
                >
                  Reply to this
                </button>
              </div>
            ) : null}

            <ObjectivesQueue
              objectives={objectives ?? []}
              isStreaming={isStreaming}
            />

            <ThinkingWindow
              reasoning={reasoning ?? []}
              toolCalls={toolCalls ?? []}
              toolResults={toolResults ?? []}
              isStreaming={isStreaming}
            />

            {plan ? (
              <Plan status={plan.status} isStreaming={isStreaming}>
                <PlanHeader>
                  <PlanTitle>{plan.title}</PlanTitle>
                  <PlanDescription>{plan.description}</PlanDescription>
                  <PlanTrigger />
                </PlanHeader>
                <PlanContent>
                  <div className="space-y-4">
                    {plan.steps.map((step, index) => (
                      <div key={index} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5">
                          {step.status === "completed" ? (
                            <CheckCircle2Icon className="size-4 text-emerald-500" />
                          ) : null}
                          {step.status === "in_progress" ? (
                            <Loader2Icon className="size-4 animate-spin text-indigo-500" />
                          ) : null}
                          {step.status === "pending" ? (
                            <CircleIcon className="size-4 text-muted-foreground/30" />
                          ) : null}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{step.title}</div>
                          {step.description ? (
                            <div className="text-xs text-muted-foreground">
                              {step.description}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {plan.status === "awaiting_approval" ? (
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
                    ) : null}
                  </div>
                </PlanContent>
              </Plan>
            ) : null}

            {shouldRenderInlineReport ? (
              <JainaInlineReport
                report={structuredReport}
                isStreaming={isStreaming}
                onSuggestionClick={onSuggestionClick}
              />
            ) : null}

            {allCreatives.length > 0 ? (
              <div className="mt-6 space-y-4">
                <Text size="3" className="font-semibold text-foreground/90">
                  Creatives
                </Text>
                <div className="flex flex-wrap gap-4">
                  {allCreatives.map((creative) => (
                    <CreativeCard key={creative.id} creative={creative} />
                  ))}
                </div>
              </div>
            ) : null}

            {!isStreaming && message.status === "done" ? (
              <MessageActionBar
                content={message.content}
                onRegenerate={onRegenerate}
              />
            ) : null}
          </>
        )}
      </motion.div>
    </Message>
  );
}
