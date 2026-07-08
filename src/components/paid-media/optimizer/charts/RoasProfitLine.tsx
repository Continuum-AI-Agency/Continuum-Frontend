'use client';

// Ad profitability as a profit/loss line. The BasedKit ProfitLossLine colors the
// stroke by sign against a HARDCODED zero baseline, so we shift ROAS to a P&L
// number (roas − break-even) upstream: the line runs green above break-even and
// red below it, with the crossing points exactly where the ads stop paying for
// themselves. Break-even defaults to 1.0× (spend recouped). Empty until a few
// days of delivery exist.

import { AreaChart } from '@/components/charts/area-chart';
import { Grid } from '@/components/charts/grid';
import { ProfitLossLine } from '@/components/charts/profit-loss-line';
import { ChartTooltip } from '@/components/charts/tooltip';
import { XAxis } from '@/components/charts/x-axis';
import { ChartEmpty } from './ChartStates';
import { type RoasPoint, roasBreakevenSeries } from './vizData';

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
      <ProfitLossLine
        dataKey="pnl"
        negativeColor="var(--destructive)"
        positiveColor="var(--success)"
      />
      <XAxis />
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
