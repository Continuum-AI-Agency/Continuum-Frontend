import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { OptimizerActionFeedRow } from '../useOptimizerData';

type ActionsState = {
  data: OptimizerActionFeedRow[];
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  refetch?: () => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
};
let actionsState: ActionsState = { data: [], isLoading: false };

mock.module('../useOptimizerData', () => ({
  useOptimizerActions: () => actionsState,
}));

// The dialog's own dry-run → confirm behaviour is covered where it lives. What this suite
// owns is the DECISION to offer it at all, which must come from the RPC's `reversible`.
mock.module('./RevertApplyDialog', () => ({
  RevertApplyDialog: ({ auditId, scope }: { auditId: string; scope?: string | null }) => (
    <button type="button" data-audit-id={auditId} data-scope={scope ?? ''}>
      {scope === 'adset_status' ? 'Unpause' : 'Revert'}
    </button>
  ),
}));

const { OptimizerActionFeed } = await import('./OptimizerActionFeed');

const PORTFOLIO_ID = '11111111-1111-4111-8111-111111111111';

const action = (over: Partial<OptimizerActionFeedRow> = {}): OptimizerActionFeedRow =>
  ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ts: new Date().toISOString(),
    family: 'money',
    op: 'budget',
    portfolio_id: PORTFOLIO_ID,
    portfolio_name: 'Prospecting',
    entity_id: '120251303880680236',
    before: { minor: 500000 },
    after: { minor: 450000 },
    actor_kind: 'autopilot',
    reversible: true,
    receipt: { fbtrace_id: 'AbC123traceZ' },
    ...over,
  }) as OptimizerActionFeedRow;

beforeEach(() => {
  actionsState = { data: [], isLoading: false };
});

afterEach(cleanup);

describe('OptimizerActionFeed', () => {
  it('shows the empty state when nothing has been changed yet', () => {
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getByText('Nothing has changed yet')).toBeTruthy();
  });

  it('reports a failed read as a failure, not as a quiet account', () => {
    actionsState = {
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('optimizer_read_timeout'),
      refetch: () => {},
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.queryByText('Nothing has changed yet')).toBeNull();
    expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy();
  });

  // What changed, who did it, why, and the receipt — the four things a flat log line could
  // never carry, on one row.
  it('renders a money row as before → after with actor, reason and receipt', () => {
    actionsState = {
      data: [action({ justification: 'Earned a larger share of the pool.' })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getAllByText('Daily budget').length).toBeGreaterThan(0);
    expect(screen.getByText('$5,000')).toBeTruthy();
    expect(screen.getByText('$4,500')).toBeTruthy();
    expect(screen.getByText('· Autopilot')).toBeTruthy();
    expect(screen.getByText('Earned a larger share of the pool.')).toBeTruthy();
    expect(screen.getByText('AbC123traceZ')).toBeTruthy();
  });

  it('offers a one-click revert when the RPC says the write is reversible', () => {
    actionsState = { data: [action()], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getByRole('button', { name: 'Revert' })).toBeTruthy();
  });

  it('reads a status write as an unpause rather than a budget revert', () => {
    actionsState = {
      data: [
        action({ op: 'status', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' } }),
      ],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getByRole('button', { name: 'Unpause' })).toBeTruthy();
    expect(screen.getByText('PAUSED')).toBeTruthy();
  });

  // The flag is the SERVER's answer. A client-side guess is how a button starts lying.
  it('offers no revert when the RPC says the write is not reversible', () => {
    actionsState = { data: [action({ reversible: false })], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('says "reverted" instead of offering the button a second time', () => {
    actionsState = {
      data: [action({ reversible: true, reverted_by: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getByText('Reverted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('shows a setting change with its field name and never a revert button', () => {
    actionsState = {
      data: [
        action({
          family: 'settings',
          op: 'setting',
          entity_id: 'daily_total',
          before: { value: '3500' },
          after: { value: '4200' },
          reversible: false,
          actor_kind: 'human',
          receipt: null,
        }),
      ],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getAllByText('daily_total').length).toBeGreaterThan(0);
    expect(screen.getByText('4200')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('paginates on the RPC cursor rather than calling one page the world', () => {
    let loadedMore = 0;
    actionsState = {
      data: [action()],
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: () => {
        loadedMore += 1;
      },
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getByText('1 actions loaded — there are older ones.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(loadedMore).toBe(1);
  });
});
