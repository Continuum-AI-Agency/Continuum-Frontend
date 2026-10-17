import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import type { PlatformCardsState } from '../useOptimizerData';

// The populated branch mounts per-portfolio groups that each open their own
// React Query reads. This suite is about the CAUGHT-UP branch, so those are
// stubbed to keep the test to one concern.
mock.module('./OptimizerActionsPortfolioGroup', () => ({
  // The group draws the lead it is handed at the head of its own header line, and says which
  // platform cards it was handed.
  OptimizerActionsPortfolioGroup: ({
    headerLead,
    platformCards = [],
  }: {
    headerLead?: ReactNode;
    platformCards?: readonly { id: string }[];
  }) => (
    <>
      {headerLead}
      <div
        data-cards={platformCards.map((card) => card.id).join(',')}
        data-testid="portfolio-group"
      />
    </>
  ),
}));

// Each platform's card read, by platform. Spread the real module: mock.module is per process.
let cardStates: Record<string, PlatformCardsState> = {};
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerPlatformCards: (_brandId: string, platform: string) =>
    cardStates[platform] ?? { status: 'loading' },
}));

const { OptimizerActions } = await import('./OptimizerActions');

afterEach(() => {
  cleanup();
  cardStates = {};
});

const portfolio = (over: Partial<PortfolioListItem> = {}): PortfolioListItem =>
  ({
    id: 'p1',
    name: 'Prospecting · Purchases',
    ad_account_id: 'act_1',
    objective: 'purchase',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 4200,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 6,
    pending_recommendations: 0,
    pending_budget_moves: 0,
    platforms: [],
    ...over,
  }) as PortfolioListItem;

const renderActions = (
  portfolios: PortfolioListItem[],
  onBrowsePortfolios: () => void = () => {},
) =>
  render(
    <OptimizerActions
      adAccountId="act_1"
      brandId="b1"
      onBrowsePortfolios={onBrowsePortfolios}
      portfolios={portfolios}
      renewals={[]}
    />,
  );

// The caught-up state used to be headline + description and nothing else: no
// button, no schedule. A user with nothing to approve had no move except to leave
// the tab, and EmptyState's action/secondaryAction slots were being dropped.
describe('OptimizerActions — caught up', () => {
  it('offers a way out instead of dead-ending', () => {
    let browsed = 0;
    renderActions([portfolio()], () => browsed++);

    fireEvent.click(screen.getByRole('button', { name: /see portfolios/i }));
    expect(browsed).toBe(1);
  });

  it('states when the next cycle scores, rather than "after the next cycle"', () => {
    const soon = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    renderActions([portfolio({ next_realloc_at: soon })]);

    expect(document.body.textContent).toContain('in about 6 hours');
  });

  it('promises no schedule when the portfolios carry none', () => {
    renderActions([portfolio({ next_realloc_at: null })]);

    const text = document.body.textContent ?? '';
    expect(text).toContain('Anything a future cycle wants to change');
    expect(text).not.toContain('in about');
  });

  it('tells a user with no portfolios to make one, not that they are caught up', () => {
    renderActions([]);
    expect(document.body.textContent).toContain('No portfolios on this ad account yet');
  });

  it('agrees with itself on plurality for a single portfolio', () => {
    renderActions([portfolio()]);
    expect(document.body.textContent).toContain('your portfolio is');
  });
});

