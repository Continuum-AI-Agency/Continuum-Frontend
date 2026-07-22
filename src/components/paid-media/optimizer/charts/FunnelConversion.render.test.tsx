import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx FunnelChart (needs ResizeObserver) — surface the stage count it
// was handed so we can assert the objective-aware funnel is fed, and the
// empty-state switch.
mock.module('@/components/charts/funnel-chart', () => ({
  FunnelChart: ({ data }: { data: unknown[] }) => (
    <div data-stages={data.length} data-testid="funnel" />
  ),
}));

const { FunnelConversion } = await import('./FunnelConversion');

afterEach(cleanup);

describe('FunnelConversion', () => {
  it('shows the empty state when the window has no delivery', () => {
    const { getByText, queryByTestId } = render(
      <FunnelConversion objective="purchase" window={{ impressions: 0, clicks: 0 }} />,
    );
    expect(getByText(/conversion funnel appears/i)).toBeTruthy();
    expect(queryByTestId('funnel')).toBeNull();
  });

  it('feeds the four-stage purchase funnel once there is delivery', () => {
    const { getByTestId } = render(
      <FunnelConversion
        objective="purchase"
        window={{ impressions: 10_000, clicks: 500, addToCarts: 100, purchases: 25 }}
      />,
    );
    expect(getByTestId('funnel').getAttribute('data-stages')).toBe('4');
  });

  it('shows the step conversion % per downstream stage and names the terminal goal', () => {
    const { container } = render(
      <FunnelConversion
        objective="lead"
        window={{ impressions: 10_000, clicks: 1000, leads: 100 }}
      />,
    );
    // Clicks 1000/10000 = 10%, Leads 100/1000 = 10%.
    expect(container.textContent).toContain('Clicks 10%');
    expect(container.textContent).toContain('Leads 10%');
    // Heat legend + terminal-stage caption via metric.resultLabel.
    expect(container.textContent).toContain('drop-off');
    expect(container.textContent).toContain('goal: leads');
  });
});
