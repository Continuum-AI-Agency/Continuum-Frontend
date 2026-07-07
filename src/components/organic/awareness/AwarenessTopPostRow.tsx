'use client';

// One "Top posts by hook rate" row: rank + cover thumbnail + kind/views, with the
// hook rate as the emphasis. The whole row is a hover-preview trigger and clicks
// through to the live post when a permalink exists — the same pattern as the
// "What's Working" ExemplarThumb, so five reels are told apart at a glance instead
// of reading as five identical "REELS" lines.

import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

import { LeaderboardThumbnail } from '@/components/dashboard/briefing/LeaderboardThumbnail';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import { cn } from '@/lib/utils';
import { AwarenessPostQuickLook } from './AwarenessPostQuickLook';
import { type AwarenessTopPost, postKindLabel } from './types';

const nf = new Intl.NumberFormat('en-US');

function Thumb({ post, seed }: { post: AwarenessTopPost; seed: string }) {
  if (post.thumbnailUrl) {
    return (
      <LeaderboardThumbnail
        src={post.thumbnailUrl}
        alt={post.caption ?? `Top ${seed}`}
        fallbackSeed={seed}
        className="size-10"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded border border-border/60 bg-muted/60 font-mono text-xs uppercase text-muted-foreground"
    >
      {seed.trim().charAt(0).toUpperCase() || '•'}
    </span>
  );
}

export function AwarenessTopPostRow({ post, rank }: { post: AwarenessTopPost; rank: number }) {
  const kind = postKindLabel(post);
  const ariaLabel = [
    post.permalink ? 'Open' : 'Top',
    kind,
    post.hookRate !== null ? `· ${post.hookRate.toFixed(1)}% hook rate` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <span className="flex w-full items-center gap-3">
      <span className="w-4 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
        {rank}
      </span>
      <Thumb post={post} seed={kind} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium">{kind}</span>
        <span className="text-2xs text-muted-foreground tabular-nums">
          {post.views !== null ? `${nf.format(post.views)} views` : '—'}
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="flex flex-col items-end">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              post.hookRate === null && 'text-muted-foreground',
            )}
            style={post.hookRate !== null ? { color: hookRateTextColor(post.hookRate) } : undefined}
          >
            {post.hookRate !== null ? `${post.hookRate.toFixed(1)}%` : '—'}
          </span>
          <span className="text-3xs uppercase tracking-wide text-muted-foreground">hook</span>
        </span>
        {post.permalink ? (
          <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
        ) : null}
      </span>
    </span>
  );

  const trigger: ReactNode = post.permalink ? (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className="flex items-center rounded-md px-1 py-1.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-blue-500/60"
    >
      {inner}
    </a>
  ) : (
    <span className="flex cursor-default items-center px-1 py-1.5">{inner}</span>
  );

  return (
    <HoverCard openDelay={120} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-72 p-3">
        <AwarenessPostQuickLook post={post} />
      </HoverCardContent>
    </HoverCard>
  );
}
