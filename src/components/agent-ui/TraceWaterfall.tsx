'use client';

import { useTranslations } from 'next-intl';
import { useAgentFormats } from './useAgentFormats';

// Where the time and money of one agent run went: every agent, LLM call and tool call as a bar
// on the run's clock over a tick grid, branches folding into their parent with cost rolled up,
// the slowest finished call marked. Running steps grow as the host advances `nowMs`.

import { Bot, ChevronRight, CircleAlert, Sparkles, Timer, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  niceTicks,
  orderSpans,
  type RunSpan,
  slowestSpan,
  spanEnd,
  summarizeRun,
  visibleRows,
} from './model';
import { DetailRows, RollingTokens, RollingUsd, SpanBar, StatBand } from './parts';

export const SPAN_KIND = {
  agent: {
    icon: Bot,
    labelKey: 'm_5ce2e6f402' as const,
    bar: 'bg-muted-foreground/25',
    swatch: 'bg-muted-foreground/40',
  },
  llm: {
    icon: Sparkles,
    labelKey: 'm_76f6d0bb8d' as const,
    bar: 'bg-primary',
    swatch: 'bg-primary',
  },
  tool: {
    icon: Wrench,
    labelKey: 'm_e313188e62' as const,
    bar: 'bg-primary/40',
    swatch: 'bg-primary/40',
  },
};

export function SpanKindTile({ span }: { span: RunSpan }) {
  const Icon = SPAN_KIND[span.kind].icon;
  return (
    <span
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground',
        span.status === 'error' && 'bg-destructive/10 text-destructive',
      )}
    >
      {span.status === 'running' ? (
        <Spinner className="size-3 text-primary" />
      ) : span.status === 'error' ? (
        <CircleAlert className="size-3" />
      ) : (
        <Icon className="size-3" />
      )}
    </span>
  );
}

