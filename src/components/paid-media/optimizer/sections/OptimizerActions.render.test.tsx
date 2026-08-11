import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { PortfolioListItem } from '@continuum/contracts';

// The populated branch mounts per-portfolio groups that each open their own
// React Query reads. This suite is about the CAUGHT-UP branch, so those are
// stubbed to keep the test to one concern.
mock.module('./OptimizerActionsPortfolioGroup', () => ({
  OptimizerActionsPortfolioGroup: () => <div data-testid="portfolio-group" />,
}));

const { OptimizerActions } = await import('./OptimizerActions');

afterEach(cleanup);

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
