'use client';

// Canonical apply-mode identifier for portfolios — observe / recommend / autopilot.
// Same kibo-ui Pill + indicator pattern as HeldPill. When autopilot is kill-switched
// (stop), we render a "Stopped" pill so halt is visible without losing the mode.

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { applyModeExplainer, applyModePill } from './reportModel';

export function ApplyModePill({
  applyMode,
  autopilotPaused,
  className,
}: {
  applyMode: string | null | undefined;
  /** Autopilot kill-switch — halt autonomous writes without leaving autopilot mode. */
  autopilotPaused?: boolean | null;
  className?: string;
}) {
  const meta = applyModePill(applyMode);
  if (!meta) return null;

  const stopped = Boolean(autopilotPaused) && (applyMode ?? '').toLowerCase() === 'autopilot';
  const label = stopped ? 'Stopped' : meta.label;
  const variant = stopped ? 'warning' : meta.variant;
  const indicator = stopped ? 'warning' : meta.indicator;
  const tip = stopped
    ? 'Stop — autopilot writes are halted. Resume from Manage, or switch to Observe / Recommend.'
    : applyModeExplainer(applyMode);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={stopped ? 'Apply mode: Autopilot (stopped)' : `Apply mode: ${meta.label}`}
        >
          <Pill variant={variant} className={className ?? 'cursor-default'}>
            <PillIndicator variant={indicator} />
            {label}
          </Pill>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}
