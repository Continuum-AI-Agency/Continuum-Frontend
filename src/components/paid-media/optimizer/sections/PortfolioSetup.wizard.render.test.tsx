import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioSuggestion } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as realData from '../useOptimizerData';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const createMutateAsync = mock(async () => ({ portfolio_id: 'p-new' }));
const enrollMutateAsync = mock(async () => ({}));
const runMutate = mock(() => {});
const onCreated = mock(() => {});

const suggestion: PortfolioSuggestion = {
  objective: 'lead',
  name: 'Leads · Efficiency',
  level: 'adset',
  mode: 'efficiency',
  daily_total: 1600,
  cpa_target: 36,
  adset_ids: ['as-1', 'as-2'],
  summary: { adsets: 2, spend14: 4200, conv14: 60 },
  reason: 'Two lead ad sets with the same declared result.',
};

const window = (spend: number, leads: number) => ({
  spend,
  leads,
  purchases: 0,
  addToCarts: 0,
  clicks: 10,
  impressions: 1000,
});
const snapshots = [
  {
    id: 'as-1',
    name: 'Set One',
    status: 'active',
    currentBudget: 1000,
    campaignId: 'c-1',
    campaignName: 'Campaign One',
    kpiField: 'leads',
    windows: { d3: window(100, 5), d7: window(300, 12), d14: window(600, 20) },
  },
  {
    id: 'as-2',
    name: 'Set Two',
    status: 'active',
    currentBudget: 600,
    campaignId: 'c-1',
    campaignName: 'Campaign One',
    kpiField: 'leads',
    windows: { d3: window(100, 2), d7: window(300, 5), d14: window(600, 8) },
  },
];

mock.module('../useOptimizerData', () => ({
  ...realData,
  useOptimizerAdAccounts: () => ({
    data: [
      { platform: 'meta', account_id: 'act_1', name: 'Acct', status: 'ACTIVE', currency: 'USD' },
    ],
  }),
  useOptimizerSuggestions: () => ({
    data: { suggestions: [suggestion], diagnostics: null, reason: null },
    isLoading: false,
    isError: false,
  }),
  useOptimizerAccountSnapshots: () => ({ data: snapshots, isLoading: false, isError: false }),
  useOptimizerAccountEnrollments: () => ({ data: [], isLoading: false, isError: false }),
  useOptimizerAdsetInventory: () => ({
    data: [],
    fetchedAt: null,
    partial: false,
    truncated: false,
    refresh: () => {},
    canRefresh: true,
    isRefreshing: false,
    isLoading: false,
    isError: false,
  }),
  useOptimizerInsight: () => ({ data: null, isLoading: false }),
  useOptimizerMutations: () => ({
    create: { mutate: mock(() => {}), mutateAsync: createMutateAsync, isPending: false },
    enroll: { mutate: mock(() => {}), mutateAsync: enrollMutateAsync, isPending: false },
    run: { mutate: runMutate, isPending: false },
  }),
}));

// Heavy neighbours: the virtualized picker and the creative explorer are stubbed so this
// suite is about the wizard's flow and the request it builds.
mock.module('../picker/CampaignAdsetPicker', () => ({
  CampaignAdsetPicker: ({ selectedAdsetIds }: { selectedAdsetIds: string[] }) => (
    <div data-testid="picker">{selectedAdsetIds.join(',')}</div>
  ),
}));
mock.module('./SuggestionExplorer', () => ({
  SuggestionExplorer: () => <div data-testid="explorer" />,
}));
mock.module('./CboCampaigns', () => ({ CboCampaigns: () => null }));
mock.module('./ProjectedConversions', () => ({ ProjectedConversions: () => null }));
mock.module('./SignalReadinessCard', () => ({ SignalReadinessCard: () => null }));

const { PortfolioSetup } = await import('./PortfolioSetup');

beforeEach(() => {
  createMutateAsync.mockClear();
  enrollMutateAsync.mockClear();
  runMutate.mockClear();
  onCreated.mockClear();
});
afterEach(cleanup);

const renderSetup = () =>
  render(<PortfolioSetup adAccountId="act_1" brandId="b1" currency="USD" onCreated={onCreated} />);

