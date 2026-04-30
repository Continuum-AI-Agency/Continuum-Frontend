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
  ToolHeader,
} from "@/components/ai-elements/tool";
import {
  Agent,
  AgentHeader,
  AgentContent,
} from "@/components/ai-elements/agent";
import { SafeMarkdown } from "@/components/ui/SafeMarkdownLazy";
import { SparkleSpinner } from "./SparkleSpinner";
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
import { motion, AnimatePresence } from "motion/react";

const STAGE_LABELS: Record<string, string> = {
  synthesis_start: "Writing report",
  delegation_start: "Delegating",
  canvas_start: "Updating canvas",
  assembly_start: "Assembling",
  delegation_complete: "Delegation complete",
};

type ThinkingWindowProps = {
  reasoning: JainaProgressEntry[];
  toolCalls: JainaStreamState["toolCalls"];
  toolResults: JainaStreamState["toolResults"];
  isStreaming: boolean;
};

export function getLatestStreamingThought(
  reasoning: JainaProgressEntry[]
): string | null {
  for (let i = reasoning.length - 1; i >= 0; i -= 1) {
    const entry = reasoning[i];
    if (entry.stage !== "thinking") continue;
    const detail = toMarkdownDetail(entry.detail);
    if (detail) return detail;
  }
  return null;
}

type LatestJainaThoughtProps = {
  reasoning: JainaProgressEntry[];
  isStreaming: boolean;
};

export function LatestJainaThought({
  reasoning,
  isStreaming,
}: LatestJainaThoughtProps) {
  const latestThought = React.useMemo(
    () => (isStreaming ? getLatestStreamingThought(reasoning) : null),
    [isStreaming, reasoning]
  );

  if (!latestThought) return null;

  return (
    <motion.div
      key={latestThought}
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg border border-border/50 bg-muted/25 px-3 py-2.5"
    >
      <SafeMarkdown
        content={latestThought}
        className="text-xs leading-relaxed text-foreground/80"
        mode="streaming"
        isAnimating
      />
    </motion.div>
  );
}

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

  const currentStage = React.useMemo(() => {
    if (!isStreaming) return null;
    for (let i = reasoning.length - 1; i >= 0; i--) {
      const stage = reasoning[i].stage;
      if (stage && STAGE_LABELS[stage]) return STAGE_LABELS[stage];
    }
    return null;
  }, [reasoning, isStreaming]);

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
          <SparkleSpinner isActive={isStreaming} className="text-foreground/60" />
          <span className="flex-1 text-left">
            {isStreaming ? (
              <span className="text-sm font-medium">Thinking...</span>
            ) : (
              <span className="font-medium">Reasoning trace</span>
            )}
          </span>
          <AnimatePresence>
            {currentStage && (
              <motion.span
                key={currentStage}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {currentStage}
              </motion.span>
            )}
          </AnimatePresence>
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

          if (segment.kind === "agent_lifecycle") {
            const isActive = isStreaming && isLast && !segment.completeStatus;
            const statusColor = segment.completeStatus === "failed"
              ? "text-destructive"
              : segment.completeStatus === "completed"
              ? "text-emerald-500"
              : "text-muted-foreground";

            const workerResolved = segment.workerToolRefs?.length
              ? resolveToolEntries(segment.workerToolRefs, safeToolCalls, safeToolResults)
              : [];
            const lastWorkerEntry = workerResolved[workerResolved.length - 1];
            let workerStatusLine: string | null = null;
            if (lastWorkerEntry) {
              const res = lastWorkerEntry.toolResult;
              if (res) {
                if (!res.ok) workerStatusLine = `${lastWorkerEntry.name} failed${res.error ? ` — ${res.error}` : ""}`;
                else if (res.cached) workerStatusLine = `${lastWorkerEntry.name} (cached)`;
                else {
                  const bytes = (res as { output_bytes?: number }).output_bytes;
                  workerStatusLine = bytes ? `${lastWorkerEntry.name} returned (${bytes}B)` : `${lastWorkerEntry.name} returned`;
                }
              } else {
                workerStatusLine = `calling ${lastWorkerEntry.name}…`;
              }
            }

            return (
              <ChainOfThoughtStep
                key={segment.id}
                icon={ArrowRightLeftIcon}
                label={`Delegated to ${segment.agentLabel}`}
                status={isActive ? "active" : "complete"}
              >
                <Agent className="mt-1">
                  <AgentHeader name={segment.agentLabel} />
                  <AgentContent>
                    {segment.taskDescription && (
                      <p className="text-[11px] text-foreground/70">{segment.taskDescription}</p>
                    )}
                    {isActive && workerStatusLine && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{workerStatusLine}</p>
                    )}
                    {segment.durationMs !== undefined && (
                      <p className={cn("text-[10px] mt-1", statusColor)}>
                        {segment.completeStatus ?? "running"} · {(segment.durationMs / 1000).toFixed(1)}s
                      </p>
                    )}
                    {segment.error && (
                      <p className="text-[10px] text-destructive mt-1">{segment.error}</p>
                    )}
                    {workerResolved.length > 0 && (
                      <p className="text-[10px] text-muted-foreground/50 mt-1">
                        {workerResolved.filter(e => e.state !== "running").length}/{workerResolved.length} tools done
                      </p>
                    )}
                  </AgentContent>
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
                        <ToolHeader title={formatToolLabel(entry.name)} showDisclosure={false} />
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
                            <ToolHeader title={formatToolLabel(entry.name)} showDisclosure={false} />
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
