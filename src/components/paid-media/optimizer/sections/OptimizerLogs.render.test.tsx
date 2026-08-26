import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { OptimizerLogRow } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

type LogsState = {
  data: OptimizerLogRow[];
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  refetch?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
};
let logsState: LogsState = { data: [], isLoading: false };

mock.module('../useOptimizerData', () => ({
  useOptimizerLogs: () => logsState,
}));

const { OptimizerLogs } = await import('./OptimizerLogs');

function row(overrides: Partial<OptimizerLogRow>): OptimizerLogRow {
  return {
    id: Math.floor(Math.random() * 1e9),
    portfolio_id: '11111111-1111-4111-8111-111111111111',
    portfolio_name: 'Prospecting',
    ts: new Date().toISOString(),
    level: 'info',
    event: 'cycle_complete',
    fields: {},
    ...overrides,
  };
}

const COMPLETE = row({
  id: 1,
  event: 'cycle_complete',
  fields: { snapshotCount: 12, recommendations: 2, applied: 3, held: 1 },
});

const DRIFT = row({
  id: 2,
  level: 'warn',
  event: 'roster_drift_detected',
  portfolio_name: 'Retargeting',
  fields: { seen: 8, missing: 2, adsets: [{ id: '120251', name: 'Lookalike 1%' }] },
});

const FAILED = row({
  id: 3,
  level: 'error',
  event: 'cycle_failed',
  fields: { error: 'Meta token expired' },
});

beforeEach(() => {
  logsState = { data: [], isLoading: false };
});

afterEach(cleanup);

describe('OptimizerLogs — the SERVER LOG feed', () => {
  it('shows the empty state when the optimizer has never run', () => {
    render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.getByText('The optimizer has not run yet')).toBeTruthy();
  });

  it('reports a failed read as a failure, not as an empty feed', () => {
    logsState = {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('optimizer_read_timeout'),
      refetch: () => {},
    };
    render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.queryByText('The optimizer has not run yet')).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  it('offers a retry that re-runs the read', () => {
    let refetched = 0;
    logsState = {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: () => {
        refetched += 1;
      },
    };
    render(<OptimizerLogs brandId="brand-1" />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetched).toBe(1);
  });

  // The whole point of the split: an event is read into a shape, not printed as the first
  // four keys of its fields bag.
  it('renders a completed cycle as named counts rather than key: value soup', () => {
    logsState = { data: [COMPLETE], isLoading: false };
    render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.getByText('Cycle complete')).toBeTruthy();
    expect(screen.getByText('Ad sets scored')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.queryByText(/snapshotCount:/)).toBeNull();
  });

  it('names the drifted ad sets behind a disclosure', () => {
    logsState = { data: [DRIFT], isLoading: false };
    render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.getByText('Roster drift')).toBeTruthy();
    expect(screen.getByText('Lookalike 1% (120251)')).toBeTruthy();
  });

  it('surfaces the error text on a failed cycle', () => {
    logsState = { data: [FAILED], isLoading: false };
    render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.getByText('Meta token expired')).toBeTruthy();
  });

  it('narrows the loaded feed to one portfolio', () => {
    logsState = { data: [COMPLETE, DRIFT], isLoading: false };
    render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.getByText('Cycle complete')).toBeTruthy();
    expect(screen.getByText('Roster drift')).toBeTruthy();
  });

  // "100 rows" used to be presented as the world. The footer now says what is loaded and
  // whether there is more, and the RPC's own cursor decides which.
  it('says how much is loaded and offers more only when the cursor says there is more', () => {
    logsState = { data: [COMPLETE, DRIFT], isLoading: false, hasNextPage: false };
    const { unmount } = render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.getByText('2 events — that is all of them.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    unmount();

    let loadedMore = 0;
    logsState = {
      data: [COMPLETE, DRIFT],
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: () => {
        loadedMore += 1;
      },
    };
    render(<OptimizerLogs brandId="brand-1" />);
    expect(screen.getByText('2 events loaded — there are older ones.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(loadedMore).toBe(1);
  });
});
