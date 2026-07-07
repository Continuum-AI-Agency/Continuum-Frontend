'use client';

// Cycle confidence as a BKLit linear gauge. Reads the engine RunConfidence.score
// (0–1) off the latest run. Empty until the first cycle has scored.

import type { RunConfidence } from '@continuum/contracts';

import { Gauge } from '@/components/charts/gauge';

export function ConfidenceGauge({ confidence }: { confidence: RunConfidence | null | undefined }) {
  const raw = typeof confidence?.score === 'number' ? confidence.score : null;
  const score = raw == null ? null : Math.round(Math.max(0, Math.min(1, raw)) * 100);

  if (score == null) {
    return (
      <p className="text-xs text-muted-foreground">Confidence appears after the first cycle.</p>
    );
  }

  return (
    <div className="w-full">
      <Gauge
        orientation="linear"
        value={score}
        centerValue={score}
        suffix="%"
        defaultLabel="confidence"
      />
    </div>
  );
}
