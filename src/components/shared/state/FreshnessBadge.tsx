'use client';

// Presentational "last sync / source status" stamp for data-dependent surfaces
// (IMP-016 / BUG-017), so a user can tell missing vs stale vs syncing vs failed
// apart at a glance. Deliberately chrome-free (no fill, no border): a sync
// timestamp is toolbar metadata, not a status chip competing with the controls
// beside it. The tone dot carries the state; the text carries the age.
// Data-agnostic: it renders a derived FreshnessMeta and never fetches. The
// status->tone/label projection is a pure exported helper so it can be
// unit-tested without a DOM. A tooltip carries the fuller detail (exact time,
// source, next sync, error) the stamp itself keeps compact.

import { useId } from 'react';
import { PillIndicator } from '@/components/kibo-ui/pill';
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
  // UTC, not the ambient locale/timezone: toLocaleString() differs between the
  // SSR host and the browser and would trip React hydration. An ISO-derived
  // string renders identically on server and client.
  return `${new Date(ts).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
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
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-describedby={descriptionId}
              className={cn(
                'inline-flex cursor-default items-center gap-1.5 whitespace-nowrap text-2xs text-muted-foreground',
                className,
              )}
            >
              {tone ? <PillIndicator variant={tone} pulse={pulse} /> : null}
              {label}
            </span>
          }
        />
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
