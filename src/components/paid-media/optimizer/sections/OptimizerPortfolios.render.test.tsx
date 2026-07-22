import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { PortfolioOpenPlan } from './portfolioAccounts';

// The archived section runs live React Query reads; stub the data layer so the card
// stack renders without a QueryClient. The apply-mode pill needs a Radix
// TooltipProvider ancestor — not relevant here — so it is stubbed out too.
mock.module('../useOptimizerData', () => ({
  useOptimizerArchivedPortfolios: () => ({ data: [] }),
  useOptimizerMutations: () => ({
    restore: { mutate: () => {}, isPending: false, isError: false, error: null },
  }),
}));
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

const { OptimizerPortfolios } = await import('./OptimizerPortfolios');

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

const PROSPECTING = portfolio({ id: 'p1', name: 'Prospecting' });
const openPlan: () => PortfolioOpenPlan = () => ({ kind: 'open', portfolioId: 'p1' });

function renderList(
  props: Partial<Parameters<typeof OptimizerPortfolios>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <OptimizerPortfolios
      brandId="b1"
      adAccountId="act_1"
      portfolios={[PROSPECTING]}
      currency="USD"
      onCreate={() => {}}
      onOpenDetail={() => {}}
      brandGroups={[]}
      brandPortfolioCount={1}
      planOpen={openPlan}
      onOpenAcrossAccounts={() => {}}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe('OptimizerPortfolios', () => {
  it('opens the detail workspace on a single card click', () => {
    const onOpenDetail = mock((_id: string) => {});
    const { getByRole } = renderList({ onOpenDetail });

    fireEvent.click(getByRole('button', { name: 'Open Prospecting' }));
    expect(onOpenDetail).toHaveBeenCalledWith('p1');
  });

  it('no longer renders the split Performance / Manage disclosures', () => {
    const { queryByText, queryByRole } = renderList();

    expect(queryByText('Performance')).toBeNull();
    expect(queryByText('Manage')).toBeNull();
    expect(queryByRole('button', { name: 'Performance' })).toBeNull();
    expect(queryByRole('button', { name: 'Manage' })).toBeNull();
  });

  it('fires onCreate from the New portfolio button (no sheet)', () => {
    const onCreate = mock(() => {});
    const { getByRole } = renderList({ onCreate });

    fireEvent.click(getByRole('button', { name: 'New portfolio' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('warms the detail reads when a card is hovered', () => {
    const onPrefetchPortfolio = mock((_id: string) => {});
    const { getByRole } = renderList({ onPrefetchPortfolio });

    fireEvent.mouseEnter(getByRole('button', { name: 'Open Prospecting' }));
    expect(onPrefetchPortfolio).toHaveBeenCalledWith('p1');
  });
});
