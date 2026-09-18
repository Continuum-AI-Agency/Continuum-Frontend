'use client';

// The argument behind a recommendation, drawn. A pause carries the ad set's cost
// interval (the Poisson CI the engine already computes — narrower means more events,
// more reliable); everything else draws the evidence metric across the 3, 7 and 14 day
// windows with the line it crossed. Inline, in the row: a person comparing two
// recommendations should not have to hover each in turn.

import type { AdSetSnapshot, CycleItemRow, RecommendationRow } from '@continuum/contracts';
import { CpaConfidenceBar } from './CpaConfidenceBar';
import { type EvidenceSeries, evidenceSeries, formatEvidenceValue } from './recQueueModel';

type RecEvidenceChartProps = {
  rec: RecommendationRow;
  snapshot: AdSetSnapshot | null;
  /** The ad set's row from the latest cycle — carries the CI on pause triggers. */
  item: CycleItemRow | null;
  kpiField: string;
  denominatorMultiplier: number;
  maxCpa: number;
  currency: string | null;
  name?: string | null;
};

export function RecEvidenceChart({
  rec,
  snapshot,
  item,
  kpiField,
  denominatorMultiplier,
  maxCpa,
  currency,
  name,
}: RecEvidenceChartProps) {
  const isPause = rec.kind === 'pause';
  if (isPause && item?.diagnostics?.ci) {
    return (
      <div className="space-y-1" data-testid="rec-evidence-ci">
        <p className="text-3xs text-muted-foreground uppercase tracking-wide">
          Cost per result · 95% interval, narrower = more events
        </p>
        <CpaConfidenceBar
          currency={currency}
          denominatorMultiplier={denominatorMultiplier}
          item={item}
          maxCpa={maxCpa}
          name={name ?? undefined}
        />
      </div>
    );
  }
  const series = evidenceSeries(rec.evidence, snapshot, kpiField);
  if (!series) return null;
  return <EvidenceBars currency={currency} series={series} />;
}

function EvidenceBars({ series, currency }: { series: EvidenceSeries; currency: string | null }) {
  const max = Math.max(...series.points.map((p) => p.value), series.threshold ?? 0, 1e-9);
  const thresholdPct =
    series.threshold != null ? Math.min(100, (series.threshold / max) * 100) : null;
  return (
    <div className="space-y-1" data-testid="rec-evidence-bars">
      <p className="text-3xs text-muted-foreground uppercase tracking-wide">
        {series.metric}
        {series.threshold != null && series.thresholdLabel
          ? ` · dashed line = ${series.thresholdLabel} ${formatEvidenceValue(series.unit, series.threshold, currency)}`
          : ''}
      </p>
      <ul className="space-y-0.5">
        {series.points.map((point) => (
          <li className="flex items-center gap-2 text-2xs" key={point.label}>
            <span className="w-7 shrink-0 text-muted-foreground tabular-nums">{point.label}</span>
            <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted/50">
              <span
                className="absolute inset-y-0 left-0 rounded-sm bg-primary/70"
                style={{ width: `${Math.max(1, (point.value / max) * 100)}%` }}
              />
              {thresholdPct != null ? (
                <span
                  aria-hidden
                  className="absolute inset-y-0 border-foreground/70 border-l border-dashed"
                  style={{ left: `${thresholdPct}%` }}
                />
              ) : null}
            </span>
            <span className="w-16 shrink-0 text-right font-medium tabular-nums">
              {formatEvidenceValue(series.unit, point.value, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