describe('OptimizerActions — work pending', () => {
  it('renders a group per portfolio that has pending recommendations', () => {
    renderActions([
      portfolio({ id: 'p1', pending_recommendations: 2 }),
      portfolio({ id: 'p2', pending_recommendations: 0 }),
      portfolio({ id: 'p3', pending_recommendations: 5 }),
    ]);

    expect(screen.getAllByTestId('portfolio-group')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('Nothing needs your decision');
  });

  it('renders a portfolio whose only work is BUDGET MOVES', () => {
    // The regression: budget moves are cycle_items, not recommendations, so a cycle that
    // wanted to move money without firing a trigger counted as zero pending and the whole
    // portfolio vanished from the queue. Four live portfolios were in exactly this state.
    renderActions([portfolio({ id: 'p1', pending_recommendations: 0, pending_budget_moves: 2 })]);

    expect(screen.getAllByTestId('portfolio-group')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('Nothing needs your decision');
  });

  it('counts recommendations and budget moves independently', () => {
    renderActions([
      portfolio({ id: 'p1', pending_recommendations: 2, pending_budget_moves: 0 }),
      portfolio({ id: 'p2', pending_recommendations: 0, pending_budget_moves: 8 }),
      portfolio({ id: 'p3', pending_recommendations: 1, pending_budget_moves: 3 }),
      portfolio({ id: 'p4', pending_recommendations: 0, pending_budget_moves: 0 }),
    ]);

    expect(screen.getAllByTestId('portfolio-group')).toHaveLength(3);
  });

  it('still says "caught up" when neither kind of work is waiting', () => {
    renderActions([portfolio({ pending_recommendations: 0, pending_budget_moves: 0 })]);
    expect(document.body.textContent).toContain('Nothing needs your decision');
  });
});

// Every portfolio group names the platforms it holds before its queue (frontend.html §7,
// feature 02). Every portfolio the engine runs today is Meta's.
describe('OptimizerActions — platform chips', () => {
  it('heads each portfolio group with the chips of its platforms', () => {
    renderActions([
      portfolio({ id: 'p1', pending_recommendations: 2 }),
      portfolio({ id: 'p2', pending_budget_moves: 1 }),
    ]);

    const groups = screen.getAllByTestId('actions-portfolio');
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      const chips = Array.from(group.querySelectorAll('[data-testid="platform-chip"]'));
      expect(chips.map((chip) => chip.getAttribute('data-platform'))).toEqual(['meta']);
      expect(chips.map((chip) => chip.textContent)).toEqual(['Meta']);
      const queue = group.querySelector('[data-testid="portfolio-group"]');
      expect(
        Boolean(
          chips[0] &&
            queue &&
            chips[0].compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(true);
    }
  });

  it('shows no chip when nothing is waiting', () => {
    renderActions([portfolio()]);
    expect(screen.queryByTestId('platform-chip')).toBeNull();
  });
});

// G2: Actions lists the brand's Google portfolios beside the selected account's (the shell
// merges them), so each group names its own platforms and gets its own platform cards.
describe("OptimizerActions — a Google portfolio's queue", () => {
  const card = (id: string, portfolioId: string) =>
    ({ id: `platform_signal:${id}`, portfolio_ids: [portfolioId] }) as unknown as AccountCandidate;

  it('names a Google portfolio by its own platform, not Meta', () => {
    renderActions([
      portfolio({ id: 'meta', pending_recommendations: 1, platforms: ['meta'] }),
      portfolio({
        id: 'google',
        ad_account_id: '5251780631',
        pending_recommendations: 2,
        platforms: ['google_ads'],
      }),
    ]);
    const chips = screen
      .getAllByTestId('actions-portfolio')
      .map((group) =>
        [...group.querySelectorAll('[data-testid="platform-chip"]')].map((chip) =>
          chip.getAttribute('data-platform'),
        ),
      );
    expect(chips).toEqual([['meta'], ['google_ads']]);
  });

  it("hands each group exactly its own portfolio's pending cards, from every platform read", () => {
    cardStates = {
      google_ads: { status: 'ready', cards: [card('g1', 'google'), card('g2', 'other')] },
      tiktok_ads: { status: 'ready', cards: [card('t1', 'google')] },
    };
    renderActions([
      portfolio({ id: 'google', pending_recommendations: 2, platforms: ['google_ads'] }),
      portfolio({ id: 'meta', pending_recommendations: 1, platforms: ['meta'] }),
    ]);
    const handed = screen
      .getAllByTestId('portfolio-group')
      .map((group) => group.getAttribute('data-cards'));
    expect(handed).toEqual(['platform_signal:g1,platform_signal:t1', '']);
  });

  it('hands no cards while a read is pending or failed, so its recommendations stay rows', () => {
    cardStates = { google_ads: { status: 'error' }, tiktok_ads: { status: 'loading' } };
    renderActions([portfolio({ id: 'google', pending_recommendations: 2 })]);
    expect(screen.getByTestId('portfolio-group').getAttribute('data-cards')).toBe('');
  });
});
