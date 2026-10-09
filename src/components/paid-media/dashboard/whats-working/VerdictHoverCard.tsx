'use client';

// Hover reveal for one kill/scale/iterate verdict, following the pattern of the
// optimizer's CreativeHoverCard: the compact row carries only the identity, the
// hover carries the creative itself plus the figure-bearing reason.
//
// The thumbnail is rendered through ChatMediaThumb rather than a raw <img> so a
// stale Meta CDN URL can re-resolve: the thumb's onError drives `onRecover`,
// which fetches a fresh Graph URL, and the recovered URL arrives back as
// `freshUrl`. Without that wiring the hover reveals a letter tile, which is
// exactly the failure this card exists to avoid.

import type { PaidCreativeVerdict } from '@continuum/contracts';
import type { ReactElement } from 'react';
import { ChatMediaThumb } from '@/components/chat/media/ChatMedia';
import { mediaFromPaidVerdict } from '@/components/chat/media/media';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { cohortMultipleLabel, money, VERDICT_STYLE } from './whatsWorkingModel';

type VerdictHoverCardProps = {
  verdict: PaidCreativeVerdict;
  freshUrl: string | null;
  onRecover: (adId: string) => void;
  /** The ad account's ISO currency. Unknown prints bare figures, never "$". */
  currency?: string | null;
  /** Single element: it becomes the hover-card trigger via Base UI `render`. */
  children: ReactElement;
};

export function VerdictHoverCard({
  verdict,
  freshUrl,
  onRecover,
  currency = null,
  children,
}: VerdictHoverCardProps) {
  const media = mediaFromPaidVerdict({
    ...verdict,
    thumbnailUrl: freshUrl ?? verdict.thumbnailUrl,
  });
  const label = verdict.adName ?? verdict.adId;
  const cohortMultiple = cohortMultipleLabel(verdict);

  return (
    <HoverCard closeDelay={80} openDelay={120}>
      <HoverCardTrigger render={children} />
      <HoverCardContent className="w-72 space-y-3">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md bg-muted/50">
          {media ? (
            <ChatMediaThumb
              className="rounded-md"
              fallbackSeed={label}
              media={media}
              onRecover={() => onRecover(verdict.adId)}
            />
          ) : (
            <span className="grid size-full place-items-center text-xs text-muted-foreground">
              No preview
            </span>
          )}
        </div>

        <div className="space-y-1">
          <p className="truncate font-medium text-sm text-foreground">{label}</p>
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
                VERDICT_STYLE[verdict.verdict],
              )}
            >
              {verdict.verdict}
            </span>
            <span className="rounded bg-muted px-1 py-px text-xs uppercase text-muted-foreground">
              {verdict.funnelStage}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{verdict.reason}</p>

        <div className="flex items-center justify-between border-border/60 border-t pt-2 text-xs text-muted-foreground tabular-nums">
          <span>30d spend {money(verdict.spend, currency)}</span>
          <span>CPA {money(verdict.cpa, currency)}</span>
        </div>
        {cohortMultiple ? (
          <p className="text-xs text-muted-foreground tabular-nums">{cohortMultiple}</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
