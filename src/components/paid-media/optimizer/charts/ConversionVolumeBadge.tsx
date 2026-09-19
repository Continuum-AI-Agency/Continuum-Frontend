'use client';

// How many conversions the portfolio is tracking — the one confidence read on the surface.
// A count with a floor beside it: "786 conversions · 14d", banded by whether the money sits
// on ad sets that clear the floor. No composite score, no per-objective prior.

import type { RunConfidence } from '@continuum/contracts';
import { cn } from '@/lib/utils';
import { conversionVolume } from '../reportModel';

const BAND: Record<'thin' | 'building' | 'strong', { label: string; className: string }> = {
  thin: { label: 'Thin', className: 'text-amber-600 dark:text-amber-400' },
  building: { label: 'Building', className: 'text-sky-600 dark:text-sky-400' },
  strong: { label: 'Strong', className: 'text-emerald-600 dark:text-emerald-400' },
};

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
  const volume = conversionVolume(confidence);
  if (!volume) {
    return (
      <span className={cn('text-2xs text-muted-foreground', className)} data-testid="volume-badge">
        no scored cycle yet
      </span>
    );
  }
  const band = BAND[volume.band];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-2xs', className)}
      data-testid="volume-badge"
      title={volume.note}
    >
      <span className="font-semibold text-foreground tabular-nums">{volume.events}</span>
      <span className="text-muted-foreground">{resultLabel} · 14d</span>
      <span className={cn('font-medium', band.className)}>{band.label}</span>
      {volume.underFloorIds.length > 0 ? (
        <span className="text-muted-foreground tabular-nums">
          · {volume.underFloorIds.length} under floor
        </span>
      ) : null}
    </span>
  );
}
