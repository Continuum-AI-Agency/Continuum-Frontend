'use client';

// Per-competitor operational health chip for Brand Spy (IMP-009 / FEAT-009).
// Renders the shared health-chip projection as a toned pill and, on hover/focus,
// explains what the state means, how to fix it, and the setup diagnostics behind
// it — last sync, ads found, and any sync error. This is the "is this actually
// working?" answer that a bare "tracked" row never gave.

import type { Competitor, CompetitorHealthTone } from '@continuum/contracts';
import { useId } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { competitorHealthChip, competitorHealthGuidance } from './competitorHealth';

const TONE_CLASS: Record<CompetitorHealthTone, string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  neutral: 'border-border bg-muted text-muted-foreground',
};

function lastSyncedLabel(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Not synced yet';
  return `Synced ${formatRelativeTime(parsed)}`;
}

export function CompetitorHealthBadge({
  competitor,
  adsFound,
  className,
}: {
  competitor: Competitor;
  adsFound?: number | null;
  className?: string;
}) {
  const chip = competitorHealthChip(competitor, adsFound);
  const guidance = competitorHealthGuidance(chip.state);
  const synced = lastSyncedLabel(chip.last_synced_at);
  const error = competitor.metaPageResolutionError ?? null;
  const descriptionId = useId();

  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the chip is a status label, not a native control, so it must be focusable for keyboard users to reach the diagnostics tooltip.
              tabIndex={0}
              aria-describedby={descriptionId}
              className={cn(
                'inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
                TONE_CLASS[chip.tone],
                className,
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
              {chip.label}
            </span>
          }
        />
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm font-medium">{chip.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{guidance}</p>
          <dl className="mt-2 space-y-0.5 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Last sync</dt>
              <dd className="tabular-nums">{synced}</dd>
            </div>
            {typeof adsFound === 'number' ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Ads found</dt>
                <dd className="tabular-nums">{adsFound}</dd>
              </div>
            ) : null}
            {error ? <p className="mt-1 text-destructive">{error}</p> : null}
          </dl>
        </TooltipContent>
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {`${chip.label}. ${guidance}`}
      </span>
    </TooltipProvider>
  );
}
