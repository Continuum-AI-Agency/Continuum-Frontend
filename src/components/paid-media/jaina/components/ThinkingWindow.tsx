"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChainOfThought,
  ChainOfThoughtContent,
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
  Agent,
  AgentHeader,
  AgentContent,
} from "@/components/ai-elements/agent";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { ThinkingStatusGrid } from "./ThinkingStatusGrid";
import {
  buildThinkingSegments,
  clusterToolEntries,
  formatAgentLabel,
  formatToolLabel,
  resolveToolEntries,
  toMarkdownDetail,
} from "./thinkingUtils";
import type { JainaProgressEntry, JainaStreamState } from "@/lib/jaina/stream";
import {
  BrainIcon,
  ChevronDownIcon,
  WrenchIcon,
  ArrowRightLeftIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ThinkingWindowProps = {
  reasoning: JainaProgressEntry[];
  toolCalls: JainaStreamState["toolCalls"];
  toolResults: JainaStreamState["toolResults"];
  isStreaming: boolean;
};

export function ThinkingWindow({
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

  if (segments.length === 0) return null;

  return (
    <ChainOfThought open={isOpen} onOpenChange={setIsOpen} className="space-y-0">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <ThinkingStatusGrid isActive={isStreaming} className="shrink-0" />
          <span className="flex-1 text-left">
            {isStreaming ? (
              <Shimmer as="span" className="text-sm font-medium">
                Thinking...
              </Shimmer>
            ) : (
              <span className="font-medium">Reasoning trace</span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            {toolCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                {toolCount} tool{toolCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {thoughtCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5">
                {thoughtCount} thought{thoughtCount !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 transition-transform",
              isOpen ? "rotate-180" : "rotate-0"
            )}
          />
        </button>
      </CollapsibleTrigger>

      <ChainOfThoughtContent className="space-y-1 px-2 pb-3">
        {segments.map((segment, segmentIndex) => {
          const isLast = segmentIndex === segments.length - 1;

          if (segment.kind === "thought") {
            return (
              <ChainOfThoughtStep
                key={segment.id}
                icon={BrainIcon}
                label="Reasoning"
                status={isStreaming && isLast ? "active" : "complete"}
              >
                <div className="space-y-3 rounded-md bg-muted/30 p-3">
                  {segment.entries.map((entry, entryIndex) => {
                    const detailMarkdown = toMarkdownDetail(entry.detail);
                    if (!detailMarkdown) return null;
                    return (
                      <SafeMarkdown
                        key={`${entry.at}-${entryIndex}`}
                        content={detailMarkdown}
                        className="text-sm leading-relaxed text-foreground/85"
                        mode={isStreaming ? "streaming" : "static"}
                      />
                    );
                  })}
                </div>
              </ChainOfThoughtStep>
            );
          }

          if (segment.kind === "handoff") {
            return (
              <ChainOfThoughtStep
                key={segment.id}
                icon={ArrowRightLeftIcon}
                label={
                  segment.status === "started"
                    ? `Delegating to ${formatAgentLabel(segment.to)}`
                    : `${formatAgentLabel(segment.to)} ${segment.status}`
                }
                status={segment.status === "started" ? "active" : "complete"}
              >
                <Agent className="mt-1">
                  <AgentHeader name={formatAgentLabel(segment.to)} />
                  {segment.objective ? (
                    <AgentContent>
                      <p className="text-xs text-muted-foreground">
                        {segment.objective}
                      </p>
                    </AgentContent>
                  ) : null}
                </Agent>
              </ChainOfThoughtStep>
            );
          }

          // tools segment
          const resolved = resolveToolEntries(
            segment.toolRefs,
            safeToolCalls,
            safeToolResults
          );
          const clusters = clusterToolEntries(resolved);
          const hasRunning = resolved.some((e) => e.state === "running");

          return (
            <ChainOfThoughtStep
              key={segment.id}
              icon={WrenchIcon}
              label={`${resolved.length} tool call${resolved.length !== 1 ? "s" : ""}`}
              status={hasRunning ? "active" : "complete"}
            >
              <div className="space-y-2">
                {clusters.map((cluster) => {
                  if (cluster.entries.length === 1) {
                    const entry = cluster.entries[0];
                    return (
                      <Tool key={entry.id} type={entry.name} state={entry.state}>
                        <ToolHeader title={formatToolLabel(entry.name)} />
                        <ToolContent>
                          <ToolInput value={entry.toolCall?.args ?? {}} />
                          {entry.toolResult ? (
                            <ToolOutput
                              value={entry.toolResult.output ?? entry.toolResult.error}
                            />
                          ) : null}
                        </ToolContent>
                      </Tool>
                    );
                  }

                  return (
                    <details
                      key={cluster.key}
                      className="rounded-md border border-border/40"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
                        <span className="font-medium">
                          {formatToolLabel(cluster.name)}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {cluster.entries.length} calls
                        </Badge>
                        <div className="ml-auto flex items-center gap-1">
                          {cluster.errorCount > 0 && (
                            <Badge variant="destructive" className="text-[10px]">
                              {cluster.errorCount} failed
                            </Badge>
                          )}
                          {cluster.runningCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] text-amber-500">
                              {cluster.runningCount} running
                            </Badge>
                          )}
                          {cluster.completedCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] text-emerald-500">
                              {cluster.completedCount} done
                            </Badge>
                          )}
                        </div>
                      </summary>
                      <div className="space-y-1.5 px-3 pb-3">
                        {cluster.entries.map((entry) => (
                          <Tool key={entry.id} type={entry.name} state={entry.state}>
                            <ToolHeader title={formatToolLabel(entry.name)} />
                            <ToolContent>
                              <ToolInput value={entry.toolCall?.args ?? {}} />
                              {entry.toolResult ? (
                                <ToolOutput
                                  value={entry.toolResult.output ?? entry.toolResult.error}
                                />
                              ) : null}
                            </ToolContent>
                          </Tool>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </ChainOfThoughtStep>
          );
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
