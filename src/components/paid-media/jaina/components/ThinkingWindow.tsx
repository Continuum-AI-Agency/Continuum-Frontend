'use client';

import {
  ArrowRightLeftIcon,
  BrainIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDotIcon,
  WrenchIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as React from 'react';
import { Agent, AgentContent, AgentHeader } from '@/components/ai-elements/agent';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolHeader } from '@/components/ai-elements/tool';
import { Badge } from '@/components/ui/badge';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import type { JainaProgressEntry, JainaStreamState } from '@/lib/jaina/stream';
import { cn } from '@/lib/utils';
import { SparkleSpinner } from './SparkleSpinner';
import {
  type AgentLifecycleSegment,
  buildThinkingSegments,
  clusterToolEntries,
  formatAgentLabel,
  formatThoughtDuration,
  formatToolLabel,
  resolveToolCallFromRef,
  resolveToolEntries,
  resolveToolResultFromRef,
  STAGE_LABELS,
  toMarkdownDetail,
} from './thinkingUtils';

type ThinkingWindowProps = {
  reasoning: JainaProgressEntry[];
  toolCalls: JainaStreamState['toolCalls'];
  toolResults: JainaStreamState['toolResults'];
  isStreaming: boolean;
};

/**
 * The single line the COLLAPSED view shows: the most recent thing Jaina actually said.
 *
 * `agent_narration` counts alongside `thinking`. While structured subagents run — up to
 * 79% of a measured turn — narration is the only prose being produced, so excluding it
 * left the collapsed ticker blank through the longest stretch of the turn.
 */
export function getLatestStreamingThought(reasoning: JainaProgressEntry[]): string | null {
  for (let i = reasoning.length - 1; i >= 0; i -= 1) {
    const entry = reasoning[i];
    if (entry.stage !== 'thinking' && entry.stage !== 'agent_narration') continue;
    const detail = toMarkdownDetail(entry.detail);
    if (detail) return detail;
  }
  return null;
}

type LatestJainaThoughtProps = {
  reasoning: JainaProgressEntry[];
  isStreaming: boolean;
};

export function LatestJainaThought({ reasoning, isStreaming }: LatestJainaThoughtProps) {
  const latestThought = React.useMemo(
    () => (isStreaming ? getLatestStreamingThought(reasoning) : null),
    [isStreaming, reasoning],
  );

  if (!latestThought) return null;

  return (
    <motion.div
      key={latestThought}
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -3 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="-mt-1 px-3 pb-2.5"
    >
      <div className="line-clamp-2 text-sm leading-relaxed text-foreground/80">
        <SafeMarkdown content={latestThought} mode="streaming" isAnimating />
      </div>
    </motion.div>
  );
}

type ActiveAgentsPanelProps = {
  agents: AgentLifecycleSegment[];
  toolCalls: JainaStreamState['toolCalls'];
  toolResults: JainaStreamState['toolResults'];
  isStreaming: boolean;
};

function AgentStatusRow({
  agent,
  isLast,
  toolCalls,
  toolResults,
}: {
  agent: AgentLifecycleSegment;
  isLast: boolean;
  toolCalls: JainaStreamState['toolCalls'];
  toolResults: JainaStreamState['toolResults'];
}) {
  const safeToolCalls = toolCalls ?? [];
  const safeToolResults = toolResults ?? [];
  const toolCount = agent.workerToolRefs?.length ?? 0;
  const isDone = Boolean(agent.completeStatus);

  const latestActivity = React.useMemo(() => {
    if (isDone || !agent.workerToolRefs?.length) return null;
    const lastRef = agent.workerToolRefs[agent.workerToolRefs.length - 1];
    const result = resolveToolResultFromRef(lastRef, safeToolResults);
    const call = resolveToolCallFromRef(lastRef, safeToolCalls);
    const name = call?.name ?? result?.name ?? lastRef.replace(/^name:/, '');
    if (result) return null;
    return name ? `${name}…` : null;
  }, [isDone, agent.workerToolRefs, safeToolCalls, safeToolResults]);

  const treeChar = isLast ? '└─' : '├─';

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-baseline gap-1.5 text-xs"
    >
      <span className="shrink-0 font-mono text-muted-foreground/50 select-none">{treeChar}</span>
      <span className="font-medium text-foreground/80">{agent.agentLabel}</span>
      {toolCount > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground/60">
            {toolCount} tool{toolCount !== 1 ? 's' : ''}
          </span>
        </>
      )}
      <span className="text-muted-foreground/40">·</span>
      {isDone ? (
        <span className="flex items-center gap-1 text-emerald-500/70">
          <CheckCircle2Icon className="size-3" />
          {agent.durationMs !== undefined ? `${(agent.durationMs / 1000).toFixed(1)}s` : 'done'}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-muted-foreground/50">
          <CircleDotIcon className="size-3 animate-pulse" />
          {latestActivity ?? 'running'}
        </span>
      )}
    </motion.div>
  );
}

