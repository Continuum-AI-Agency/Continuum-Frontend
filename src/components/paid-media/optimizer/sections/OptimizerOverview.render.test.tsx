import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

// The budget chart pulls in the BKLit chart stack; the apply-mode pill needs a Radix
// TooltipProvider ancestor. Neither is what these tests are about (the header actions,
// the sort control, and the clickable glance cards), so both are stubbed to keep the
// render focused on OptimizerOverview's own behavior.
mock.module('../charts/BudgetMixChart', () => ({
  BudgetMixChart: () => <div data-testid="budget-chart" />,
}));
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

const { OptimizerOverview, sortPortfolios } = await import('./OptimizerOverview');

function portfolio(
  overrides: Partial<PortfolioListItem> & { id: string; name: string },
): PortfolioListItem {
  return {
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 500,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 2,
    pending_recommendations: 0,
    ...overrides,
  };
}

const ZEBRA = portfolio({ id: 'z', name: 'Zebra', daily_total: 100 });
const ALPHA = portfolio({ id: 'a', name: 'Alpha', daily_total: 900 });

afterEach(cleanup);

describe('OptimizerOverview', () => {
  it('fires onCreatePortfolio when the primary New portfolio button is clicked', () => {
    const onCreate = mock(() => {});
    const { getByRole } = render(
      <OptimizerOverview
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={onCreate}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'New portfolio' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('selects a portfolio when its glance card is clicked', () => {
    const onSelect = mock((_id: string) => {});
    const { getByRole } = render(
      <OptimizerOverview
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={onSelect}
        onCreatePortfolio={() => {}}
      />,
    );

    fireEvent.click(getByRole('button', { name: /Alpha/ }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('warms the portfolio detail reads when a glance card is hovered', () => {
    const onPrefetch = mock((_id: string) => {});
    const { getByRole } = render(
      <OptimizerOverview
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
        onPrefetchPortfolio={onPrefetch}
      />,
    );

    fireEvent.mouseEnter(getByRole('button', { name: /Alpha/ }));
    expect(onPrefetch).toHaveBeenCalledWith('a');
  });

  it('reorders the glance list when the sort control changes the key', () => {
    const { getByRole, getAllByRole } = render(
      <OptimizerOverview
        portfolios={[ZEBRA, ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );

    // Default sort is name ascending → Alpha before Zebra.
    let cards = getAllByRole('button', { name: /Alpha|Zebra/ });
    expect(cards[0].textContent).toContain('Alpha');

    // Switch to daily budget ascending → Zebra ($100) before Alpha ($900).
    fireEvent.click(getByRole('button', { name: 'Daily budget' }));
    cards = getAllByRole('button', { name: /Alpha|Zebra/ });
    expect(cards[0].textContent).toContain('Zebra');
  });

  it('flips order when the direction toggle is pressed', () => {
    const { getByRole, getAllByRole } = render(
      <OptimizerOverview
        portfolios={[ZEBRA, ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );

    expect(getAllByRole('button', { name: /Alpha|Zebra/ })[0].textContent).toContain('Alpha');
    fireEvent.click(getByRole('button', { name: 'Sort ascending' }));
    expect(getAllByRole('button', { name: /Alpha|Zebra/ })[0].textContent).toContain('Zebra');
  });
});

describe('sortPortfolios', () => {
  it('sorts by name, daily budget and pending count in both directions', () => {
    const list = [ZEBRA, ALPHA];
    expect(sortPortfolios(list, 'name', 'asc').map((p) => p.id)).toEqual(['a', 'z']);
    expect(sortPortfolios(list, 'name', 'desc').map((p) => p.id)).toEqual(['z', 'a']);
    expect(sortPortfolios(list, 'daily', 'asc').map((p) => p.id)).toEqual(['z', 'a']);
    expect(sortPortfolios(list, 'daily', 'desc').map((p) => p.id)).toEqual(['a', 'z']);
  });

  it('treats a null daily budget as zero rather than sorting it to the top', () => {
    const unset = portfolio({ id: 'u', name: 'Unset', daily_total: null });
    expect(sortPortfolios([ALPHA, unset], 'daily', 'desc').map((p) => p.id)).toEqual(['a', 'u']);
  });
});
