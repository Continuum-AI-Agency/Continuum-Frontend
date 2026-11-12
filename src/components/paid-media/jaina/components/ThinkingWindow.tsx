'use client';

import { ArrowRightLeftIcon, BotIcon, BrainIcon, WrenchIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { TraceStep, type TraceStepStatus } from '@/components/chat/TraceStep';
import type { JainaProgressEntry } from '@/components/paid-media/jaina/types';
import { SafeMarkdown } from '@/components/ui/SafeMarkdownLazy';
import { Trace } from '@/components/ui/trace';
import { useUiErrorMessage } from '@/i18n/errors';
import { formatDecimal } from '@/lib/format/decimal';
import type { ToolCallEventData, ToolResultEventData } from '@/lib/jaina/schemas';
import { SparkleSpinner } from './SparkleSpinner';
import {
  type AgentLifecycleSegment,
  buildThinkingSegments,
  clusterToolEntries,
  formatAgentLabel,
  formatThoughtDuration,
  formatToolLabel,
  humanizeStage,
  type ResolvedToolEntry,
  resolveToolCallFromRef,
  resolveToolEntries,
  resolveToolResultFromRef,
  STAGE_LABELS,
  type ThinkingSegment,
  toMarkdownDetail,
} from './thinkingUtils';

type ThinkingWindowProps = {
  reasoning: JainaProgressEntry[];
  toolCalls: ToolCallEventData[];
  toolResults: ToolResultEventData[];
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

/** A sub-agent the turn spawned, live: what it is calling now, or how long it took. */
function AgentStatusLine({
  agent,
  toolCalls,
  toolResults,
}: {
  agent: AgentLifecycleSegment;
  toolCalls: ToolCallEventData[];
  toolResults: ToolResultEventData[];
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const duration = (ms: number) => formatDecimal(ms / 1000, 1, uiLocale) + 's';
  const toolCount = agent.workerToolRefs?.length ?? 0;
  const isDone = Boolean(agent.completeStatus);

  let latestActivity: string | null = null;
  const lastRef = agent.workerToolRefs?.at(-1);
  if (!isDone && lastRef && !resolveToolResultFromRef(lastRef, toolResults)) {
    const call = resolveToolCallFromRef(lastRef, toolCalls);
    const name = call?.name ?? lastRef.replace(/^name:/, '');
    latestActivity = name ? `${formatToolLabel(name, uiText, call?.display_name)}…` : null;
  }

  const description = isDone
    ? [
        toolCount > 0 ? uiText('jainaToolCount', { count: toolCount }) : null,
        agent.durationMs !== undefined ? duration(agent.durationMs) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : (latestActivity ?? (toolCount > 0 ? uiText('jainaToolCount', { count: toolCount }) : null));

  return (
    <TraceStep
      status={agent.completeStatus === 'failed' ? 'error' : isDone ? undefined : 'running'}
      icon={<BotIcon />}
      title={formatAgentLabel(agent.agentId, uiText, agent.agentLabel)}
      description={description || undefined}
    />
  );
}

/** One tool call. Expandable only when it failed, to show why. */
function ToolEntryLine({ entry, isStreaming }: { entry: ResolvedToolEntry; isStreaming: boolean }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatUiError = useUiErrorMessage();
  const duration = (ms: number) => formatDecimal(ms / 1000, 1, uiLocale) + 's';
  const result = entry.toolResult;
  // A call with no result after the stream ended never returned — dim it rather than spin forever.
  const status: TraceStepStatus | undefined =
    entry.state === 'error'
      ? 'error'
      : entry.state === 'running'
        ? isStreaming
          ? 'running'
          : 'pending'
        : undefined;
  const description = [
    result?.cached ? uiText('jainaCached') : null,
    result?.duration_ms !== undefined ? duration(result.duration_ms) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TraceStep
      status={status}
      icon={<WrenchIcon />}
      title={formatToolLabel(entry.name, uiText, entry.toolCall?.display_name)}
      description={description || undefined}
    >
      <figure
        className="m-0 block text-2xs text-muted-foreground"
        aria-label={uiText('jainaTechnicalTool')}
      >
        <code>{entry.name}</code>
      </figure>
      {entry.state === 'error' && result?.error ? (
        <p className="text-xs text-destructive">{formatUiError(result.error)}</p>
      ) : undefined}
    </TraceStep>
  );
}

function SegmentSteps({
  segment,
  isLast,
  isStreaming,
  toolCalls,
  toolResults,
}: {
  segment: ThinkingSegment;
  isLast: boolean;
  isStreaming: boolean;
  toolCalls: ToolCallEventData[];
  toolResults: ToolResultEventData[];
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const formatUiError = useUiErrorMessage();
  const duration = (ms: number) => formatDecimal(ms / 1000, 1, uiLocale) + 's';
  if (segment.kind === 'thought') {
    return (
      <TraceStep
        status={isStreaming && isLast ? 'running' : undefined}
        icon={<BrainIcon />}
        title={uiText('reasoning_d8211e2')}
        defaultOpen
      >
        <div className="space-y-3">
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
      </TraceStep>
    );
  }

  if (segment.kind === 'handoff') {
    const agent = formatAgentLabel(segment.to, uiText);
    return (
      <TraceStep
        status={
          segment.status === 'failed'
            ? 'error'
            : segment.status === 'started' && isStreaming
              ? 'running'
              : undefined
        }
        icon={<ArrowRightLeftIcon />}
        title={
          segment.status === 'started'
            ? uiText('template_abf12bf9e46d', { v0: agent })
            : uiText('jainaHandoffStatus', {
                name: agent,
                status: segment.status,
              })
        }
      >
        {segment.objective ? <p className="text-xs">{segment.objective}</p> : undefined}
      </TraceStep>
    );
  }

  if (segment.kind === 'agent_lifecycle') {
    const workerEntries = segment.workerToolRefs?.length
      ? resolveToolEntries(segment.workerToolRefs, toolCalls, toolResults)
      : [];
    const description = [
      segment.completeStatus && segment.completeStatus !== 'completed'
        ? uiText('jainaAgentStatus', { status: segment.completeStatus })
        : null,
      segment.durationMs !== undefined ? duration(segment.durationMs) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <TraceStep
        status={
          segment.completeStatus === 'failed'
            ? 'error'
            : isStreaming && !segment.completeStatus
              ? 'running'
              : undefined
        }
        icon={<ArrowRightLeftIcon />}
        title={uiText('template_dd8a75cfb856', {
          v0: formatAgentLabel(segment.agentId, uiText, segment.agentLabel),
        })}
        description={description || undefined}
      >
        <div className="space-y-2 text-xs">
          {segment.taskDescription ? (
            <p className="text-foreground/70">{segment.taskDescription}</p>
          ) : null}
          {segment.error ? (
            <p className="text-destructive">{formatUiError(segment.error)}</p>
          ) : null}
          {workerEntries.length > 0 ? (
            <Trace>
              {workerEntries.map((entry) => (
                <ToolEntryLine key={entry.id} entry={entry} isStreaming={isStreaming} />
              ))}
            </Trace>
          ) : null}
        </div>
      </TraceStep>
    );
  }

  const clusters = clusterToolEntries(resolveToolEntries(segment.toolRefs, toolCalls, toolResults));
  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.entries.length === 1) {
          const entry = cluster.entries[0];
          return <ToolEntryLine key={entry.id} entry={entry} isStreaming={isStreaming} />;
        }

        const status: TraceStepStatus | undefined =
          cluster.runningCount > 0 && isStreaming
            ? 'running'
            : cluster.errorCount === cluster.entries.length
              ? 'error'
              : undefined;

        return (
          <TraceStep
            key={cluster.key}
            status={status}
            icon={<WrenchIcon />}
            title={formatToolLabel(
              cluster.name,
              uiText,
              cluster.entries[0]?.toolCall?.display_name,
            )}
            description={uiText('jainaCalls', {
              count: cluster.entries.length,
              failed: cluster.errorCount,
            })}
          >
            <Trace>
              {cluster.entries.map((entry) => (
                <ToolEntryLine key={entry.id} entry={entry} isStreaming={isStreaming} />
              ))}
            </Trace>
          </TraceStep>
        );
      })}
    </>
  );
}

