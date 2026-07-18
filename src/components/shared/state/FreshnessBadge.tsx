'use client';

// Presentational "last sync / source status" pill for data-dependent surfaces
// (IMP-016 / BUG-017), so a user can tell missing vs stale vs syncing vs failed
// apart at a glance. Data-agnostic: it renders a derived FreshnessMeta and never
// fetches. The status->tone/label projection is a pure exported helper so it can
// be unit-tested without a DOM. A tooltip carries the fuller detail (exact time,
// source, next sync, error) the badge itself keeps compact.

import { useId } from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type FreshnessMeta,
  type FreshnessStatus,
  formatFreshnessAge,
} from '@/lib/freshness/freshnessMeta';
import { cn } from '@/lib/utils';

type FreshnessTone = 'success' | 'warning' | 'error' | 'info';

export type FreshnessPresentation = {
  label: string;
  // null when the status has no dot (never synced) so the pill renders neutral.
  tone: FreshnessTone | null;
  pulse: boolean;
};

const STATUS_LABEL: Record<FreshnessStatus, (age: string | null) => string> = {
  fresh: (age) => (age ? `Synced ${age}` : 'Synced'),
  stale: (age) => (age ? `Updated ${age}` : 'Stale'),
  syncing: () => 'Syncing…',
  never: () => 'Not synced yet',
  error: () => 'Sync failed',
};

const STATUS_TONE: Record<FreshnessStatus, FreshnessTone | null> = {
  fresh: 'success',
  stale: 'warning',
  syncing: 'info',
  never: null,
  error: 'error',
};

// Pure projection from a FreshnessMeta to the pill's visible label + dot tone.
// Exported for unit tests; the component is a thin render over it.
export function freshnessBadgePresentation(freshness: FreshnessMeta): FreshnessPresentation {
  return {
    label: STATUS_LABEL[freshness.status](formatFreshnessAge(freshness.cache_age_seconds)),
    tone: STATUS_TONE[freshness.status],
    pulse: freshness.status === 'syncing',
  };
}

function formatExactTime(iso: string | null): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toLocaleString();
}

type FreshnessBadgeProps = {
  freshness: FreshnessMeta;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

export function FreshnessBadge({ freshness, side = 'top', className }: FreshnessBadgeProps) {
  const { label, tone, pulse } = freshnessBadgePresentation(freshness);
  const descriptionId = useId();
  const exact = formatExactTime(freshness.last_synced_at);
  const nextSync = formatExactTime(freshness.next_sync_at);

  const detail = [
    exact ? `Last synced ${exact}` : null,
    freshness.source ? `Source: ${freshness.source}` : null,
    nextSync ? `Next sync ${nextSync}` : null,
    freshness.error ?? null,
  ].filter((line): line is string => Boolean(line));

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Pill
            variant="secondary"
            aria-describedby={descriptionId}
            className={cn('cursor-default text-secondary-foreground', className)}
          >
            {tone ? <PillIndicator variant={tone} pulse={pulse} /> : null}
            {label}
          </Pill>
        </TooltipTrigger>
        {detail.length ? (
          <TooltipContent side={side} className="max-w-xs">
            {detail.map((line) => (
              <p key={line} className="text-xs">
                {line}
              </p>
            ))}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {detail.length ? `${label}. ${detail.join('. ')}` : label}
      </span>
    </TooltipProvider>
  );
}
