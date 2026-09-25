import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render as renderWithoutClient, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';

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

// Spread the real module: `mock.module` replaces it for the whole PROCESS and bun runs
// every test file in one, so a partial replacement here reaches the next file in the run.
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerActions: () => actionsState,
}));

// The dialog's own dry-run → confirm behaviour is covered where it lives. What this suite
// owns is the DECISION to offer it at all, which must come from the RPC's `reversible`.
mock.module('./RevertApplyDialog', () => ({
  RevertApplyDialog: ({
    auditId,
    scope,
    triggerTextSize,
  }: {
    auditId: string;
    scope?: string | null;
    triggerTextSize?: string;
  }) => (
    <button
      type="button"
      className={triggerTextSize ?? 'text-2xs'}
      data-audit-id={auditId}
      data-scope={scope ?? ''}
    >
      {scope === 'adset_status' ? 'Unpause' : 'Revert'}
    </button>
  ),
}));

const { OptimizerActionFeed } = await import('./OptimizerActionFeed');
const { optimizerQueryKeys } = realOptimizerData;

// The feed names what an action touched from the enrolled-roster cache the portfolio screen
// already filled — so every render gets a real QueryClient, seeded per test when it matters.
let queryClient = new QueryClient();
const render = (ui: ReactElement) =>
  renderWithoutClient(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

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
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    expect(within(screen.getByTestId('action-featured')).getByText('Autopilot')).toBeTruthy();
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
      data: [action({ op: 'status', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' } })],
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

// "Destacada + grilla": the newest action leads as a card of its own, everything else sits in
// an even grid of square cards below it. The rows these tests build are what the RPC returns.
describe('OptimizerActionFeed — featured card and grid', () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const nth = (index: number, over: Partial<OptimizerActionFeedRow> = {}) =>
    action({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
      ts: minutesAgo(10 + index * 10),
      entity_id: `12025130388068${String(index).padStart(4, '0')}`,
      ...over,
    });
  const gridCards = () =>
    Array.from(screen.getByTestId('action-grid').children) as HTMLElement[];

  // The RPC is newest-first, but the rule is "the newest action", not "whatever came first".
  it('features the most recent action and grids the rest in feed order', () => {
    const newest = nth(9, { ts: minutesAgo(1), entity_id: '999000111' });
    actionsState = { data: [nth(1), nth(2), newest, nth(3)], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const featured = screen.getByTestId('action-featured');
    expect(within(featured).getByText('999000111')).toBeTruthy();
    expect(gridCards().map((card) => card.getAttribute('data-action-id'))).toEqual([
      nth(1).id,
      nth(2).id,
      nth(3).id,
    ]);
  });

  it('renders only the featured card when there is a single action', () => {
    actionsState = { data: [nth(1)], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getByTestId('action-featured')).toBeTruthy();
    expect(screen.queryByTestId('action-grid')).toBeNull();
  });

  it('grids 2 actions without a single empty placeholder cell', () => {
    actionsState = { data: [nth(1), nth(2)], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const cards = gridCards();
    expect(cards).toHaveLength(1);
    expect(cards.every((card) => card.getAttribute('data-action-id'))).toBe(true);
  });

  it('grids 9 actions as 8 real cards and no placeholders', () => {
    actionsState = {
      data: Array.from({ length: 9 }, (_, index) => nth(index + 1)),
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const cards = gridCards();
    expect(cards).toHaveLength(8);
    expect(cards.every((card) => card.getAttribute('data-action-id'))).toBe(true);
    expect(screen.getByTestId('action-grid').className).toContain('lg:grid-cols-4');
  });

  it('prints money in the account currency code, before → after, with the signed delta', () => {
    actionsState = {
      data: [nth(1, { before: { minor: 634000 }, after: { minor: 697400 } })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="MXN" />);
    const featured = screen.getByTestId('action-featured');
    expect(within(featured).getByText('6,340 MXN')).toBeTruthy();
    expect(within(featured).getByText('6,974 MXN')).toBeTruthy();
    expect(within(featured).getByText('+10%')).toBeTruthy();
    expect(featured.textContent).not.toContain('$');
  });

  // An account whose currency nobody recorded is not an account that spends dollars.
  it('prints a bare number when the account currency is unknown', () => {
    actionsState = {
      data: [nth(1), nth(2, { before: { minor: 634000 }, after: { minor: 570600 } })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency={null} />);
    const [card] = gridCards();
    expect(within(card).getByText('5,706')).toBeTruthy();
    expect(within(card).getByText('-10%')).toBeTruthy();
    expect(card.textContent).not.toContain('$');
  });

  it('opens the full detail — why, before/after, receipt — when a grid card is clicked', async () => {
    actionsState = {
      data: [nth(1), nth(2, { justification: 'Cost per result doubled in three days.' })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.queryByText('Cost per result doubled in three days.')).toBeNull();
    fireEvent.click(within(gridCards()[0]).getByRole('button'));
    const dialog = await waitFor(() => screen.getByRole('dialog'));
    expect(within(dialog).getByText('Cost per result doubled in three days.')).toBeTruthy();
    expect(within(dialog).getByText('$5,000')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Revert' })).toBeTruthy();
  });

  it('keeps a reverted grid action reading as reverted in its detail', async () => {
    actionsState = {
      data: [nth(1), nth(2, { reverted_by: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(within(gridCards()[0]).getByText('Reverted')).toBeTruthy();
    fireEvent.click(within(gridCards()[0]).getByRole('button'));
    const dialog = await waitFor(() => screen.getByRole('dialog'));
    expect(within(dialog).getByText('Reverted')).toBeTruthy();
  });

  it('uses no sub-text-xs type anywhere inside the cards', () => {
    actionsState = {
      data: [nth(1, { justification: 'why' }), nth(2), nth(3)],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    for (const id of ['action-featured', 'action-grid']) {
      expect(screen.getByTestId(id).outerHTML).not.toMatch(/text-(2|3)xs/);
    }
  });
});

// The rows carry ids; a person reads names. The name comes from the enrolled roster the
// portfolio screen already holds in the React Query cache — never a new read.
describe('OptimizerActionFeed — entity names', () => {
  const KNOWN_ID = '120251303880680236';
  const seedRoster = () =>
    queryClient.setQueryData(optimizerQueryKeys.enrolledAdsets(PORTFOLIO_ID), [
      { adset_id: KNOWN_ID, adset_name: 'Lookalike 3% — Spain', active: true },
    ]);

  it('shows a known ad set name as the entity line and the id small and secondary', () => {
    seedRoster();
    actionsState = { data: [action()], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const featured = screen.getByTestId('action-featured');
    expect(within(featured).getByRole('heading').textContent).toBe('Lookalike 3% — Spain');
    const id = within(featured).getByText(KNOWN_ID);
    expect(id.className).toContain('font-mono');
    expect(id.className).toContain('text-xs');
  });

  it('names a grid card too, and keeps the id reachable in its detail', async () => {
    seedRoster();
    actionsState = {
      data: [
        action({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', ts: new Date().toISOString() }),
        action({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
          ts: new Date(Date.now() - 60_000).toISOString(),
        }),
      ],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const [card] = Array.from(screen.getByTestId('action-grid').children) as HTMLElement[];
    expect(within(card).getByText('Lookalike 3% — Spain')).toBeTruthy();
    expect(within(card).getByText(KNOWN_ID).className).toContain('font-mono');
    fireEvent.click(within(card).getByRole('button'));
    const dialog = await waitFor(() => screen.getByRole('dialog'));
    expect(within(dialog).getByText('Lookalike 3% — Spain')).toBeTruthy();
    expect(within(dialog).getByText(KNOWN_ID)).toBeTruthy();
  });

  it('falls back to the id when no name is known for it', () => {
    seedRoster();
    actionsState = { data: [action({ entity_id: '555000111' })], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const featured = screen.getByTestId('action-featured');
    expect(within(featured).getByRole('heading').textContent).toBe('555000111');
    expect(within(featured).queryByText('Lookalike 3% — Spain')).toBeNull();
  });

  it('gives the revert trigger inside the cards at least text-xs', () => {
    actionsState = { data: [action()], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const trigger = screen.getByRole('button', { name: 'Revert' });
    expect(trigger.className).toContain('text-xs');
    expect(trigger.className).not.toContain('text-2xs');
  });
});
