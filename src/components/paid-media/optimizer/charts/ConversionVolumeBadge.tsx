'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// How many conversions the portfolio is tracking — the one confidence read on the surface.
// A count with a floor beside it: "786 conversions · 14d", banded by whether the money sits
// on ad sets that clear the floor. No composite score, no per-objective prior.

import type { RunConfidence } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { conversionVolume } from '../reportModel';

export function ConversionVolumeBadge({
  confidence,
  resultLabel = 'conversions',
  className,
}: {
  confidence: RunConfidence | null | undefined;
  /** The objective's result word: "leads", "conversations", "purchases". */
  resultLabel?: string;
  className?: string;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('scale');
  const BAND: Record<'thin' | 'building' | 'strong', { label: string; className: string }> =
    useMemo(
      () => ({
        thin: { label: 'Thin', className: 'text-amber-600 dark:text-amber-400' },
        building: {
          label: uiText('building_87c5912'),
          className: 'text-sky-600 dark:text-sky-400',
        },
        strong: {
          label: uiText('strong_30a04fd'),
          className: 'text-emerald-600 dark:text-emerald-400',
        },
      }),
      [uiText],
    );

  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const volume = conversionVolume(confidence, optimizerText);
  if (!volume) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)} data-testid="volume-badge">
        {uiText('no_scored_cycle_yet_2acffcf')}
      </span>
    );
  }
  const band = BAND[volume.band];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', className)}
      data-testid="volume-badge"
      title={volume.note}
    >
      <span className="font-semibold text-foreground tabular-nums">{volume.events}</span>
      <span className="text-muted-foreground">
        {uiText.rich('sentence_263f928ba333', { v0: resultLabel })}
      </span>
      <span className={cn('font-medium', band.className)}>{band.label}</span>
      {volume.underFloorIds.length > 0 ? (
        <span className="text-muted-foreground tabular-nums">
          {uiText.rich('sentence_7a9f8157a80b', {
            v0: volume.underFloorIds.length,
          })}
        </span>
      ) : null}
    </span>
  );
}
