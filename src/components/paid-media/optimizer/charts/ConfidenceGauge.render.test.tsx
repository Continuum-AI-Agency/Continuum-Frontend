import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx Gauge (needs ResizeObserver) — assert empty vs populated switch.
mock.module('@/components/charts/gauge', () => ({
  Gauge: () => <div data-testid="gauge" />,
}));

import { confidenceHigh } from './__fixtures__/optimizerFixtures';

const { ConfidenceGauge } = await import('./ConfidenceGauge');

afterEach(cleanup);

describe('ConfidenceGauge', () => {
  it('shows the empty state until the first cycle scores', () => {
    const { getByText, queryByTestId } = render(<ConfidenceGauge confidence={null} />);
    expect(getByText(/Confidence appears after/i)).toBeTruthy();
    expect(queryByTestId('gauge')).toBeNull();
  });

  it('renders the gauge once a run carries a confidence score', () => {
    const { getByTestId, queryByText } = render(<ConfidenceGauge confidence={confidenceHigh} />);
    expect(getByTestId('gauge')).toBeTruthy();
    expect(queryByText(/Confidence appears after/i)).toBeNull();
  });
});
