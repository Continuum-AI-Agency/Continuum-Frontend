import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// What gates the surface: the portfolio read, and nothing else. Every section is a stub so
// this file is about the shell's loading behaviour, not the sections' own reads.
// `mock.module` replaces a module for the whole process; the FE suite runs one process per
// file, and the real data module is spread so any other export still resolves.
const realOptimizerData = await import('./useOptimizerData');

type PortfoliosState = {
  isLoading: boolean;
  isError: boolean;
  hasAnswer: boolean;
  data: PortfolioListItem[];
};

let portfolios: PortfoliosState;
let pendingSecondaryRead = false;
const refetch = mock(async () => undefined);

mock.module('./useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerPortfolios: () => ({
    ...portfolios,
    refetch,
    brandPortfolios: portfolios.data,
    brandPortfolioCount: portfolios.data.length,
    otherAccountIds: [],
    droppedRowCount: 0,
  }),
  // Secondary reads: a pending one must never hold the surface.
  useOptimizerRenewals: () => ({ data: [], isLoading: pendingSecondaryRead }),
  useOptimizerAdAccounts: () => ({ data: [], isLoading: pendingSecondaryRead }),
  useAdAccountCurrency: () => null,
  usePrefetchPortfolioDetail: () => () => undefined,
  useWarmActionsQueue: () => () => undefined,
}));

mock.module('./useOptimizerUrlState', () => ({
  useOptimizerUrlState: () => ({
    view: 'overview',
    portfolioId: null,
    adsetId: null,
    metric: 'cpa',
    section: null,
    range: '30d',
    openPortfolio: () => undefined,
    closePortfolio: () => undefined,
    openCreate: () => undefined,
    setAdset: () => undefined,
    setMetric: () => undefined,
    setRange: () => undefined,
    setSection: () => undefined,
    setView: () => undefined,
  }),
}));

const stub = (testId: string) => () => <div data-testid={testId} />;
mock.module('./sections/OptimizerOverview', () => ({
  OptimizerOverview: stub('overview-section'),
}));
mock.module('./sections/account/AccountAutomations', () => ({
  AccountAutomations: stub('automations-section'),
}));
mock.module('./sections/OptimizerPortfolios', () => ({
  OptimizerPortfolios: stub('portfolios-section'),
}));
mock.module('./sections/OptimizerActions', () => ({
  OptimizerActions: stub('actions-section'),
}));
mock.module('./sections/OptimizerActivity', () => ({
  OptimizerActivity: stub('activity-section'),
}));
mock.module('./sections/OptimizerOnboarding', () => ({
  OptimizerOnboarding: stub('onboarding-section'),
}));
mock.module('./sections/PortfolioCreateView', () => ({
  PortfolioCreateView: stub('create-section'),
}));
mock.module('./sections/PortfolioDetailWorkspace', () => ({
  PortfolioDetailWorkspace: stub('detail-section'),
}));
mock.module('./sections/OptimizerPortfolioBrowser', () => ({
  OptimizerPortfolioBrowser: stub('browser-section'),
}));
mock.module('@/components/settings/account/OptimizerNotificationsSection', () => ({
  OptimizerNotificationsSection: stub('notifications-section'),
}));

const { OptimizerTab } = await import('./OptimizerTab');

const PORTFOLIO = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Prospecting',
  objective: 'lead',
  level: 'adset',
  mode: 'balanced',
  apply_mode: 'recommend',
  daily_total: 500,
  period_budget: null,
  status: 'active',
  next_realloc_at: null,
  ad_account_id: 'act_1',
  adset_count: 2,
  pending_recommendations: 0,
} as unknown as PortfolioListItem;

function renderTab() {
  return render(<OptimizerTab adAccountId="act_1" brandId="brand-1" platform="meta" />);
}

beforeEach(() => {
  portfolios = { isLoading: false, isError: false, hasAnswer: true, data: [PORTFOLIO] };
  pendingSecondaryRead = false;
});

afterEach(() => {
  cleanup();
  refetch.mockClear();
});

describe('OptimizerTab loading behaviour', () => {
  it('shows the skeleton only while the portfolio read has never answered', () => {
    portfolios = { isLoading: true, isError: false, hasAnswer: false, data: [] };
    renderTab();

    expect(screen.getByText('Loading optimizer')).toBeTruthy();
    expect(screen.queryByTestId('overview-section')).toBeNull();
  });

  it('goes offline when the first read fails and there is nothing to show', () => {
    portfolios = { isLoading: false, isError: true, hasAnswer: false, data: [] };
    renderTab();

    expect(screen.getByText("Can't reach the optimizer")).toBeTruthy();
    expect(screen.queryByTestId('overview-section')).toBeNull();
  });

  it('keeps painting the last answer when a refresh fails, with a retry in place', () => {
    portfolios = { isLoading: false, isError: true, hasAnswer: true, data: [PORTFOLIO] };
    renderTab();

    expect(screen.queryByText("Can't reach the optimizer")).toBeNull();
    expect(screen.getByTestId('overview-section')).toBeTruthy();
    const notice = screen.getByTestId('optimizer-refresh-failed');
    expect(notice.textContent).toContain("Couldn't refresh");

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('paints the surface while secondary reads are still pending', () => {
    pendingSecondaryRead = true;
    renderTab();

    expect(screen.queryByText('Loading optimizer')).toBeNull();
    expect(screen.getByTestId('overview-section')).toBeTruthy();
    expect(screen.queryByTestId('optimizer-refresh-failed')).toBeNull();
  });
});
