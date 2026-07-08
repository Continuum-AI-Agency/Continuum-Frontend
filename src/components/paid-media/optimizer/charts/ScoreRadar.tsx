'use client';

// The cycle Confidence score decomposed onto a radar so an operator sees WHY a run
// is (un)trusted — predictiveness, sample size, consistency, and the composite
// overall, each on the 0–100 axis. The polygon takes the band accent (green =
// high, red = low) so trust reads at a glance. Empty until a cycle has scored.

import type { RunConfidence } from '@continuum/contracts';
import { RadarArea } from '@/components/charts/radar-area';
import { RadarAxis } from '@/components/charts/radar-axis';
import { RadarChart } from '@/components/charts/radar-chart';
import { RadarGrid } from '@/components/charts/radar-grid';
import { RadarLabels } from '@/components/charts/radar-labels';
import { ChartEmpty } from './ChartStates';
import { buildConfidenceRadar } from './vizData';
import { confidenceColor } from './vizTokens';

type ScoreRadarProps = {
  confidence: RunConfidence | null | undefined;
  band?: string | null;
};

export function ScoreRadar({ confidence, band }: ScoreRadarProps) {
  const radar = buildConfidenceRadar(confidence, confidenceColor(band));

  if (!radar) {
    return <ChartEmpty message="The confidence radar appears after a scored cycle." />;
  }

  return (
    <div className="mx-auto aspect-square w-full max-w-[300px]">
      <RadarChart data={radar.data} levels={4} margin={48} metrics={radar.metrics}>
        <RadarGrid />
        <RadarAxis />
        <RadarLabels />
        {radar.data.map((series, index) => (
          <RadarArea index={index} key={series.label} />
        ))}
      </RadarChart>
    </div>
  );
}
