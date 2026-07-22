import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { PortfolioListItem } from '@continuum/contracts';

const noopMutation = () => ({
  mutate: mock(() => {}),
  mutateAsync: mock(async () => {}),
  isPending: false,
});

mock.module('../useOptimizerData', () => ({
  useOptimizerMutations: () => ({
    update: noopMutation(),
    enroll: noopMutation(),
    unenroll: noopMutation(),
    archive: noopMutation(),
    setPaused: noopMutation(),
  }),
  useOptimizerEnrolledAdsets: () => ({
    data: [{ adset_id: 'as-1', adset_name: 'Set One' }],
    isLoading: false,
  }),
  useOptimizerAccountSnapshots: () => ({
    // as-1 declares it buys leads; a purchase portfolio prices purchases, so switching would
    // freeze it. as-2 is not enrolled and must never be counted.
    data: [
      { id: 'as-1', kpiField: 'leads' },
      { id: 'as-2', kpiField: 'purchases' },
    ],
    isLoading: false,
    isError: false,
  }),
}));

// The picker is a heavy virtualized tree; stub it so this suite is only about the config form.
mock.module('../picker/CampaignAdsetPicker', () => ({
  CampaignAdsetPicker: () => <div data-testid="picker" />,
}));

const { PortfolioManagePanel, adsetsThatStopMatching } = await import('./PortfolioManagePanel');

afterEach(cleanup);

const portfolio = (over: Partial<PortfolioListItem> = {}): PortfolioListItem =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Prospecting',
    ad_account_id: 'act_1',
    objective: 'purchase',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 4200,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 3,
    pending_recommendations: 0,
    ...over,
  }) as PortfolioListItem;

const renderPanel = (over: Partial<PortfolioListItem> = {}) =>
  render(
    <PortfolioManagePanel
      adAccountId="act_1"
      brandId="b1"
      currency="USD"
      portfolio={portfolio(over)}
    />,
  );

describe('adsetsThatStopMatching — the kpi_mismatch count that gates the objective confirm', () => {
  const snapshots = [
    { id: 'as-1', kpiField: 'leads' },
    { id: 'as-2', kpiField: 'purchases' },
    { id: 'as-3' }, // declares nothing → inherits the objective → never a mismatch
  ];

  it('counts only enrolled ad sets that declare a different result', () => {
    const affected = adsetsThatStopMatching(snapshots, ['as-1', 'as-3'], 'purchases');
    expect(affected.map((s) => s.id)).toEqual(['as-1']);
  });

  it('never counts an ad set that declares nothing (it inherits the objective)', () => {
    const affected = adsetsThatStopMatching(snapshots, ['as-3'], 'leads');
    expect(affected).toHaveLength(0);
  });

  it('never counts an ad set that is not enrolled', () => {
    const affected = adsetsThatStopMatching(snapshots, ['as-1'], 'purchases');
    expect(affected.map((s) => s.id)).toEqual(['as-1']);
    expect(affected.some((s) => s.id === 'as-2')).toBe(false);
  });
});

describe('PortfolioManagePanel — config form', () => {
  it('renders the editable objective section', () => {
    renderPanel();
    expect(screen.getByText('Objective')).toBeDefined();
    // The panel is organized into slot-in sections.
    expect(screen.getByText('Identity')).toBeDefined();
    expect(screen.getByText('Strategy')).toBeDefined();
    expect(screen.getByText('Autopilot guardrails')).toBeDefined();
  });

  it('fills the guardrail inputs from the suggestion chips', () => {
    renderPanel();

    // Max autopilot spend/day ≈ daily budget × 1.5 = 4200 × 1.5 = 6300.
    fireEvent.click(screen.getByText('Suggest $6,300'));
    const maxDaily = screen.getByLabelText(/Max autopilot spend\/day/) as HTMLInputElement;
    expect(maxDaily.value).toBe('6300');

    // Max change per cycle chip fills 20.
    fireEvent.click(screen.getByText('Suggest 20%'));
    const maxPct = screen.getByLabelText(/Max change per cycle/) as HTMLInputElement;
    expect(maxPct.value).toBe('20');
  });
});
