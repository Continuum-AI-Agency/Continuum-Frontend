'use client';

// One "Top posts by hook rate" row: rank + cover thumbnail + kind/caption, with
// the hook rate as the emphasis. The whole row is a hover-preview trigger; the
// external-link icon (when a permalink exists) is the only click-through so
// pointer events on the row stay free for HoverCard open/close. On open we
// request a fresh single-post detail so the quick-look gets a live caption and
// an unexpired thumbnail — the same pattern as the dashboard Top Creatives table.

import { ExternalLink } from 'lucide-react';

import { LeaderboardThumbnail } from '@/components/dashboard/briefing/LeaderboardThumbnail';
import { PostQuickLook } from '@/components/organic/cards/PostQuickLook';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { hookRateTextColor } from '@/lib/organic/hook-rate-color';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { cn } from '@/lib/utils';
import { AwarenessPostQuickLook } from './AwarenessPostQuickLook';
import { type AwarenessTopPost, enrichAwarenessTopPost, postKindLabel } from './types';

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

function captionSnippet(post: AwarenessTopPost): string | null {
  const text = post.caption?.trim();
  if (!text) return null;
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

export function AwarenessTopPostRow({
  post,
  rank,
  livePost,
  loadingDetail = false,
  onRequestDetail,
}: {
  post: AwarenessTopPost;
  rank: number;
  // Bulk gallery post or a store-hydrated detail for this id (either may be
  // missing; the awareness snapshot still renders metrics alone).
  livePost?: OrganicPost | null;
  loadingDetail?: boolean;
  onRequestDetail?: (postId: string) => void;
}) {
  const enriched = enrichAwarenessTopPost(post, livePost);
  const kind = postKindLabel(enriched);
  const snippet = captionSnippet(enriched);

  return (
    <HoverCard
      openDelay={120}
      closeDelay={100}
      onOpenChange={(open) => {
        if (open && post.id) onRequestDetail?.(post.id);
      }}
    >
      <HoverCardTrigger
        render={
          <div className="flex w-full cursor-default items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/40">
            <span className="w-4 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
              {rank}
            </span>
            <Thumb post={enriched} seed={kind} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">{kind}</span>
              <span className="truncate text-2xs text-muted-foreground">
                {snippet ?? (enriched.views !== null ? `${nf.format(enriched.views)} views` : '—')}
              </span>
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="flex flex-col items-end">
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    enriched.hookRate === null && 'text-muted-foreground',
                  )}
                  style={
                    enriched.hookRate !== null
                      ? { color: hookRateTextColor(enriched.hookRate) }
                      : undefined
                  }
                >
                  {enriched.hookRate !== null ? `${enriched.hookRate.toFixed(1)}%` : '—'}
                </span>
                <span className="text-3xs uppercase tracking-wide text-muted-foreground">hook</span>
              </span>
              {enriched.permalink ? (
                <a
                  href={enriched.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${kind} on platform`}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                  // Keep the hover card open when the pointer moves to the icon,
                  // but don't treat icon clicks as "select the row".
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : null}
            </span>
          </div>
        }
      />
      <HoverCardContent side="top" align="start" className="w-[min(20rem,calc(100vw-2rem))] p-3">
        {livePost ? (
          <PostQuickLook post={livePost} loading={loadingDetail} />
        ) : (
          <AwarenessPostQuickLook post={enriched} loading={loadingDetail} />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
