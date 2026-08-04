'use client';

// Brand readiness as a bklit radar: seven dimensions on a 0–100 domain, polygon
// tinted by the overall score band (teal / amber / rose). Labels carry the
// rounded score so the operator can read absolute values without a tooltip.

import { RadarArea } from '@/components/charts/radar-area';
import { RadarAxis } from '@/components/charts/radar-axis';
import { RadarChart } from '@/components/charts/radar-chart';
import { RadarGrid } from '@/components/charts/radar-grid';
import { RadarLabels } from '@/components/charts/radar-labels';
import type { ReadinessAnalysis } from '@/lib/onboarding/agentClient';
import { BAND_STYLES, bandFor } from './ScoreBadge';
import { DIMENSION_DISPLAY_ORDER, DIMENSION_LABELS } from './utils';

type Props = {
  readiness: ReadinessAnalysis;
};

export function ReadinessRadarChart({ readiness }: Props) {
  const seriesColor = BAND_STYLES[bandFor(readiness.overall_score)].pip;

  const metrics = DIMENSION_DISPLAY_ORDER.map((dim) => {
    const score = readiness.dimensions[dim].score;
    return {
      key: dim,
      label: `${DIMENSION_LABELS[dim]} · ${Math.round(score)}`,
    };
  });

  const data = [
    {
      label: 'Readiness',
      color: seriesColor,
      values: Object.fromEntries(
        DIMENSION_DISPLAY_ORDER.map((dim) => [dim, readiness.dimensions[dim].score]),
      ) as Record<string, number>,
    },
  ];

  return (
    <div className="mx-auto aspect-square w-full max-w-[280px]" data-testid="readiness-radar">
      <RadarChart data={data} levels={4} margin={52} metrics={metrics}>
        <RadarGrid />
        <RadarAxis />
        <RadarLabels fontSize={10} offset={22} />
        {data.map((series, index) => (
          <RadarArea index={index} key={series.label} />
        ))}
      </RadarChart>
    </div>
  );
}