export function ThinkingWindow({
  reasoning,
  toolCalls,
  toolResults,
  isStreaming,
}: ThinkingWindowProps) {
  const uiText = useTranslations('scale');
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
      if (stage && stage !== 'thinking' && STAGE_LABELS[stage]) return humanizeStage(stage, uiText);
    }
    return null;
  }, [reasoning, isStreaming, uiText]);

  const thoughtCount = segments.reduce(
    (count, segment) => (segment.kind === 'thought' ? count + segment.entries.length : count),
    0,
  );
  const toolCount = segments.reduce(
    (count, segment) => (segment.kind === 'tools' ? count + segment.toolRefs.length : count),
    0,
  );

  const doneLabel = React.useMemo(
    () => formatThoughtDuration(reasoning, uiText) ?? 'Reasoning trace',
    [reasoning, uiText],
  );

  // While streaming, render the header from t=0 so "Thinking…" appears the instant
  // the run starts (before any thought/tool segment lands). Only bail once the run
  // is finished and produced nothing worth showing.
  if (!isStreaming && segments.length === 0) return null;

  const summary = [
    currentStage,
    toolCount > 0 ? uiText('jainaToolCount', { count: toolCount }) : null,
    thoughtCount > 0 ? uiText('jainaThoughtCount', { count: thoughtCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div>
      <Trace className="px-3 py-2">
        {/* Bounded and scrollable: with worker narration in the trace a heavy turn runs to
            dozens of entries, and an unbounded trace pushes the answer itself off screen.
            `overscroll-contain` keeps a scroll that reaches the end from chaining to the
            conversation behind it. */}
        <TraceStep
          status={isStreaming ? 'running' : undefined}
          icon={<SparkleSpinner isActive={isStreaming} className="text-foreground/60" />}
          iconClassName="size-auto"
          title={isStreaming ? uiText('thinking_a02f1ce') : doneLabel}
          description={summary || undefined}
          open={isOpen}
          onOpenChange={setUserOverride}
          contentClassName="max-h-[24rem] overflow-y-auto overscroll-contain"
        >
          <Trace>
            {isStreaming
              ? agentSegments.map((agent) => (
                  <AgentStatusLine
                    key={agent.agentId}
                    agent={agent}
                    toolCalls={safeToolCalls}
                    toolResults={safeToolResults}
                  />
                ))
              : null}
            {segments.map((segment, segmentIndex) => (
              <SegmentSteps
                key={segment.id}
                segment={segment}
                isLast={segmentIndex === segments.length - 1}
                isStreaming={isStreaming}
                toolCalls={safeToolCalls}
                toolResults={safeToolResults}
              />
            ))}
          </Trace>
        </TraceStep>
      </Trace>

      {isStreaming && !isOpen ? (
        <AnimatePresence mode="wait">
          <LatestJainaThought reasoning={reasoning} isStreaming />
        </AnimatePresence>
      ) : null}
    </div>
  );
}
