'use client';

// One top-creative thumbnail in the "What's Working" table: a signed-URL-safe
// image with its real metric shown inline beneath it (so it reads as a ranked
// performer, not decoration), a hover-card preview, and click-through to the
// live post when a permalink exists.

import type { ReactNode } from 'react';
import { LeaderboardThumbnail } from '@/components/dashboard/briefing/LeaderboardThumbnail';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import type { ExemplarView } from '@/lib/organic/creative-strategy-rows';
import { ExemplarQuickLook } from './ExemplarQuickLook';

function ThumbImage({ exemplar, seed }: { exemplar: ExemplarView; seed: string }) {
  if (exemplar.thumbnailUrl) {
    return (
      <LeaderboardThumbnail
        src={exemplar.thumbnailUrl}
        alt={exemplar.snippet ?? `Top ${exemplar.kind}`}
        fallbackSeed={seed}
        className="size-11"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/60 font-mono text-xs uppercase text-muted-foreground"
    >
      {seed.trim().charAt(0).toUpperCase() || '•'}
    </span>
  );
}

export function ExemplarThumb({ exemplar, seed }: { exemplar: ExemplarView; seed: string }) {
  const ariaLabel = [
    exemplar.permalinkUrl ? 'Open' : 'Top',
    exemplar.kind,
    exemplar.metricValueLabel ? `· ${exemplar.metricName} ${exemplar.metricValueLabel}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <span className="flex flex-col items-center gap-0.5">
      <ThumbImage exemplar={exemplar} seed={seed} />
      {exemplar.metricValueLabel ? (
        <span className="text-2xs font-medium tabular-nums text-muted-foreground">
          {exemplar.metricValueLabel}
        </span>
      ) : null}
    </span>
  );

  const trigger: ReactNode = exemplar.permalinkUrl ? (
    <a
      href={exemplar.permalinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      {inner}
    </a>
  ) : (
    <span className="cursor-default">{inner}</span>
  );

  return (
    <HoverCard openDelay={120} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72 p-3">
        <ExemplarQuickLook exemplar={exemplar} />
      </HoverCardContent>
    </HoverCard>
  );
}
