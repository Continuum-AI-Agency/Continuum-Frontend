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
};
let logsState: LogsState = { data: [], isLoading: false };

mock.module('../useOptimizerData', () => ({
  useOptimizerLogs: () => logsState,
}));

// Stub the revert dialog to a bare trigger. OptimizerLogs owns the DECISION to offer a revert
// (audit id + portfolio present); the dialog's own behavior is covered separately. Stubbing it
// here also decouples this spec from the process-wide `../useOptimizerData` / alert-dialog mocks
// other optimizer specs register (a real RevertApplyDialog would static-import useRevertApply and
// break linking when a sibling spec's partial mock is the active one).
mock.module('./RevertApplyDialog', () => ({
  RevertApplyDialog: ({ auditId }: { auditId: string }) => (
    <button type="button" data-audit-id={auditId}>
      Revert
    </button>
  ),
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

const MONEY = row({
  id: 1,
  event: 'apply_executed',
  fields: {
    portfolio: '11111111-1111-4111-8111-111111111111',
    adsetId: '999',
    priorMinor: 500000,
    targetMinor: 450000,
    authorizedKind: 'autopilot',
    fbtraceId: 'AbC123traceZ',
  },
});

const MONEY_WITH_AUDIT = row({
  id: 4,
  event: 'apply_executed',
  fields: {
    portfolio: '11111111-1111-4111-8111-111111111111',
    adsetId: '888',
    priorMinor: 600000,
    targetMinor: 500000,
    authorizedKind: 'human',
    fbtraceId: 'RevTrace9',
    auditId: '22222222-2222-4222-8222-222222222222',
  },
});

const SETTING = row({
  id: 2,
  event: 'setting_changed',
  fields: {
    setting: 'apply_mode',
    from: 'recommend',
    to: 'autopilot',
    by: 'duane@continuumai.agency',
  },
});

const CYCLE = row({ id: 3, event: 'cycle_complete', portfolio_name: 'Retargeting' });

afterEach(cleanup);
beforeEach(() => {
  logsState = { data: [], isLoading: false };
});

describe('OptimizerLogs', () => {
  it('shows the empty state when there is no activity', () => {
    render(<OptimizerLogs brandId="b" />);
    expect(screen.getByText('No optimizer activity yet')).toBeTruthy();
  });

  // A failed read used to render byte-identically to a brand that had simply never run a
  // cycle — the only tell was that it took ~16s to say nothing.
  it('reports a failed read as a failure, not as an empty feed', () => {
    logsState = {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('optimizer-status logs unreachable'),
    };
    render(<OptimizerLogs brandId="b" />);

    expect(screen.queryByText('No optimizer activity yet')).toBeNull();
    expect(screen.getByText(/Couldn't load the activity log/)).toBeTruthy();
    expect(document.body.textContent).toContain('optimizer-status logs unreachable');
  });

  it('offers a retry that re-runs the read', () => {
    let refetched = 0;
    logsState = {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: () => {
        refetched++;
      },
    };
    render(<OptimizerLogs brandId="b" />);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetched).toBe(1);
  });

  it('renders a money row as prior → target with the actor kind and a copyable receipt', () => {
    logsState = { data: [MONEY], isLoading: false };
    render(<OptimizerLogs brandId="b" />);
    expect(screen.getByText('500,000')).toBeTruthy();
    expect(screen.getByText('450,000')).toBeTruthy();
    expect(screen.getByText('autopilot')).toBeTruthy();
    const copyBtn = screen.getByLabelText('Copy Meta trace id AbC123traceZ');
    expect(copyBtn).toBeTruthy();
    // Clicking must not throw even without a real clipboard in the render environment.
    fireEvent.click(copyBtn);
    expect(screen.getByText('AbC123traceZ')).toBeTruthy();
  });

  it('offers a Revert action on a money row that carries an audit id', () => {
    logsState = { data: [MONEY_WITH_AUDIT], isLoading: false };
    render(<OptimizerLogs brandId="b" />);
    expect(screen.getByRole('button', { name: /Revert/ })).toBeTruthy();
  });

  it('omits the Revert action on a money row with no audit id (pre-wiring rows)', () => {
    logsState = { data: [MONEY], isLoading: false };
    render(<OptimizerLogs brandId="b" />);
    expect(screen.queryByRole('button', { name: /Revert/ })).toBeNull();
  });

  it('renders a setting_changed row as from → to · by', () => {
    logsState = { data: [SETTING], isLoading: false };
    render(<OptimizerLogs brandId="b" />);
    expect(screen.getByText('recommend')).toBeTruthy();
    expect(screen.getByText('autopilot')).toBeTruthy();
    expect(screen.getByText('· duane@continuumai.agency')).toBeTruthy();
    expect(screen.getByText('Apply mode')).toBeTruthy();
  });

  it('filters the feed down to a single family when a filter is pressed', () => {
    logsState = { data: [MONEY, SETTING, CYCLE], isLoading: false };
    render(<OptimizerLogs brandId="b" />);
    // All three visible initially.
    expect(screen.getByText('Apply executed')).toBeTruthy();
    expect(screen.getByText('Apply mode')).toBeTruthy();
    expect(screen.getByText('Cycle complete')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Money/ }));
    expect(screen.getByText('Apply executed')).toBeTruthy();
    expect(screen.queryByText('Apply mode')).toBeNull();
    expect(screen.queryByText('Cycle complete')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
    expect(screen.queryByText('Apply executed')).toBeNull();
    expect(screen.getByText('Apply mode')).toBeTruthy();
  });

  it('shows a no-match notice when the active filter excludes every row', () => {
    logsState = { data: [CYCLE], isLoading: false };
    render(<OptimizerLogs brandId="b" />);
    fireEvent.click(screen.getByRole('button', { name: /Money/ }));
    expect(screen.getByText('No matching activity in this window.')).toBeTruthy();
  });

  it('counts each family on its filter button', () => {
    logsState = { data: [MONEY, SETTING, CYCLE], isLoading: false };
    render(<OptimizerLogs brandId="b" />);
    expect(screen.getByRole('button', { name: /^All/ }).textContent).toContain('3');
    expect(screen.getByRole('button', { name: /Money/ }).textContent).toContain('1');
  });
});