export function TraceWaterfall({
  spans,
  nowMs,
  title,
  className,
}: {
  spans: RunSpan[];
  /** The run clock for steps still running; defaults to the last thing that happened. */
  nowMs?: number;
  /** What the run was asked; defaults to the root step's detail. */
  title?: string;
  className?: string;
}) {
  const { formatClock, formatTokens, formatUsd } = useAgentFormats();

  const uiText = useTranslations('common');
  const now = nowMs ?? Math.max(0, ...spans.map((s) => s.endMs ?? s.startMs));
  const rows = useMemo(() => orderSpans(spans), [spans]);
  const slowest = useMemo(() => slowestSpan(spans), [spans]);
  const summary = summarizeRun(spans, now);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const length = Math.max(summary.durationMs, 1);
  const ticks = niceTicks(summary.durationMs);
  const frac = (ms: number) => (ms - summary.startMs) / length;
  const heading = title ?? rows[0]?.span.detail ?? uiText('m_f5b3ee27f4');

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <TooltipProvider delay={80}>
      <AgentArtifactCard className={cn('mt-0', className)}>
        <AgentCardHeader
          action={
            summary.live ? (
              <StatusLabel tone="running">{uiText('running_f4ccae2')}</StatusLabel>
            ) : spans.length > 0 ? (
              <StatusLabel tone="done">{uiText('m_355bcc577d')}</StatusLabel>
            ) : (
              <StatusLabel>{uiText('waiting_6e293a8')}</StatusLabel>
            )
          }
        >
          <AgentCardEyebrow label={uiText('run_trace_20a6ebc')} />
          <AgentCardTitle>{heading}</AgentCardTitle>
        </AgentCardHeader>
        <StatBand
          className="mt-3"
          stats={[
            { label: uiText('duration_4fc52a3'), value: formatClock(summary.durationMs) },
            { label: uiText('cost_204a5eb'), value: <RollingUsd value={summary.costUsd} /> },
            { label: uiText('tokens_a039dfb'), value: <RollingTokens value={summary.tokens} /> },
            {
              label: uiText('m_0a19b7e26b'),
              value: summary.llmCalls + summary.toolCalls,
              hint: `${summary.llmCalls} LLM · ${summary.toolCalls} tool`,
            },
            { label: uiText('m_805e86a8cb'), value: summary.errors, danger: summary.errors > 0 },
          ]}
        />
        <AgentCardBody className="py-3">
          {spans.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {uiText('m_8fa85ac9ab')}
            </p>
          ) : (
            <table aria-label={uiText('run_trace_20a6ebc')} className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-2/5" />
                <col />
                <col className="w-14" />
                <col className="w-16" />
              </colgroup>
              <thead>
                <tr className="text-3xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="pb-1.5 text-left font-medium">
                    {uiText('m_dc416e1088')}
                  </th>
                  <th scope="col" className="px-3 pb-1.5 font-medium">
                    <div className="relative h-3">
                      {ticks.map((tick) => (
                        <span
                          key={tick}
                          className={cn(
                            'absolute top-0 font-mono normal-case',
                            tick > 0 && '-translate-x-1/2',
                          )}
                          style={{ left: `${(tick / length) * 100}%` }}
                        >
                          {formatClock(tick)}
                        </span>
                      ))}
                    </div>
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    {uiText('time_33b9347')}
                  </th>
                  <th scope="col" className="pb-1.5 text-right font-medium">
                    {uiText('cost_204a5eb')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows(rows, collapsed).map(
                  ({ span, depth, hasChildren, costUsd, tokens }) => {
                    const end = spanEnd(span, now);
                    const folded = collapsed.has(span.id);
                    return (
                      <tr
                        key={span.id}
                        className="group/row border-t border-border/50 transition-colors hover:bg-muted/40"
                      >
                        <td className="py-1.5">
                          <div
                            className="flex min-w-0 items-center gap-1.5"
                            style={{ paddingLeft: `${depth * 0.875}rem` }}
                          >
                            {hasChildren ? (
                              <button
                                type="button"
                                onClick={() => toggle(span.id)}
                                aria-expanded={!folded}
                                aria-label={`${folded ? uiText('expand_07548c2') : uiText('collapse_be6eb1f')} ${span.name}`}
                                className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ChevronRight
                                  className={cn(
                                    'size-3 transition-transform duration-200',
                                    !folded && 'rotate-90',
                                  )}
                                />
                              </button>
                            ) : (
                              <span className="size-4 shrink-0" />
                            )}
                            <SpanKindTile span={span} />
                            <span
                              className={cn('truncate', span.kind === 'agent' && 'font-medium')}
                              title={span.name}
                            >
                              {span.name}
                            </span>
                            {span.id === slowest && (
                              <Badge variant="warning" className="px-1.5 text-3xs">
                                <Timer />
                                {uiText('m_b70a21cd9f')}
                              </Badge>
                            )}
                            {span.detail && (
                              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                {span.detail}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="relative h-2">
                            {ticks.map((tick) => (
                              <span
                                key={tick}
                                aria-hidden="true"
                                className="absolute -inset-y-1.5 w-px bg-border/50"
                                style={{ left: `${(tick / length) * 100}%` }}
                              />
                            ))}
                            <div className="absolute inset-0 overflow-hidden">
                              <SpanBar
                                from={frac(span.startMs)}
                                share={(end - span.startMs) / length}
                                className={cn(
                                  span.status === 'error'
                                    ? 'bg-destructive'
                                    : SPAN_KIND[span.kind].bar,
                                  span.status === 'running' &&
                                    'animate-pulse motion-reduce:animate-none',
                                )}
                                tooltip={
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium">{span.name}</span>
                                    <DetailRows
                                      rows={[
                                        [
                                          'Kind',
                                          span.detail ?? uiText(SPAN_KIND[span.kind].labelKey),
                                        ],
                                        [
                                          'Window',
                                          `${formatClock(span.startMs)} → ${formatClock(end)}`,
                                        ],
                                        ['Tokens', tokens > 0 ? formatTokens(tokens) : '—'],
                                        ['Cost', costUsd > 0 ? formatUsd(costUsd) : '—'],
                                      ]}
                                    />
                                  </div>
                                }
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                          {formatClock(end - span.startMs)}
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {costUsd > 0 ? (
                            formatUsd(costUsd)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          )}
        </AgentCardBody>
        <div className="flex items-center gap-3 border-t border-border/60 px-4 py-2 text-2xs text-muted-foreground">
          {(['llm', 'tool', 'agent'] as const).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-3 rounded-full', SPAN_KIND[kind].swatch)} />
              {uiText(SPAN_KIND[kind].labelKey)}
            </span>
          ))}
          <span className="ml-auto">{uiText('m_84f2ac8872')}</span>
        </div>
      </AgentArtifactCard>
    </TooltipProvider>
  );
}
