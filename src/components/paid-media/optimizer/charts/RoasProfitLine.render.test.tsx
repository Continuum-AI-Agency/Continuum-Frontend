import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { scaleLinear } from 'd3-scale';
import * as realChartContext from '@/components/charts/chart-context';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx AreaChart container (needs ResizeObserver). It ignores its
// children, so ProfitLossLine/Grid/XAxis/YAxis/ChartTooltip never render (no chart
// context needed) — here we only assert the empty-vs-populated switch. The
// break-even marker is exercised on its own below, against a real scale.
mock.module('@/components/charts/area-chart', () => ({
  AreaChart: () => <div data-testid="pnl-chart" />,
}));

// Stub only the two hooks BreakevenLine reads. The rest of chart-context is
// spread through from the real module: mock.module REPLACES a module
// process-wide and siblings import useChart/chartCssVars from here. Imported
// statically — an async importOriginal against a module in this same package
// deadlocks under bun.
const yScale = scaleLinear().domain([-1, 2]).range([100, 0]);
mock.module('@/components/charts/chart-context', () => ({
  ...realChartContext,
  useChartStable: () => ({ innerWidth: 300, innerHeight: 100 }),
  useYScale: () => yScale,
}));

const { RoasProfitLine, BreakevenLine } = await import('./RoasProfitLine');

afterEach(cleanup);

describe('RoasProfitLine', () => {
  it('stays empty until at least two days of ROAS exist', () => {
    const { getByText, queryByTestId } = render(
      <RoasProfitLine points={[{ date: '2026-07-01', roas: 2 }]} />,
    );
    expect(getByText(/ROAS profitability appears/i)).toBeTruthy();
    expect(queryByTestId('pnl-chart')).toBeNull();
  });

  it('renders the profit/loss chart once a series exists', () => {
    const { getByTestId } = render(
      <RoasProfitLine
        points={[
          { date: '2026-07-01', roas: 2.5 },
          { date: '2026-07-02', roas: 0.8 },
          { date: '2026-07-03', roas: 1.4 },
        ]}
      />,
    );
    expect(getByTestId('pnl-chart')).toBeTruthy();
  });
});

// The stroke runs green above break-even and red below it. That crossing is the
// whole subject of the chart, and green-vs-red is precisely the pair a colorblind
// reader cannot resolve — so the y=0 line has to be drawn and named, not implied
// by hue alone.
describe('BreakevenLine', () => {
  it('draws the rule at the scale position of pnl = 0, spanning the plot', () => {
    const { container } = render(
      <svg>
        <title>test plot</title>
        <BreakevenLine />
      </svg>,
    );

    const line = container.querySelector('line');
    expect(line).toBeTruthy();
    // Not a hardcoded pixel: whatever the scale says zero is, that is where it goes.
    expect(line?.getAttribute('y1')).toBe(String(yScale(0)));
    expect(line?.getAttribute('y2')).toBe(String(yScale(0)));
    expect(line?.getAttribute('x1')).toBe('0');
    expect(line?.getAttribute('x2')).toBe('300');
  });

  it('names the crossing in text, so the meaning survives without color', () => {
    const { getByText } = render(
      <svg>
        <title>test plot</title>
        <BreakevenLine />
      </svg>,
    );
    expect(getByText('break-even')).toBeTruthy();
  });
});
