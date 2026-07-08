'use client';

// Objective-aware conversion HEAT funnel. Each stage past the top shows its step
// conversion rate (this / previous) and is colored on the bad→good ramp, so a big
// drop-off reads red and a strong pass-through reads green — the shape AND the
// color both carry the story. Source is one window of engine event counts (a
// portfolio-summed WindowMetrics or a single ad set's window). Empty until the
// portfolio has delivery, per the surface's "empty renders, never vanishes" rule.

import { FunnelChart } from '@/components/charts/funnel-chart';
import { ChartEmpty } from './ChartStates';
import { buildConversionFunnel, type FunnelWindow } from './vizData';

type FunnelConversionProps = {
  window: FunnelWindow | null | undefined;
  objective: string | null | undefined;
};

export function FunnelConversion({ window, objective }: FunnelConversionProps) {
  const stages = window ? buildConversionFunnel(window, objective) : [];

  if (stages.length === 0 || stages.every((stage) => stage.value === 0)) {
    return <ChartEmpty message="The conversion funnel appears once this portfolio has delivery." />;
  }

  return (
    <div className="h-44 w-full">
      <FunnelChart
        color="var(--chart-1)"
        data={stages}
        gap={4}
        orientation="horizontal"
        showLabels
        showPercentage={false}
        showValues
        style={{ height: '100%' }}
      />
    </div>
  );
}