function ActiveAgentsPanel({
  agents,
  toolCalls,
  toolResults,
  isStreaming,
}: ActiveAgentsPanelProps) {
  if (!isStreaming || agents.length === 0) return null;

  return (
    <div className="mt-0.5 space-y-0.5 px-3 pb-1">
      {agents.map((agent, index) => (
        <AgentStatusRow
          key={agent.agentId}
          agent={agent}
          isLast={index === agents.length - 1}
          toolCalls={toolCalls}
          toolResults={toolResults}
        />
      ))}
    </div>
  );
}

export function ThinkingWindow({
  reasoning,
  toolCalls,
  toolResults,
  isStreaming,
}: ThinkingWindowProps) {
  // ChatGPT-style: stay collapsed by default (both while streaming and after),
  // surfacing only the header + the latest-thought ticker. The full trace is
  // expand-on-demand. A manual toggle sticks for this message's lifetime.
  const [userOverride, setUserOverride] = React.useState<boolean | null>(null);
  const isOpen = userOverride ?? false;

  const safeToolCalls = React.useMemo(() => toolCalls ?? [], [toolCalls]);
  const safeToolResults = React.useMemo(() => toolResults ?? [], [toolResults]);

  const segments = React.useMemo(
    () => buildThinkingSegments(reasoning, safeToolCalls),
    [reasoning, safeToolCalls],
  );

  const agentSegments = React.useMemo(
    () => segments.filter((s): s is AgentLifecycleSegment => s.kind === 'agent_lifecycle'),
    [segments],
  );

  const currentStage = React.useMemo(() => {
    if (!isStreaming) return null;
    for (let i = reasoning.length - 1; i >= 0; i--) {
      const stage = reasoning[i].stage;
      if (stage && stage !== 'thinking' && STAGE_LABELS[stage]) return STAGE_LABELS[stage];
    }
    return null;
  }, [reasoning, isStreaming]);

  const thoughtCount = segments.reduce(
    (count, segment) => (segment.kind === 'thought' ? count + segment.entries.length : count),
    0,
  );
  const toolCount = segments.reduce(
    (count, segment) => (segment.kind === 'tools' ? count + segment.toolRefs.length : count),
    0,
  );

  const doneLabel = React.useMemo(
    () => formatThoughtDuration(reasoning) ?? 'Reasoning trace',
    [reasoning],
  );

  // While streaming, render the header from t=0 so "Thinking…" appears the instant
  // the run starts (before any thought/tool segment lands). Only bail once the run
  // is finished and produced nothing worth showing.
  if (!isStreaming && segments.length === 0) return null;

  return (
    <ChainOfThought open={isOpen} onOpenChange={setUserOverride} className="space-y-0">
      <CollapsibleTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <SparkleSpinner isActive={isStreaming} className="text-foreground/60" />
            <span className="flex-1 text-left">
              {isStreaming ? (
                <Shimmer as="span" className="text-sm font-medium" duration={1.6}>
                  Thinking…
                </Shimmer>
              ) : (
                <span className="font-medium">{doneLabel}</span>
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
                  className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
                >
                  {currentStage}
                </motion.span>
              )}
            </AnimatePresence>
            <div className="flex items-center gap-1.5">
              {toolCount > 0 && (
                <Badge variant="secondary" className="text-2xs px-1.5">
                  {toolCount} tool{toolCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {thoughtCount > 0 && (
                <Badge variant="outline" className="text-2xs px-1.5">
                  {thoughtCount} thought{thoughtCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <ChevronDownIcon
              className={cn(
                'size-4 shrink-0 transition-transform',
                isOpen ? 'rotate-180' : 'rotate-0',
              )}
            />
          </button>
        }
      />

      {isStreaming && !isOpen ? (
        <AnimatePresence mode="wait">
          <LatestJainaThought reasoning={reasoning} isStreaming />
        </AnimatePresence>
      ) : null}

      {/* Bounded and scrollable: with worker narration in the trace a heavy turn runs to
          dozens of entries, and an unbounded trace pushes the answer itself off screen.
          `overscroll-contain` keeps a scroll that reaches the end from chaining to the
          conversation behind it. */}
      <ChainOfThoughtContent className="max-h-[24rem] space-y-1 overflow-y-auto overscroll-contain px-2 pb-3">
        <ActiveAgentsPanel
          agents={agentSegments}
          toolCalls={toolCalls}
          toolResults={toolResults}
          isStreaming={isStreaming}
        />

        {segments.map((segment, segmentIndex) => {
          const isLast = segmentIndex === segments.length - 1;

          if (segment.kind === 'thought') {
            return (
              <ChainOfThoughtStep
                key={segment.id}
                icon={BrainIcon}
                label="Reasoning"
                status={isStreaming && isLast ? 'active' : 'complete'}
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
                        mode={isStreaming ? 'streaming' : 'static'}
                      />
                    );
                  })}
                </div>
              </ChainOfThoughtStep>
            );
          }

          if (segment.kind === 'handoff') {
            return (
              <ChainOfThoughtStep
                key={segment.id}
                icon={ArrowRightLeftIcon}
                label={
                  segment.status === 'started'
                    ? `Delegating to ${formatAgentLabel(segment.to)}`
                    : `${formatAgentLabel(segment.to)} ${segment.status}`
                }
                status={segment.status === 'started' ? 'active' : 'complete'}
              >
                <Agent className="mt-1">
                  <AgentHeader name={formatAgentLabel(segment.to)} />
                  {segment.objective ? (
                    <AgentContent>
                      <p className="text-xs text-muted-foreground">{segment.objective}</p>
                    </AgentContent>
                  ) : null}
                </Agent>
              </ChainOfThoughtStep>
            );
          }

          if (segment.kind === 'agent_lifecycle') {
            const isActive = isStreaming && isLast && !segment.completeStatus;
            const statusColor =
              segment.completeStatus === 'failed'
                ? 'text-destructive'
                : segment.completeStatus === 'partial'
                  ? 'text-amber-500'
                  : segment.completeStatus === 'completed'
                    ? 'text-emerald-500'
                    : 'text-muted-foreground';

            const workerResolved = segment.workerToolRefs?.length
              ? resolveToolEntries(segment.workerToolRefs, safeToolCalls, safeToolResults)
              : [];
            const lastWorkerEntry = workerResolved[workerResolved.length - 1];
            let workerStatusLine: string | null = null;
            if (lastWorkerEntry) {
              const res = lastWorkerEntry.toolResult;
              if (res) {
                if (!res.ok)
                  workerStatusLine = `${lastWorkerEntry.name} failed${res.error ? ` — ${res.error}` : ''}`;
                else if (res.cached) workerStatusLine = `${lastWorkerEntry.name} (cached)`;
                else {
                  const bytes = (res as { output_bytes?: number }).output_bytes;
                  workerStatusLine = bytes
                    ? `${lastWorkerEntry.name} returned (${bytes}B)`
                    : `${lastWorkerEntry.name} returned`;
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
                status={isActive ? 'active' : 'complete'}
              >
                <Agent className="mt-1">
                  <AgentHeader name={segment.agentLabel} />
                  <AgentContent>
                    {segment.taskDescription && (
                      <p className="text-xs text-foreground/70">{segment.taskDescription}</p>
                    )}
                    {isActive && workerStatusLine && (
                      <p className="text-2xs text-muted-foreground/70 mt-0.5 truncate">
                        {workerStatusLine}
                      </p>
                    )}
                    {segment.durationMs !== undefined && (
                      <p className={cn('text-2xs mt-1', statusColor)}>
                        {segment.completeStatus ?? 'running'} ·{' '}
                        {(segment.durationMs / 1000).toFixed(1)}s
                      </p>
                    )}
                    {segment.error && (
                      <p className="text-2xs text-destructive mt-1">{segment.error}</p>
                    )}
                    {workerResolved.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-2xs text-muted-foreground/50">
                          {workerResolved.filter((e) => e.state !== 'running').length}/
                          {workerResolved.length} tools done
                        </p>
                        {workerResolved.map((entry) => (
                          <Tool key={entry.id} type={entry.name} state={entry.state}>
                            <ToolHeader
                              title={formatToolLabel(entry.name)}
                              showDisclosure={false}
                            />
                          </Tool>
                        ))}
                      </div>
                    )}
                  </AgentContent>
                </Agent>
              </ChainOfThoughtStep>
            );
          }

          // tools segment
          const resolved = resolveToolEntries(segment.toolRefs, safeToolCalls, safeToolResults);
          const clusters = clusterToolEntries(resolved);
          const hasRunning = resolved.some((e) => e.state === 'running');

          return (
            <ChainOfThoughtStep
              key={segment.id}
              icon={WrenchIcon}
              label={`${resolved.length} tool call${resolved.length !== 1 ? 's' : ''}`}
              status={hasRunning ? 'active' : 'complete'}
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
                    <details key={cluster.key} className="rounded-md border border-border/40">
                      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
                        <span className="font-medium">{formatToolLabel(cluster.name)}</span>
                        <Badge variant="secondary" className="text-2xs">
                          {cluster.entries.length} calls
                        </Badge>
                        <div className="ml-auto flex items-center gap-1">
                          {cluster.errorCount > 0 && (
                            <Badge variant="destructive" className="text-2xs">
                              {cluster.errorCount} failed
                            </Badge>
                          )}
                          {cluster.runningCount > 0 && (
                            <Badge variant="secondary" className="text-2xs text-amber-500">
                              {cluster.runningCount} running
                            </Badge>
                          )}
                          {cluster.completedCount > 0 && (
                            <Badge variant="secondary" className="text-2xs text-emerald-500">
                              {cluster.completedCount} done
                            </Badge>
                          )}
                        </div>
                      </summary>
                      <div className="space-y-1.5 px-3 pb-3">
                        {cluster.entries.map((entry) => (
                          <Tool key={entry.id} type={entry.name} state={entry.state}>
                            <ToolHeader
                              title={formatToolLabel(entry.name)}
                              showDisclosure={false}
                            />
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
