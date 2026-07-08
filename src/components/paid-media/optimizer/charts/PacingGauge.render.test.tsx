import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx Gauge (needs ResizeObserver) — assert the pace verdict caption
// and the empty-vs-populated switch.
mock.module('@/components/charts/gauge', () => ({
  Gauge: () => <div data-testid="gauge" />,
}));

const { PacingGauge } = await import('./PacingGauge');

afterEach(cleanup);

describe('PacingGauge', () => {
  it('shows the empty state when no period budget is set', () => {
    const { getByText, queryByTestId } = render(<PacingGauge pacing={{}} />);
    expect(getByText(/set a period budget/i)).toBeTruthy();
    expect(queryByTestId('gauge')).toBeNull();
  });

  it('renders the gauge with the pace verdict when pacing data exists', () => {
    const { getByTestId, container } = render(
      <PacingGauge
        currency="USD"
        pacing={{
          actualSpendToDate: 300,
          periodBudget: 1000,
          pacingRatio: 1.0,
          dayIndex: 10,
          periodDays: 30,
        }}
      />,
    );
    expect(getByTestId('gauge')).toBeTruthy();
    expect(container.textContent).toContain('On track');
    expect(container.textContent).toContain('30% of budget');
    expect(container.textContent).toContain('proj. end');
  });
});
