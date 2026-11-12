'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// Canonical apply-mode identifier for portfolios — observe / recommend / autopilot.
// Same kibo-ui Pill + indicator pattern as HeldPill. When autopilot is kill-switched
// (stop), we render a "Stopped" pill so halt is visible without losing the mode.

import type { AutopilotScopes } from '@continuum/contracts';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { applyModeExplainer, applyModePill } from './reportModel';

export function ApplyModePill({
  applyMode,
  autopilotPaused,
  scopes,
  className,
}: {
  applyMode: string | null | undefined;
  /** Autopilot kill-switch — halt autonomous writes without leaving autopilot mode. */
  autopilotPaused?: boolean | null;
  /** What autopilot may approve; named in the tooltip when present. */
  scopes?: AutopilotScopes | null;
  className?: string;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const meta = applyModePill(applyMode, optimizerText);
  if (!meta) return null;

  const stopped = Boolean(autopilotPaused) && (applyMode ?? '').toLowerCase() === 'autopilot';
  const label = stopped ? uiText('portfolioHeaderMode',{mode:'stopped'}) : meta.label;
  const variant = stopped ? 'warning' : meta.variant;
  const indicator = stopped ? 'warning' : meta.indicator;
  const tip = stopped
    ? uiText('applyModeStoppedHint')
    : applyModeExplainer(applyMode, scopes, optimizerText, uiLocale);

  return (
    <Tooltip>
      {/* A span, not a button: the pill renders inside whole-card <button>s
          (PortfolioRowCard / PortfolioCard), where a nested button is invalid HTML
          and trips a React hydration warning. The pill's visible text is the
          accessible content; the tooltip is hover-triggered supplementary detail. */}
      <TooltipTrigger
        render={
          <span className="inline-flex rounded-full">
            <Pill variant={variant} className={cn('cursor-default text-xs', className)}>
              <PillIndicator variant={indicator} />
              {label}
            </Pill>
          </span>
        }
      />
      <TooltipContent className="max-w-64 text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}
