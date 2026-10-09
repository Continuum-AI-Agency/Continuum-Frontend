import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render as renderWithoutClient,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
      className={triggerTextSize ?? ''}
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
    expect(screen.getByTestId('action-timeline').textContent).toContain('Autopilot');
    expect(screen.getByText('Why: Earned a larger share of the pool.')).toBeTruthy();
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

// The account feed is a timeline: grouped by day, one line per action with its clock time, a
// dot for how it went, the change, its portfolio and why, and the undo on the right.
describe('OptimizerActionFeed — timeline by day', () => {
  const yesterdayNoon = () => {
    const at = new Date();
    at.setDate(at.getDate() - 1);
    at.setHours(12, 0, 0, 0);
    return at.toISOString();
  };
  const nth = (index: number, over: Partial<OptimizerActionFeedRow> = {}) =>
    action({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
      ts: new Date().toISOString(),
      entity_id: `12025130388068${String(index).padStart(4, '0')}`,
      ...over,
    });
  const entries = () =>
    Array.from(
      screen.getByTestId('action-timeline').querySelectorAll<HTMLElement>('li[data-action-id]'),
    );

  it('groups the actions under Today and Yesterday, keeping the feed order', () => {
    actionsState = {
      data: [nth(1), nth(2), nth(3, { ts: yesterdayNoon() })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const days = screen.getAllByTestId('action-day');
    expect(days.map((day) => day.getAttribute('data-day'))).toEqual(['Today', 'Yesterday']);
    expect(within(days[1] as HTMLElement).getByText('12:00')).toBeTruthy();
    expect(entries().map((entry) => entry.getAttribute('data-action-id'))).toEqual([
      nth(1).id,
      nth(2).id,
      nth(3).id,
    ]);
  });

  it('draws every action as a line, never a bordered card', () => {
    actionsState = { data: [nth(1), nth(2), nth(3)], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    for (const entry of entries()) {
      expect(entry.className).not.toMatch(/\bborder\b|rounded-lg|bg-card/);
      expect(entry.querySelector('time')?.className).toContain('font-mono');
    }
  });

  it('colours the dot by how the action went', () => {
    actionsState = {
      data: [
        nth(1),
        nth(2, { op: 'status', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' } }),
        nth(3, { family: 'decision', op: 'decision', before: null, after: { status: 'pending' } }),
        nth(4, { family: 'settings', op: 'setting', entity_id: 'daily_total', reversible: false }),
      ],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const tones = entries().map((entry) =>
      entry.querySelector('[data-tone]')?.getAttribute('data-tone'),
    );
    expect(tones).toEqual(['landed', 'stopped', 'asks', 'neutral']);
  });

  it('prints money in the account currency code, before → after, with the signed delta', () => {
    actionsState = {
      data: [nth(1, { before: { minor: 634000 }, after: { minor: 697400 } })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="MXN" />);
    const timeline = screen.getByTestId('action-timeline');
    expect(within(timeline).getByText('6,340 MXN')).toBeTruthy();
    expect(within(timeline).getByText('6,974 MXN')).toBeTruthy();
    expect(within(timeline).getByText('+10%')).toBeTruthy();
    expect(timeline.textContent).not.toContain('$');
  });

  // An account whose currency nobody recorded is not an account that spends dollars.
  it('prints a bare number when the account currency is unknown', () => {
    actionsState = {
      data: [nth(1, { before: { minor: 634000 }, after: { minor: 570600 } })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency={null} />);
    const timeline = screen.getByTestId('action-timeline');
    expect(within(timeline).getByText('5,706')).toBeTruthy();
    expect(within(timeline).getByText('-10%')).toBeTruthy();
    expect(timeline.textContent).not.toContain('$');
  });

  it('names the portfolio beside the change, and keeps a reverted action reading as reverted', () => {
    actionsState = {
      data: [nth(1, { reverted_by: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const [entry] = entries();
    expect(entry?.textContent).toContain('· Prospecting');
    expect(within(entry as HTMLElement).getByText('Reverted')).toBeTruthy();
    expect(entry?.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('neutral');
  });

  it('uses no sub-text-xs type anywhere in the timeline', () => {
    actionsState = {
      data: [nth(1, { justification: 'why' }), nth(2), nth(3)],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(screen.getByTestId('action-timeline').outerHTML).not.toMatch(/text-(2|3)xs/);
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

  it('shows a known ad set name, with its id kept on hover', () => {
    seedRoster();
    actionsState = { data: [action()], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const name = within(screen.getByTestId('action-timeline')).getByText('Lookalike 3% — Spain');
    expect(name.getAttribute('title')).toBe(KNOWN_ID);
  });

  it('falls back to the id when no name is known for it', () => {
    seedRoster();
    actionsState = { data: [action({ entity_id: '555000111' })], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const timeline = screen.getByTestId('action-timeline');
    expect(within(timeline).getByText('555000111')).toBeTruthy();
    expect(within(timeline).queryByText('Lookalike 3% — Spain')).toBeNull();
  });

  it('gives the revert trigger at least text-xs', () => {
    actionsState = { data: [action()], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const trigger = screen.getByRole('button', { name: 'Revert' });
    expect(trigger.className).toContain('text-xs');
    expect(trigger.className).not.toMatch(/text-[23]xs/);
  });
});

// Every action says which platform it wrote to, and its receipt is named by that platform
// (frontend.html §7, feature 11). The RPC sends no `platform` yet, so a row without one is Meta.
describe('OptimizerActionFeed — platform chip and receipt', () => {
  const chipsIn = (node: HTMLElement) =>
    Array.from(node.querySelectorAll('[data-testid="platform-chip"]')).map((chip) =>
      chip.getAttribute('data-platform'),
    );
  const timeline = () => screen.getByTestId('action-timeline');

  it('puts a Meta chip on every action', () => {
    actionsState = {
      data: [
        action({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' }),
        action({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002' }),
        action({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003' }),
      ],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(chipsIn(timeline())).toEqual(['meta', 'meta', 'meta']);
  });

  it('labels the copyable receipt as the Meta trace id', () => {
    actionsState = { data: [action()], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const receipt = within(timeline()).getByTestId('receipt-token');
    expect(receipt.getAttribute('aria-label')).toBe('Copy Meta trace id AbC123traceZ');
    expect(within(receipt).getByTestId('receipt-label').textContent).toBe('Meta trace id');
  });

  it('reads the platform from the row when it carries one, and its receipt by that platform', () => {
    actionsState = {
      data: [action({ platform: 'google_ads', receipt: { requestId: 'req-9Xy' } })],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(chipsIn(timeline())).toEqual(['google_ads']);
    const receipt = within(timeline()).getByTestId('receipt-token');
    expect(receipt.getAttribute('aria-label')).toBe('Copy Google request id req-9Xy');
    expect(timeline().textContent).not.toContain('Meta');
  });

  it('falls back to Meta when the row names a platform the contract does not know', () => {
    actionsState = { data: [action({ platform: 'snapchat' })], isLoading: false };
    render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    expect(chipsIn(timeline())).toEqual(['meta']);
  });

  it('never puts a chip inside a figure, and figures never take a platform colour', () => {
    actionsState = {
      data: [action(), action({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009' })],
      isLoading: false,
    };
    const { container } = render(<OptimizerActionFeed brandId="brand-1" currency="USD" />);
    const figures = Array.from(container.querySelectorAll('[data-figure-role]'));
    expect(figures.length).toBeGreaterThan(0);
    for (const figure of figures) {
      expect(figure.querySelector('[data-testid="platform-chip"]')).toBeNull();
      expect(figure.closest('[data-testid="platform-chip"]')).toBeNull();
      expect(figure.outerHTML).not.toMatch(/platform-(meta|google|tiktok)/);
    }
  });
});

// ActionRow is the dense row the portfolio Actions tab lists under "Recently applied".
describe('ActionRow — platform chip and receipt', () => {
  it('carries the chip beside the family badge and the platform-named receipt', async () => {
    const { ActionRow } = await import('./OptimizerActionFeed');
    render(
      <ul>
        <ActionRow row={action()} brandId="brand-1" currency="USD" />
      </ul>,
    );
    const chip = screen.getByTestId('platform-chip');
    expect(chip.getAttribute('data-platform')).toBe('meta');
    expect(chip.textContent).toBe('Meta');
    expect(screen.getByTestId('receipt-token').getAttribute('aria-label')).toBe(
      'Copy Meta trace id AbC123traceZ',
    );
  });
});

// A yen budget is whole yen: the old hard-coded /100 printed it a hundred times too small.
describe('money is divided by the currency’s own minor unit', () => {
  it('JPY prints the ledger figure whole; MXN divides by 100', () => {
    actionsState = {
      data: [action({ before: { minor: 5000 }, after: { minor: 6000 } })],
      isLoading: false,
    };
    const { container, unmount } = render(<OptimizerActionFeed brandId="brand-1" currency="JPY" />);
    expect(container.textContent).toContain('5,000 JPY');
    expect(container.textContent).toContain('6,000 JPY');
    unmount();
    render(<OptimizerActionFeed brandId="brand-1" currency="MXN" />);
    expect(screen.getAllByText(/50\.00 MXN/).length).toBeGreaterThan(0);
  });

  it('the dense ActionRow uses the same division', async () => {
    const { ActionRow } = await import('./OptimizerActionFeed');
    render(
      <ul>
        <ActionRow
          row={action({ before: { minor: 5000 }, after: { minor: 6000 } })}
          brandId="brand-1"
          currency="JPY"
        />
      </ul>,
    );
    expect(screen.getByText('5,000 JPY')).toBeTruthy();
  });
});

// Decision 6/17: a cross-platform move is ONE decision in Activity, its legs as sub-rows.
describe('a cross-platform move in the action feed', () => {
  const MOVE = '7b0e3a52-5d1f-4b8e-9a51-0c3c1d2e4f60';
  const legRow = (over: Record<string, unknown>) =>
    action({ move_id: MOVE, outcome: 'applied', ...over } as Partial<OptimizerActionFeedRow>);

  it('folds the legs into one Decision entry beside the single writes', () => {
    actionsState = {
      data: [
        action({ id: 'single-1', entity_id: '120251303880680999' }),
        legRow({
          id: 'leg-1',
          leg: 1,
          platform: 'google_ads',
          entity_id: '24274603133',
          before: { minor: 40_000 },
          after: { minor: 52_000 },
          receipt: { requestId: '0c1-req' },
        }),
        legRow({
          id: 'leg-0',
          leg: 0,
          platform: 'meta',
          before: { minor: 24_400 },
          after: { minor: 12_400 },
          receipt: { fbtrace_id: '8f2-trace' },
        }),
      ],
      isLoading: false,
    };
    render(<OptimizerActionFeed brandId="brand-1" currency="MXN" />);
    const cards = screen.getAllByTestId('move-decision');
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;
    expect(card.textContent).toContain('Move 120.00 MXN/day from Meta to Google');
    const legs = within(card).getAllByTestId('move-decision-leg');
    expect(legs.map((leg) => leg.getAttribute('data-platform'))).toEqual(['meta', 'google_ads']);
    expect(
      within(card)
        .getAllByTestId('receipt-token')
        .map((t) => t.textContent),
    ).toEqual([expect.stringContaining('8f2-trace'), expect.stringContaining('0c1-req')]);
    // The single write still renders as its own entry, and no leg leaks out as one.
    expect(
      screen.getByTestId('action-timeline').querySelectorAll('li[data-action-id]'),
    ).toHaveLength(1);
  });
});
