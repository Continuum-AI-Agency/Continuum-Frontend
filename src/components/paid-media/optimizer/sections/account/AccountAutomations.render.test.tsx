import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

// The apply-mode pill needs a TooltipProvider ancestor and is not what these tests are about.
mock.module('../../ApplyModePill', () => ({
  ApplyModePill: ({ applyMode }: { applyMode: string | null | undefined }) => (
    <span data-testid="apply-mode">{applyMode}</span>
  ),
}));

// Spread the real module: `mock.module` replaces it for the whole PROCESS, so a partial
// replacement here would reach the next file in the run.
let accountReadData: unknown = null;
const setFamilyMutate = mock((_input: unknown) => {});
let familyFailure: Error | null = null;
const realOptimizerData = await import('../../useOptimizerData');
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerAccountRead: () => ({ data: accountReadData, isLoading: false, isError: false }),
  useAccountApprovals: () => ({
    data: { families: { budget: 'autopilot' }, insights: {} },
    isLoading: false,
    isError: false,
  }),
  useInsightApprovalMutations: () => ({
    setInsight: { mutate: () => {}, isError: false, error: null },
    setFamily: { mutate: setFamilyMutate, isError: Boolean(familyFailure), error: familyFailure },
  }),
}));

const { AccountAutomations } = await import('./AccountAutomations');
const { AccountReadEnvelopeSchema } = await import('../../useOptimizerData');

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

const withRead = () => ({
  utc_day: '2026-09-22',
  ready_at: '2026-09-22T00:01:07Z',
  read: AccountReadEnvelopeSchema.parse({
    utc_day: '2026-09-22',
    read: {
      candidates: [],
      guards: [],
      starved: [],
      ceiling_defaults: { budget: 'recommend', structure: 'recommend', creative_swap: 'off' },
      model: 'deterministic',
    },
  }).read,
});

afterEach(() => {
  accountReadData = null;
  familyFailure = null;
  setFamilyMutate.mockClear();
  cleanup();
});

function mount(portfolios: PortfolioListItem[], onManage = mock((_id: string) => {})) {
  return {
    onManage,
    ...render(
      <AccountAutomations
        adAccountId="act_1"
        brandId="b1"
        onManagePortfolio={onManage}
        portfolios={portfolios}
      />,
    ),
  };
}

describe('AccountAutomations — the account-level ceilings', () => {
  it('shows what each family may do, under the defaults the read was composed with', () => {
    accountReadData = withRead();
    const { getByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    const grid = getByTestId('family-ceilings');
    // creative_swap ships as 'off' on this read, and nobody has touched it.
    const swap = grid.querySelector('[data-family="creative_swap"]');
    expect(swap?.querySelector('[aria-pressed="true"]')?.getAttribute('data-state-option')).toBe(
      'off',
    );
    // budget was chosen by someone: the choice wins over the shipped value.
    const budget = grid.querySelector('[data-family="budget"]');
    expect(budget?.querySelector('[aria-pressed="true"]')?.getAttribute('data-state-option')).toBe(
      'autopilot',
    );
  });

  it('writes the family that was clicked', () => {
    accountReadData = withRead();
    const { getByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    const structure = getByTestId('family-ceilings').querySelector('[data-family="structure"]');
    fireEvent.click(structure?.querySelector('[data-state-option="autopilot"]') as HTMLElement);
    expect(setFamilyMutate).toHaveBeenCalledWith({ family: 'structure', state: 'autopilot' });
  });

  it('says why a change was refused, on the panel where it was asked', () => {
    accountReadData = withRead();
    familyFailure = new Error('Could not change what this family may do: function does not exist');
    const { getByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    expect(getByTestId('family-error').textContent).toContain('function does not exist');
  });

  // Without the read there are no defaults to show as "in force", and a panel that pressed
  // 'Suggest' on every row would be presenting a guess as a setting.
  it('says the ceilings arrive with the first read, rather than guessing them', () => {
    accountReadData = null;
    const { getByTestId, queryByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    expect(queryByTestId('family-ceilings')).toBeNull();
    expect(getByTestId('family-ceilings-pending').textContent).toContain('first account read');
  });
});

describe('AccountAutomations — autonomy per portfolio', () => {
  const book = [
    portfolio({ id: 'a', name: 'Alpha', apply_mode: 'autopilot' }),
    portfolio({ id: 'b', name: 'Beta', apply_mode: 'autopilot', autopilot_paused: true }),
    portfolio({ id: 'c', name: 'Gamma', apply_mode: 'recommend', pending_recommendations: 3 }),
  ];

  it('counts what runs on its own, and what has been stopped', () => {
    const { getByTestId } = mount(book);
    const meta = getByTestId('portfolio-autonomy-meta').textContent ?? '';
    expect(meta).toContain('2 of 3 on autopilot');
    expect(meta).toContain('1 stopped');
  });

  it('lists every portfolio with its mode and what is waiting on a person', () => {
    const { getByTestId } = mount(book);
    const list = getByTestId('portfolio-autonomy');
    expect(list.querySelectorAll('[data-portfolio]')).toHaveLength(3);
    const gamma = list.querySelector('[data-portfolio="c"]');
    expect(gamma?.textContent).toContain('3 waiting on a decision');
    expect(gamma?.querySelector('[data-testid="apply-mode"]')?.textContent).toBe('recommend');
    expect(list.querySelector('[data-portfolio="a"]')?.textContent).toContain('nothing waiting');
  });

  it('sends the reader to the portfolio’s own Manage section to change it', () => {
    const { getByTestId, onManage } = mount(book);
    const gamma = getByTestId('portfolio-autonomy').querySelector('[data-portfolio="c"]');
    fireEvent.click(gamma?.querySelector('button') as HTMLElement);
    expect(onManage).toHaveBeenCalledWith('c');
  });
});
