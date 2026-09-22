import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { PortfolioOpenPlan } from './portfolioAccounts';

// The archived section runs live React Query reads; stub the data layer so the card
// stack renders without a QueryClient. The apply-mode pill needs a Radix
// TooltipProvider ancestor — not relevant here — so it is stubbed out too.
//
// SPREAD THE REAL MODULE. `mock.module` replaces a module for the whole PROCESS, and bun
// runs every test file in one — so a partial replacement here left the next file in the
// run importing a `useOptimizerData` with only two exports, and it died on
// "Export named 'useOptimizerAccountEnrollments' not found". Overriding only what this
// file needs keeps the leak harmless.
const realOptimizerData = await import('../useOptimizerData');

/** What today's account read found, per test. Empty by default: most cases are not about it. */
let accountReadCandidates: unknown[] = [];

mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerArchivedPortfolios: () => ({ data: [] }),
  // The foot band's source. Stubbed rather than stripped, because the band is now part of
  // what this file renders — leaving the hook out is how "No QueryClient set" gets in.
  useOptimizerAccountRead: () => ({ data: { read: { candidates: accountReadCandidates } } }),
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

afterEach(() => {
  accountReadCandidates = [];
  cleanup();
});

/** A candidate in the shape the detectors write, with the headline vocabulary on it. */
function candidate(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'dead_tail:act_1',
    detector: 'dead_tail',
    portfolio_ids: ['p1'],
    impact_per_day: 69.75,
    impact_class: 'recoverable',
    confidence: 1,
    impact_basis: '3 ad sets with 0 results in 7 days',
    evidence: {},
    headline: {
      kind: 'avoided',
      value: 69.75,
      unit: 'currency_per_day',
      label: 'a day buying nothing',
      from: null,
      to: null,
    },
    chart: null,
    capped_by: null,
    result_label: 'leads',
    state: null,
    state_lowered: false,
    cta: { kind: 'none', target_id: null },
    ...over,
  };
}

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

  // The whole point of the band: a finding must read the SAME way here as on the Overview,
  // in the detector's own figure — not as money on one screen and a percentage on the other.
  it('carries today’s finding under the card, led by the detector’s own figure', () => {
    accountReadCandidates = [candidate()];
    const { getByTestId } = renderList();

    const band = getByTestId('portfolio-lead');
    expect(band.getAttribute('data-detector')).toBe('dead_tail');
    expect(band.textContent).toContain('Spending on nothing');
    expect(band.textContent).toContain('$70');
    expect(band.textContent).toContain('a day buying nothing');
    // Money drops to the support line, in both periods, and names what the account buys.
    expect(band.textContent).toContain('$2,093/mo');
    expect(band.textContent).toContain('leads');
  });

  it('renders no band on a portfolio today’s read says nothing about', () => {
    accountReadCandidates = [candidate({ portfolio_ids: ['other'] })];
    const { queryByTestId } = renderList();

    expect(queryByTestId('portfolio-lead')).toBeNull();
  });

  // The brand-wide scope is a navigation list across every ad account the brand owns, and an
  // account read is per account. Decorating it would cost one read per group; it does not.
  it('leaves the all-accounts browser undecorated', () => {
    accountReadCandidates = [candidate()];
    const { getByRole, queryByTestId } = renderList({
      brandPortfolioCount: 4,
      brandGroups: [
        {
          accountId: 'act_2',
          label: 'Another account',
          known: true,
          isSelected: false,
          portfolios: [portfolio({ id: 'p9', name: 'Elsewhere', ad_account_id: 'act_2' })],
        },
      ],
    });

    fireEvent.click(getByRole('button', { name: /All accounts/ }));
    expect(queryByTestId('portfolio-lead')).toBeNull();
  });
});
