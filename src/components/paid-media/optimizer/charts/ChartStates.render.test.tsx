import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { DataState } from '@/components/shared/state/DataState';
import { ChartEmpty, ChartError, ChartSkeleton } from './ChartStates';
import { chartStatus } from './chartStatus';

afterEach(cleanup);

// ChartSkeleton and ChartError shipped as dead exports: every chart imported only
// ChartEmpty, so a read that was still loading and a read that had failed both
// rendered the empty copy. These assert the three states are now distinguishable.

describe('ChartStates', () => {
  it('announces the skeleton as busy rather than as absent data', () => {
    const { getByText, container } = render(<ChartSkeleton />);
    expect(getByText(/loading chart/i)).toBeTruthy();
    expect(container.querySelector('.bg-muted\\/70')).toBeTruthy();
  });

  it('offers a retry on error', () => {
    let retried = 0;
    const { getByRole } = render(<ChartError onRetry={() => retried++} />);
    fireEvent.click(getByRole('button', { name: /retry/i }));
    expect(retried).toBe(1);
  });

  it('states the chart-specific reason when genuinely empty', () => {
    const { getByText } = render(<ChartEmpty message="No audience data yet." />);
    expect(getByText('No audience data yet.')).toBeTruthy();
  });
});

describe('DataState driven by chartStatus', () => {
  const slots = {
    loading: <ChartSkeleton />,
    error: <ChartError message="The timeline could not load." />,
  };

  it('shows the error, not the empty copy, when the read failed', () => {
    const { getByText, queryByText } = render(
      <DataState status={chartStatus({ isError: true })} {...slots}>
        <ChartEmpty message="The timeline appears after a few scored cycles." />
      </DataState>,
    );
    expect(getByText(/could not load/i)).toBeTruthy();
    // The regression: this reassuring sentence used to render over a failed read.
    expect(queryByText(/appears after a few scored cycles/i)).toBeNull();
  });

  it('shows the skeleton, not the empty copy, while the read is in flight', () => {
    const { getByText, queryByText } = render(
      <DataState status={chartStatus({ isLoading: true })} {...slots}>
        <ChartEmpty message="The timeline appears after a few scored cycles." />
      </DataState>,
    );
    expect(getByText(/loading chart/i)).toBeTruthy();
    expect(queryByText(/appears after a few scored cycles/i)).toBeNull();
  });

  it('hands off to the chart once the read settles, so empty stays the chart call', () => {
    const { getByText } = render(
      <DataState status={chartStatus({ isLoading: false, isError: false })} {...slots}>
        <ChartEmpty message="The timeline appears after a few scored cycles." />
      </DataState>,
    );
    expect(getByText(/appears after a few scored cycles/i)).toBeTruthy();
  });
});
