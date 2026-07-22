'use client';

// Objective-aware conversion HEAT funnel. The chart carries the absolute count at
// each stage; the strip beneath it carries the STEP conversion % (this stage /
// previous) heat-colored on the bad→good ramp, so a big drop-off reads red and a
// strong pass-through reads green — count AND rate, not a choice between them. A
// one-line legend explains the heat, and a caption names the objective's terminal
// stage so the reader knows what the funnel is trying to fill. Source is one window
// of engine event counts (a portfolio-summed WindowMetrics or a single ad set's).
// Empty until the portfolio has delivery, per "empty renders, never vanishes".

import { getOptimizationMetricDefinition } from '@continuum/contracts';
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

  const metric = getOptimizationMetricDefinition(objective);
  const terminal = stages.at(-1);

  return (
    <div className="space-y-2">
      <div className="h-40 w-full">
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

      {/* Step conversion % per stage — the count is on the chart, the rate is here. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-3xs text-muted-foreground tabular-nums">
        {stages.map((stage) =>
          stage.stepPct == null ? null : (
            <span className="inline-flex items-center gap-1" key={stage.label}>
              <span className="size-1.5 rounded-full" style={{ background: stage.color }} />
              {stage.label} {Math.round(stage.stepPct * 100)}%
            </span>
          ),
        )}
      </div>

      <p className="text-3xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 align-middle">
          <span className="inline-block h-1.5 w-3 rounded-full bg-destructive/60" />
          drop-off
          <span className="ml-1 inline-block h-1.5 w-3 rounded-full bg-success/60" />
          strong pass-through
        </span>
        {terminal ? ` · goal: ${metric.resultLabel.toLowerCase()}` : ''}
      </p>
    </div>
  );
}