const next = () => fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('PortfolioSetup — the four-step wizard', () => {
  it('a suggestion card says what it groups, what a result costs and why', () => {
    renderSetup();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Leads · Efficiency');
    expect(text).toContain('Why this group:');
    expect(text).toContain('Cost per result spreads from $30 to $75');
    expect(screen.getByRole('button', { name: /Start from scratch/ })).toBeDefined();
  });

  it('using a suggestion walks Assets → Goal → Plan and creates with the seeded config', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Use this/ }));

    // Assets: the suggestion's ad sets are already selected.
    expect(screen.getByTestId('picker').textContent).toBe('as-1,as-2');
    next();

    // Goal: lead is pressed, the target is priced in CPL, and the suggestion's target rides in.
    expect(screen.getByRole('button', { name: /^Lead$/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect((screen.getByLabelText(/Target CPL/) as HTMLInputElement).value).toBe('36');
    expect(screen.getByRole('button', { name: /^Efficiency/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    next();

    // Plan: the name is seeded, the daily budget matches the selection, Recommend is on.
    expect((screen.getByLabelText(/^Name$/) as HTMLInputElement).value).toBe('Leads · Efficiency');
    expect(document.body.textContent).toContain('Blank matches the selection: $1,600/day');
    expect(screen.getByRole('button', { name: /^Recommend/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /Create & enroll 2 ad sets/ }));
    await flush();

    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    const request = createMutateAsync.mock.calls[0]?.[0] as unknown as {
      brand_id: string;
      ad_account_id: string;
      config: Record<string, unknown>;
    };
    expect(request.brand_id).toBe('b1');
    expect(request.config).toMatchObject({
      name: 'Leads · Efficiency',
      objective: 'lead',
      mode: 'efficiency',
      apply_mode: 'recommend',
      daily_total: 1600,
      budget_source: 'observed',
      cpa_target: 36,
      budget_granularity: 'daily',
    });
    expect(enrollMutateAsync).toHaveBeenCalledWith({
      portfolio_id: 'p-new',
      adset_ids: ['as-1', 'as-2'],
      adset_names: { 'as-1': 'Set One', 'as-2': 'Set Two' },
    });
    expect(runMutate).toHaveBeenCalledWith('p-new');
    expect(onCreated).toHaveBeenCalledWith('p-new');
  });

  it('from scratch, Assets will not advance without a selection and says why', () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Start from scratch/ }));
    expect(document.body.textContent).toContain('Select at least one ad set.');
    expect((screen.getByRole('button', { name: /^Next/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('by campaign: ticking a campaign takes its ad sets and enrolls by campaign id', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Start from scratch/ }));
    fireEvent.click(screen.getByRole('button', { name: 'By campaign' }));
    fireEvent.click(screen.getByLabelText(/Select campaign Campaign One/));
    expect(document.body.textContent).toContain('1 campaign · 2 ad sets');
    next();
    next();
    fireEvent.change(screen.getByLabelText(/^Name$/), { target: { value: 'Whole campaign' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & enroll/ }));
    await flush();
    expect(enrollMutateAsync).toHaveBeenCalledWith({ portfolio_id: 'p-new', campaign_id: 'c-1' });
  });

  it('choosing Autopilot fills the guardrails and they reach the create request in stored units', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Use this/ }));
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: /^Autopilot/ }));
    // 1.5 × the matched $1,600/day, and the 20% cap.
    expect((screen.getByLabelText(/Max autopilot spend\/day/) as HTMLInputElement).value).toBe(
      '2400',
    );
    expect((screen.getByLabelText(/Max change per cycle/) as HTMLInputElement).value).toBe('20');
    fireEvent.click(screen.getByRole('button', { name: /Create & enroll/ }));
    await flush();
    const request = createMutateAsync.mock.calls[0]?.[0] as unknown as {
      config: Record<string, unknown>;
    };
    expect(request.config).toMatchObject({
      apply_mode: 'autopilot',
      max_daily_apply_minor: 240_000,
      max_change_pct_per_cycle: 0.2,
    });
  });

  it('a flight typed per month lands as a period budget and a daily total', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Use this/ }));
    next();
    next();
    fireEvent.click(screen.getByRole('button', { name: 'Next 30 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Per month' }));
    fireEvent.change(screen.getByLabelText(/^Budget \(\$\)/), { target: { value: '60000' } });
    expect(document.body.textContent).toContain('= $60,000 for the flight · ≈ $2,000/day');
    fireEvent.click(screen.getByRole('button', { name: /Create & enroll/ }));
    await flush();
    const request = createMutateAsync.mock.calls[0]?.[0] as unknown as {
      config: Record<string, unknown>;
    };
    expect(request.config).toMatchObject({
      period_budget: 60_000,
      daily_total: 2000,
      budget_source: 'fixed',
      budget_granularity: 'monthly',
    });
    expect(typeof request.config.period_start).toBe('string');
  });

  it('scale mode asks for its plan and stores it as a fraction and days', async () => {
    renderSetup();
    fireEvent.click(screen.getByRole('button', { name: /Use this/ }));
    next();
    fireEvent.click(screen.getByRole('button', { name: /^Scale/ }));
    expect((screen.getByLabelText(/Grow by/) as HTMLInputElement).value).toBe('10');
    fireEvent.change(screen.getByLabelText(/Every \(days\)/), { target: { value: '14' } });
    next();
    fireEvent.click(screen.getByRole('button', { name: /Create & enroll/ }));
    await flush();
    const request = createMutateAsync.mock.calls[0]?.[0] as unknown as {
      config: Record<string, unknown>;
    };
    expect(request.config).toMatchObject({
      mode: 'scale',
      scale_growth_pct: 0.1,
      scale_cadence_days: 14,
    });
  });
});
