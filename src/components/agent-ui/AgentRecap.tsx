'use client';

import { useTranslations } from 'next-intl';
import { useAgentFormats } from './useAgentFormats';

// What the agents did while you were away: the window as a stacked activity chart, then a board
// of what needs you, what failed and what is done, each acted on in place. Fed from Optimizer
// action rows, pending recommendations and finished or failed jobs.

import { CheckCircle2, CircleAlert, CircleDot, PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  AgentArtifactCard,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { groupRecap, RECAP_TONES, type RecapItem, type RecapTone, recapBins } from './model';

export const RECAP_TONE = {
  needs: {
    labelKey: 'm_0d9d0df110' as const,
    icon: CircleDot,
    tile: 'bg-primary/10 text-primary',
    badge: 'violet' as const,
  },
  failed: {
    labelKey: 'failed_031a8f0' as const,
    icon: CircleAlert,
    tile: 'bg-destructive/10 text-destructive',
    badge: 'destructive' as const,
  },
  done: {
    labelKey: 'done_11a6767' as const,
    icon: CheckCircle2,
    tile: 'bg-success/10 text-success',
    badge: 'muted' as const,
  },
};

const getCHART = (tUi: ReturnType<typeof useTranslations<'common'>>): ChartConfig => ({
  needs: { label: tUi('m_0d9d0df110'), color: 'var(--primary)' },
  failed: { label: tUi('failed_031a8f0'), color: 'var(--destructive)' },
  done: {
    label: tUi('done_11a6767'),
    color: 'color-mix(in oklab, var(--muted-foreground) 45%, transparent)',
  },
});

export function AgentRecap({
  since,
  until,
  items,
  onAction,
  bins = 36,
  className,
}: {
  since: number;
  until: number;
  items: RecapItem[];
  onAction?: (item: RecapItem) => void;
  bins?: number;
  className?: string;
}) {
  const { formatAway } = useAgentFormats();

  const uiText = useTranslations('common');
  const CHART = getCHART(uiText);
  const groups = groupRecap(items);
  const data = recapBins(items, since, until, bins).map((bin) => ({
    label: formatRelativeTime(bin.start, until),
    ...bin.counts,
  }));
  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set());
  const waiting = groups.needs.filter((i) => !handled.has(i.id)).length;

  const act = (item: RecapItem) => {
    setHandled((prev) => new Set(prev).add(item.id));
    onAction?.(item);
  };

  return (
    <AgentArtifactCard className={cn('mt-0', className)}>
      <AgentCardHeader
        action={
          waiting > 0 ? (
            <StatusLabel tone="waiting">{uiText('m_eaf85da2dc', { count: waiting })}</StatusLabel>
          ) : (
            <StatusLabel tone="done">{uiText('m_47cbaf0cdf')}</StatusLabel>
          )
        }
      >
        <AgentCardEyebrow label={uiText('while_you_were_away_f55eaca')} />
        <AgentCardTitle>
          {uiText.rich('m_0b17747635', {
            count: items.length,
            duration: formatAway(until - since),
            time: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </AgentCardTitle>
      </AgentCardHeader>
      <figure className="px-3 pt-3 pb-1">
        <ChartContainer config={CHART} className="aspect-auto h-28 w-full">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            barCategoryGap="15%"
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              interval={Math.max(0, Math.floor(bins / 4) - 1)}
            />
            <YAxis hide domain={[0, (max: number) => Math.max(3, max)]} />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Bar dataKey="done" stackId="recap" fill="var(--color-done)" maxBarSize={10} />
            <Bar dataKey="failed" stackId="recap" fill="var(--color-failed)" maxBarSize={10} />
            <Bar
              dataKey="needs"
              stackId="recap"
              fill="var(--color-needs)"
              maxBarSize={10}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </figure>
      <div className="grid min-w-0 grid-cols-1 divide-y divide-border/60 border-t border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {RECAP_TONES.map((tone) => {
          const { labelKey, icon: Icon, tile, badge } = RECAP_TONE[tone];
          const label = uiText(labelKey);
          return (
            <section key={tone} aria-label={label} className="flex min-w-0 flex-col gap-1 p-3">
              <h3 className="flex items-center gap-2 px-1 text-xs font-medium">
                <span className={cn('grid size-5 place-items-center rounded-md', tile)}>
                  <Icon className="size-3" />
                </span>
                {label}
                <Badge variant={badge} className="ml-auto px-1.5 font-mono text-3xs tabular-nums">
                  {groups[tone].length}
                </Badge>
              </h3>
              {groups[tone].length === 0 ? (
                <Empty className="py-4">
                  <EmptyMedia variant="icon">
                    <PartyPopper />
                  </EmptyMedia>
                  <EmptyDescription>{uiText('m_76216f7884')}</EmptyDescription>
                </Empty>
              ) : (
                <ItemGroup className="gap-0.5">
                  {groups[tone].map((item) => (
                    <Item
                      key={item.id}
                      role="listitem"
                      size="xs"
                      className={cn(
                        'items-start rounded-md px-1 transition-opacity hover:bg-muted/40',
                        handled.has(item.id) && 'opacity-50',
                      )}
                    >
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full truncate text-xs" title={item.title}>
                          {item.title}
                        </ItemTitle>
                        <ItemDescription className="truncate text-2xs">
                          {[item.detail, formatRelativeTime(item.at, until)]
                            .filter(Boolean)
                            .join(' · ')}
                        </ItemDescription>
                      </ItemContent>
                      {item.actionLabel && (
                        <ItemActions>
                          {handled.has(item.id) ? (
                            <CheckCircle2
                              aria-label={uiText('m_bee630efb1')}
                              className="size-4 text-success"
                            />
                          ) : (
                            <Button
                              size="xs"
                              variant={tone === 'needs' ? 'default' : 'outline'}
                              onClick={() => act(item)}
                            >
                              {item.actionLabel}
                            </Button>
                          )}
                        </ItemActions>
                      )}
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </section>
          );
        })}
      </div>
    </AgentArtifactCard>
  );
}
