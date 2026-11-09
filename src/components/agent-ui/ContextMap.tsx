'use client';

// What fills an agent's context window: a segmented meter of how full it is, then each part of
// the prompt as a tile sized by its tokens, one column per kind, the free space left dashed. Tiles
// glide as the window grows; pointing at a kind in the legend lights its column.

import { LayoutGroup, MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type ContextPart, type ContextPartKind, formatTokens, layoutContext } from './model';
import { DetailRows, RollingTokens } from './parts';

const KIND: Record<ContextPartKind, { label: string; tile: string; swatch: string }> = {
  system: { label: 'System', tile: 'border-chart-1/35 bg-chart-1/10', swatch: 'bg-chart-1' },
  tools: { label: 'Tools', tile: 'border-chart-4/35 bg-chart-4/10', swatch: 'bg-chart-4' },
  memory: { label: 'Memory', tile: 'border-chart-2/35 bg-chart-2/10', swatch: 'bg-chart-2' },
  files: { label: 'Files', tile: 'border-chart-5/35 bg-chart-5/10', swatch: 'bg-chart-5' },
  history: {
    label: 'Chat',
    tile: 'border-foreground/15 bg-foreground/[0.04]',
    swatch: 'bg-muted-foreground',
  },
  results: { label: 'Tool results', tile: 'border-chart-3/35 bg-chart-3/10', swatch: 'bg-chart-3' },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function ContextMap({
  parts,
  maxTokens,
  className,
}: {
  parts: ContextPart[];
  maxTokens: number;
  className?: string;
}) {
  const { groups, usedTokens, freeTokens, freeShare, over } = layoutContext(parts, maxTokens);
  const [focus, setFocus] = useState<ContextPartKind>();
  const fill = usedTokens / Math.max(maxTokens, 1);

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delay={80}>
        <AgentArtifactCard className={cn('mt-0', className)}>
          <AgentCardHeader
            action={
              over ? (
                <StatusLabel tone="failed">Over the window</StatusLabel>
              ) : fill >= 0.8 ? (
                <StatusLabel tone="waiting">{pct(fill)} full</StatusLabel>
              ) : (
                <StatusLabel>{pct(fill)} full</StatusLabel>
              )
            }
          >
            <AgentCardEyebrow label="Context window" />
            <AgentCardTitle>
              <span className={cn('font-mono tabular-nums', over && 'text-destructive')}>
                <RollingTokens value={usedTokens} />
              </span>
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                of {formatTokens(maxTokens)} tokens · {pct(fill)}
                {over && ' — over the window'}
              </span>
            </AgentCardTitle>
          </AgentCardHeader>
          <AgentCardBody className="flex flex-col gap-3 pt-3 pb-4">
            <div
              aria-hidden="true"
              className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted"
            >
              {groups.map((group) => (
                <motion.span
                  layout
                  key={group.kind}
                  className={cn(
                    'h-full transition-opacity',
                    KIND[group.kind].swatch,
                    focus && focus !== group.kind && 'opacity-25',
                  )}
                  style={{ flexGrow: group.tokens, flexBasis: 0 }}
                />
              ))}
              {freeTokens > 0 && (
                <span className="h-full" style={{ flexGrow: freeTokens, flexBasis: 0 }} />
              )}
            </div>
            <LayoutGroup>
              <ul aria-label="Context window" className="flex h-44 min-w-0 gap-1">
                {groups.map((group) => (
                  <motion.li
                    layout
                    key={group.kind}
                    className={cn(
                      'flex min-w-0 flex-col gap-1 transition-opacity duration-200',
                      focus && focus !== group.kind && 'opacity-30',
                    )}
                    style={{ flexGrow: group.tokens, flexBasis: 0 }}
                  >
                    <ul aria-label={KIND[group.kind].label} className="contents">
                      {group.parts.map((part) => (
                        <motion.li
                          layout
                          key={part.id}
                          className="flex min-h-0 min-w-0"
                          style={{ flexGrow: part.tokens, flexBasis: 0 }}
                        >
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <div
                                  className={cn(
                                    'flex min-h-0 w-full flex-col overflow-hidden rounded-md border px-2 py-1.5 transition-shadow hover:ring-2 hover:ring-ring/30',
                                    KIND[group.kind].tile,
                                  )}
                                >
                                  <span className="truncate text-2xs font-medium">
                                    {part.label}
                                  </span>
                                  <span className="truncate font-mono text-3xs text-muted-foreground">
                                    {formatTokens(part.tokens)}
                                  </span>
                                </div>
                              }
                            />
                            <TooltipContent>
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{part.label}</span>
                                <DetailRows
                                  rows={[
                                    ['Kind', KIND[group.kind].label],
                                    ['Tokens', formatTokens(part.tokens)],
                                    ['Of window', pct(part.tokens / Math.max(maxTokens, 1))],
                                  ]}
                                />
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </motion.li>
                      ))}
                    </ul>
                  </motion.li>
                ))}
                {freeTokens > 0 && (
                  <motion.li
                    layout
                    key="free"
                    className="grid min-w-0 place-items-center rounded-md border border-dashed border-border bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--muted)_6px_7px)] text-center"
                    style={{ flexGrow: freeTokens, flexBasis: 0 }}
                  >
                    <span className="flex flex-col px-1">
                      <span className="truncate font-mono text-xs font-medium">
                        {formatTokens(freeTokens)} free
                      </span>
                      <span className="truncate text-3xs text-muted-foreground">
                        {pct(freeShare)} of the window
                      </span>
                    </span>
                  </motion.li>
                )}
              </ul>
            </LayoutGroup>
            <ul aria-label="Legend" className="flex flex-wrap gap-1">
              {groups.map((group) => (
                <li key={group.kind}>
                  <button
                    type="button"
                    onPointerEnter={() => setFocus(group.kind)}
                    onPointerLeave={() => setFocus(undefined)}
                    onFocus={() => setFocus(group.kind)}
                    onBlur={() => setFocus(undefined)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border border-border/60 py-0.5 pr-2 pl-1.5 text-2xs outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
                      focus === group.kind && 'border-foreground/20 bg-muted/60',
                    )}
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', KIND[group.kind].swatch)} />
                    <span>{KIND[group.kind].label}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {formatTokens(group.tokens)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </AgentCardBody>
        </AgentArtifactCard>
      </TooltipProvider>
    </MotionConfig>
  );
}
