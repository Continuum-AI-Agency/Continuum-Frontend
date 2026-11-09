'use client';

// Where an agent run's money or tokens went: every step that cost something as a waterfall bar,
// most expensive on top, each bar starting where the one above ended — a dashed guide carries the
// running total down to the next step. One switch re-ranks the same steps by tokens.

import { useMemo, useState } from 'react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
} from '@/components/shared/agent-cards/agentCardKit';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type CostMetric, costSteps, formatTokens, formatUsd, type RunSpan } from './model';
import { DetailRows, RollingTokens, RollingUsd, SpanBar } from './parts';
import { SPAN_KIND, SpanKindTile } from './TraceWaterfall';

const ROW = 'grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_4.5rem_3rem] items-center gap-x-3';

export function CostWaterfall({ spans, className }: { spans: RunSpan[]; className?: string }) {
  const [metric, setMetric] = useState<CostMetric>('cost');
  const { steps, total } = useMemo(() => costSteps(spans, metric), [spans, metric]);
  const format = metric === 'cost' ? formatUsd : formatTokens;

  return (
    <TooltipProvider delay={80}>
      <AgentArtifactCard className={cn('mt-0', className)}>
        <AgentCardHeader
          action={
            <ToggleGroup
              value={metric}
              onValueChange={(next) => {
                if (next) setMetric(next as CostMetric);
              }}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Measure"
            >
              <ToggleGroupItem value="cost">Cost</ToggleGroupItem>
              <ToggleGroupItem value="tokens">Tokens</ToggleGroupItem>
            </ToggleGroup>
          }
        >
          <AgentCardEyebrow label={metric === 'cost' ? 'Spend by step' : 'Tokens by step'} />
          <AgentCardTitle>
            <span className="font-mono tabular-nums">
              {metric === 'cost' ? <RollingUsd value={total} /> : <RollingTokens value={total} />}
            </span>
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              across {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            </span>
          </AgentCardTitle>
        </AgentCardHeader>
        <AgentCardBody className="pt-3 pb-4">
          {steps.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nothing has cost anything yet.
            </p>
          ) : (
            <>
              <ol aria-label={`Steps by ${metric}`} className="flex min-w-0 flex-col text-xs">
                {steps.map(({ span, value, offset, share }, index) => (
                  <li
                    key={span.id}
                    className={cn(
                      ROW,
                      '-mx-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/40',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SpanKindTile span={span} />
                      <span className="truncate" title={span.name}>
                        {span.name}
                      </span>
                      {span.detail && (
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {span.detail}
                        </span>
                      )}
                    </span>
                    <span className="relative h-2.5">
                      {index < steps.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="absolute top-full h-[calc(100%+0.75rem)] border-l border-dashed border-border transition-[left] duration-300 motion-reduce:transition-none"
                          style={{ left: `${(offset + share) * 100}%` }}
                        />
                      )}
                      <span className="absolute inset-0 overflow-hidden">
                        <SpanBar
                          from={offset}
                          share={share}
                          className={index === 0 ? 'bg-primary' : 'bg-primary/45'}
                          tooltip={
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{span.name}</span>
                              <DetailRows
                                rows={[
                                  ['Kind', span.detail ?? SPAN_KIND[span.kind].label],
                                  [metric === 'cost' ? 'Cost' : 'Tokens', format(value)],
                                  ['Running total', format((offset + share) * total)],
                                ]}
                              />
                            </div>
                          }
                        />
                      </span>
                    </span>
                    <span className="text-right font-mono tabular-nums">{format(value)}</span>
                    <Badge
                      variant="muted"
                      className="justify-self-end px-1.5 font-mono text-3xs tabular-nums"
                    >
                      {Math.round(share * 100)}%
                    </Badge>
                  </li>
                ))}
              </ol>
              <div className={cn(ROW, 'mt-1 border-t border-border/60 pt-2 text-xs font-medium')}>
                <span>Total</span>
                <span className="relative h-2.5 overflow-hidden rounded-[3px] bg-primary/15" />
                <span className="text-right font-mono tabular-nums">{format(total)}</span>
                <span className="text-right font-mono text-3xs text-muted-foreground tabular-nums">
                  100%
                </span>
              </div>
            </>
          )}
        </AgentCardBody>
      </AgentArtifactCard>
    </TooltipProvider>
  );
}
