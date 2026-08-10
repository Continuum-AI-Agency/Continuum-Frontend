'use client';

// The recommendation label rendered as a link-styled, dotted-underline anchor that
// reveals a plain-language insight on hover/focus. The insight is generated lazily
// (only when the card opens) by the optimizer-insight edge fn and cached, so a
// re-hover is instant. This is PROGRESSIVE ENHANCEMENT: the deterministic `reason`
// stays visible at the call site and is mirrored to assistive tech via
// aria-describedby, so the recommendation is fully explained even if JS/the edge
// fails and the tooltip only ever shows the reason.

import { useId, useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { recommendationLabel, severityTone } from '../reportModel';
import { useOptimizerInsight } from '../useOptimizerData';

type RecommendationInsightProps = {
  brandId: string;
  /** DB recommendation id for enrolled recs; omit for client-side what-if recs. */
  id?: string | null;
  adsetId: string;
  kind: string;
  trigger: string;
  severity?: string | null;
  reason: string;
};

export function RecommendationInsight({
  brandId,
  id,
  adsetId,
  kind,
  trigger,
  severity,
  reason,
}: RecommendationInsightProps) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  const { label, glyph } = recommendationLabel(kind);
  const insight = useOptimizerInsight(
    { brandId, id, adsetId, kind, trigger, severity, reason },
    open,
  );

  const pending = insight.isLoading && !insight.data;
  const text = insight.data?.insight ?? reason;

  return (
    <>
      <HoverCard closeDelay={80} onOpenChange={setOpen} openDelay={120}>
        <HoverCardTrigger
          render={
            <span
              aria-describedby={descriptionId}
              className={cn(
                'cursor-help font-medium text-sm underline decoration-dotted underline-offset-2',
                severityTone(severity),
              )}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: an inline recommendation label is not a native control, so the wrapper must be focusable for keyboard users to open the card and read the insight.
              tabIndex={0}
            >
              {glyph} {label}
            </span>
          }
        />
        <HoverCardContent className="w-72 space-y-2">
          {pending ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full bg-muted/70" />
              <Skeleton className="h-3 w-4/5 bg-muted/70" />
            </div>
          ) : (
            <p className="text-muted-foreground text-xs leading-relaxed">{text}</p>
          )}
        </HoverCardContent>
      </HoverCard>
      <span className="sr-only" id={descriptionId}>
        {`${label}: ${reason}`}
      </span>
    </>
  );
}
