'use client';

// Ad profitability as a profit/loss line. The BasedKit ProfitLossLine colors the
// stroke by sign against a HARDCODED zero baseline, so we shift ROAS to a P&L
// number (roas − break-even) upstream: the line runs green above break-even and
// red below it, with the crossing points exactly where the ads stop paying for
// themselves. Break-even defaults to 1.0× (spend recouped). Empty until a few
// days of delivery exist.

import { AreaChart } from '@/components/charts/area-chart';
import { useChartStable, useYScale } from '@/components/charts/chart-context';
import { Grid } from '@/components/charts/grid';
import { ProfitLossLine } from '@/components/charts/profit-loss-line';
import { ChartTooltip } from '@/components/charts/tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { YAxis } from '@/components/charts/y-axis';
import { ChartEmpty } from './ChartStates';
import { type RoasPoint, roasBreakevenSeries } from './vizData';

/** The y=0 crossing IS the chart's subject: above it the ads pay for themselves,
 *  below it they don't. Drawn explicitly because the stroke's green/red is
 *  otherwise the only cue for it, and red-green is exactly the pair a colorblind
 *  reader cannot resolve. Uses the plot's own scale so it stays aligned on resize
 *  (same pattern as the hero's action pins). */
export function BreakevenLine() {
  const { innerWidth } = useChartStable();
  const yScale = useYScale();
  const y = yScale(0);
  if (y == null) return null;

  return (
    <g>
      <line
        stroke="var(--chart-foreground-muted)"
        strokeDasharray="4,4"
        strokeOpacity={0.55}
        x1={0}
        x2={innerWidth}
        y1={y}
        y2={y}
      />
      <text className="text-3xs" fill="var(--chart-foreground-muted)" x={4} y={y - 4}>
        break-even
      </text>
    </g>
  );
}

type RoasProfitLineProps = {
  points: RoasPoint[];
  breakeven?: number;
};

export function RoasProfitLine({ points, breakeven = 1 }: RoasProfitLineProps) {
  const series = roasBreakevenSeries(points, breakeven);

  if (series.length < 2) {
    return <ChartEmpty message="ROAS profitability appears after a few days of delivery." />;
  }

  return (
    <AreaChart
      aspectRatio="4 / 1"
      data={series}
      margin={{ top: 12, right: 12, bottom: 22, left: 12 }}
      xDataKey="date"
    >
      <Grid horizontal />
      <BreakevenLine />
      <ProfitLossLine
        dataKey="pnl"
        negativeColor="var(--destructive)"
        positiveColor="var(--success)"
      />
      <XAxis />
      <YAxis formatValue={(value) => `${(value + breakeven).toFixed(1)}×`} numTicks={3} />
      <ChartTooltip
        indicatorColor={(point) =>
          (point.pnl as number) >= 0 ? 'var(--success)' : 'var(--destructive)'
        }
        rows={(point) => [
          {
            color: (point.pnl as number) >= 0 ? 'var(--success)' : 'var(--destructive)',
            label: 'ROAS',
            value: `${(point.roas as number).toFixed(2)}×`,
          },
        ]}
      />
    </AreaChart>
  );
}
