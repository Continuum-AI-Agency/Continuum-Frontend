import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx RadarChart container (needs ResizeObserver); its children never
// render, so the radar sub-components import cleanly without a chart context.
mock.module('@/components/charts/radar-chart', () => ({
  RadarChart: ({ data }: { data: unknown[] }) => (
    <div data-series={data.length} data-testid="radar" />
  ),
}));

const { ScoreRadar } = await import('./ScoreRadar');

afterEach(cleanup);

describe('ScoreRadar', () => {
  it('shows the empty state when the run carries no confidence signal', () => {
    const { getByText, queryByTestId } = render(<ScoreRadar confidence={null} />);
    expect(getByText(/confidence radar appears/i)).toBeTruthy();
    expect(queryByTestId('radar')).toBeNull();
  });

  it('renders one radar series once a run has a confidence score', () => {
    const { getByTestId } = render(
      <ScoreRadar
        band="high"
        confidence={{ score: 0.82, predictiveness: 0.88, sampleSize: 0.5, consistency: 0.61 }}
      />,
    );
    expect(getByTestId('radar').getAttribute('data-series')).toBe('1');
  });
});
