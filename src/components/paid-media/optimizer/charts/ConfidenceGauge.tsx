'use client';

import { useTranslations } from 'next-intl';

// Cycle confidence as a BKLit linear gauge. Reads the engine RunConfidence.score
// (0–1) off the latest run. Empty until the first cycle has scored.

import type { RunConfidence } from '@continuum/contracts';

import { Gauge } from '@/components/charts/gauge';
import { ChartEmpty } from './ChartStates';

export function ConfidenceGauge({ confidence }: { confidence: RunConfidence | null | undefined }) {
  const uiText = useTranslations('scale');
  const raw = typeof confidence?.score === 'number' ? confidence.score : null;
  const score = raw == null ? null : Math.round(Math.max(0, Math.min(1, raw)) * 100);

  if (score == null) {
    return <ChartEmpty message={uiText('confidence_appears_after_the_first_scored_cyc_d5b9915')} />;
  }

  return (
    <div className="w-full">
      <Gauge
        orientation="linear"
        value={score}
        centerValue={score}
        suffix="%"
        defaultLabel={uiText('confidence_ff0139d')}
      />
    </div>
  );
}
