import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx AreaChart container (needs ResizeObserver). It ignores its
// children, so ProfitLossLine/Grid/XAxis/ChartTooltip never render (no chart
// context needed) — we only assert the empty-vs-populated switch.
mock.module('@/components/charts/area-chart', () => ({
  AreaChart: () => <div data-testid="pnl-chart" />,
}));

const { RoasProfitLine } = await import('./RoasProfitLine');

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
