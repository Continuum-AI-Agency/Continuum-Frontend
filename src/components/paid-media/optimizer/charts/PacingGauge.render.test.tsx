import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx Gauge (needs ResizeObserver) — assert the pace verdict caption
// and the estimated-vs-real switch.
mock.module('@/components/charts/gauge', () => ({
  Gauge: () => <div data-testid="gauge" />,
}));

const { PacingGauge } = await import('./PacingGauge');

afterEach(cleanup);

describe('PacingGauge', () => {
  it('renders the gauge with the pace verdict when a real period budget exists', () => {
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
    // A real budget is NOT marked estimated.
    expect(container.textContent).not.toContain('est.');
  });

  it('NEVER shows the old "set a period budget" empty state — it estimates instead', () => {
    const { getByTestId, container } = render(
      <PacingGauge currency="USD" dailyTotal={100} pacing={{ actualSpendToDate: 1500 }} />,
    );
    // The gauge still renders, marked estimated (est. budget = 100 × 30 = 3000 → 50%).
    expect(getByTestId('gauge')).toBeTruthy();
    expect(container.textContent).not.toMatch(/set a period budget on this portfolio/i);
    expect(container.textContent).toContain('est.');
    expect(container.textContent).toContain('50% of est. budget');
    expect(container.textContent).toContain('Estimated period budget');
  });

  it('falls back to a soft nudge only when there is no budget basis at all', () => {
    const { queryByTestId, container } = render(<PacingGauge pacing={{}} />);
    expect(queryByTestId('gauge')).toBeNull();
    expect(container.textContent).toMatch(/set a daily budget/i);
  });
});
