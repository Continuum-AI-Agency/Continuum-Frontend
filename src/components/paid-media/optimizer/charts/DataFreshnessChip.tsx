'use client';

// A quiet, muted marker of how old the snapshot data is, plus a rate-limited Refresh
// control. The optimizer's snapshot cache can serve rows that are hours old (it once
// served pre-deploy rows), and nothing on the surface said so — this chip makes the age
// legible and offers a manual reload. `fetchedAt` is the edge's real Meta read time; when
// a legacy cache row predates that field it arrives null and the chip says so honestly
// ("cached · age unknown") rather than inventing an age. Refresh is gated upstream by a
// client-side cooldown (Meta throttles repeated reads) — this component only reflects it.

import { Clock, RotateCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const HOUR_MS = 60 * 60 * 1_000;

/** The human age label. Relative under an hour ("Data as of 12m ago"), an absolute
 *  24h clock at or beyond it ("Data as of 14:32"), and an explicit unknown when the
 *  read time never came through. Pure so the render test can pin `now`. */
export function formatFreshness(fetchedAt: string | null, now: number = Date.now()): string {
  if (!fetchedAt) return 'cached · age unknown';
  const readAt = Date.parse(fetchedAt);
  if (Number.isNaN(readAt)) return 'cached · age unknown';

  const ageMs = Math.max(0, now - readAt);
  if (ageMs < HOUR_MS) {
    const minutes = Math.floor(ageMs / 60_000);
    return minutes < 1 ? 'Data as of just now' : `Data as of ${minutes}m ago`;
  }
  const clock = new Date(readAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `Data as of ${clock}`;
}

type DataFreshnessChipProps = {
  fetchedAt: string | null;
  onRefresh: () => void;
  canRefresh: boolean;
  isRefreshing?: boolean;
};

export function DataFreshnessChip({
  fetchedAt,
  onRefresh,
  canRefresh,
  isRefreshing = false,
}: DataFreshnessChipProps) {
  const label = formatFreshness(fetchedAt);

  const refreshControl = isRefreshing ? (
    <span className="inline-flex items-center gap-1">
      <RotateCw className="size-3 shrink-0 animate-spin" aria-hidden="true" />
      Refreshing…
    </span>
  ) : (
    <button
      type="button"
      // aria-disabled (not the native attr) keeps the control focusable and hover-reachable
      // so its cooldown tooltip is discoverable; the click is guarded here AND in the hook.
      onClick={canRefresh ? onRefresh : undefined}
      aria-disabled={!canRefresh}
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium text-primary underline-offset-2 transition hover:underline',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground aria-disabled:no-underline aria-disabled:opacity-70 aria-disabled:hover:no-underline',
      )}
    >
      <RotateCw className="size-3 shrink-0" aria-hidden="true" />
      Refresh
    </button>
  );

  // Only the cooldown case earns a tooltip: it is the one disabled state a user can act on
  // (wait, then retry). Mid-refresh already narrates itself.
  const isCoolingDown = !canRefresh && !isRefreshing;

  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground tabular-nums">
      <Clock className="size-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
      <span aria-hidden="true">·</span>
      {isCoolingDown ? (
        <Tooltip>
          <TooltipTrigger render={refreshControl} />
          <TooltipContent className="max-w-56 text-xs">
            Refresh paused — Meta limits how often live data can reload. Try again shortly.
          </TooltipContent>
        </Tooltip>
      ) : (
        refreshControl
      )}
    </span>
  );
}
