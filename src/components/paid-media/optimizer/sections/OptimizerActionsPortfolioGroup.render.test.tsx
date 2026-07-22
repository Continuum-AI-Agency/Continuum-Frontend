import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { PortfolioListItem } from '@continuum/contracts';

const RUN_ID = '22222222-2222-4222-8222-222222222222';
const PAUSE_ID = '33333333-3333-4333-8333-333333333333';
const HIDDEN_ID = '44444444-4444-4444-8444-444444444444';

// A report with one budget move (needs approval), one pause rec (needs approval), and one
// ad-LEVEL rec (found, not executable → not selectable, danger affordance only).
const report = {
  portfolio: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Prospecting',
    mode: 'balanced',
    apply_mode: 'recommend',
    status: 'active',
  },
  latest_run: {
    id: RUN_ID,
    cycle_ts: '2026-07-20T00:00:00Z',
    mode: 'balanced',
    confidence: { band: 'high', score: 0.82 },
  },
  latest_items: [
    {
      adset_id: 'as-budget',
      adset_name: 'Budget Set',
      current_budget: 100,
      final_budget: 130,
      change_abs: 30,
      change_pct: 0.3,
      apply_status: null,
    },
  ],
  recommendations: [
    {
      id: PAUSE_ID,
      adset_id: 'as-pause',
      adset_name: 'Pause Set',
      kind: 'pause',
      trigger: 'P2_sustained_poor',
      severity: 'high',
      reason: 'CPA well above target',
      status: 'pending',
    },
    {
      id: HIDDEN_ID,
      adset_id: 'as-ad',
      ad_id: 'ad-1',
      kind: 'pause_ad',
      trigger: 'creative_worn',
      severity: 'medium',
      reason: 'One ad is dragging the set',
      status: 'pending',
    },
  ],
  history: [],
};

const requestApplyItemsMutate = mock(() => {});
const setStatusesMutate = mock(() => {});
const setStatusMutate = mock(() => {});

mock.module('../useOptimizerData', () => ({
  useOptimizerPerformance: () => ({ data: report, isLoading: false }),
  useOptimizerEnrolledAdsets: () => ({ data: [] }),
  useOptimizerMutations: () => ({
    setStatus: { mutate: setStatusMutate, isPending: false },
    setStatuses: { mutate: setStatusesMutate, isPending: false },
    requestApplyItems: { mutate: requestApplyItemsMutate, isPending: false },
  }),
  useApplyApproved: () => ({ mutate: mock(() => {}), isPending: false }),
  useApplyAdsetStatus: () => ({ mutate: mock(() => {}), isPending: false }),
}));

// RecommendationInsight opens its own edge read; stub it to the label text so this suite is
// only about the queue's selection/approval behavior.
mock.module('./RecommendationInsight', () => ({
  RecommendationInsight: ({ kind }: { kind: string }) => <span>{kind}</span>,
}));

const { OptimizerActionsPortfolioGroup, buildActionQueue, isSelectableRow } = await import(
  './OptimizerActionsPortfolioGroup'
);

afterEach(() => {
  cleanup();
  requestApplyItemsMutate.mockClear();
  setStatusesMutate.mockClear();
  setStatusMutate.mockClear();
});

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
    pending_recommendations: 2,
    ...over,
  }) as PortfolioListItem;

const renderGroup = (over: Partial<PortfolioListItem> = {}) =>
  render(
    <OptimizerActionsPortfolioGroup adAccountId="act_1" brandId="b1" portfolio={portfolio(over)} />,
  );

describe('buildActionQueue — pure inclusion + selectability', () => {
  it('builds a budget row, a pause row, and a hidden ad-level row', () => {
    const rows = buildActionQueue({
      portfolio: null,
      latest_run: { id: RUN_ID } as never,
      latest_items: report.latest_items as never,
      recommendations: report.recommendations as never,
      history: [],
    });
    expect(rows.map((row) => row.route).sort()).toEqual(['budget', 'hidden', 'pause']);
  });

  it('never marks a hidden ad-level row selectable', () => {
    const rows = buildActionQueue({
      portfolio: null,
      latest_run: null,
      latest_items: [],
      recommendations: report.recommendations as never,
      history: [],
    });
    const hidden = rows.find((row) => row.route === 'hidden');
    expect(hidden).toBeDefined();
    expect(isSelectableRow(hidden as never)).toBe(false);
  });
});

describe('OptimizerActionsPortfolioGroup — the unified queue', () => {
  it('renders the budget move, the pause rec, and the ad-level danger affordance', () => {
    renderGroup();
    expect(screen.getByText(/Budget Set/)).toBeDefined();
    // The ad-level row is present but shows a danger affordance, not a selectable control.
    expect(
      screen.getByLabelText('Ad-level execution is in progress — not yet surfaced here'),
    ).toBeDefined();
    // The hidden row has no selection checkbox.
    expect(screen.queryByLabelText('Select as-ad')).toBeNull();
  });

  it('selecting a budget row and approving calls requestApplyItems with its adset id', () => {
    renderGroup();
    fireEvent.click(screen.getByLabelText('Select Budget Set'));
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    expect(requestApplyItemsMutate).toHaveBeenCalledTimes(1);
    const [payload] = requestApplyItemsMutate.mock.calls[0] as [
      { run_id: string; adset_ids: string[] },
    ];
    expect(payload.run_id).toBe(RUN_ID);
    expect(payload.adset_ids).toEqual(['as-budget']);
  });

  it('routes an approved pause selection to setStatuses(approved), not requestApplyItems', () => {
    renderGroup();
    fireEvent.click(screen.getByLabelText('Select Pause Set'));
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    expect(setStatusesMutate).toHaveBeenCalledTimes(1);
    const [payload] = setStatusesMutate.mock.calls[0] as [{ rec_ids: string[]; status: string }];
    expect(payload.rec_ids).toEqual([PAUSE_ID]);
    expect(payload.status).toBe('approved');
    expect(requestApplyItemsMutate).not.toHaveBeenCalled();
  });

  it('disables approval in observe mode and explains why', () => {
    renderGroup({ apply_mode: 'observe' });
    const approve = screen.getByRole('button', { name: /approve all/i }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(document.body.textContent).toContain('Observe');
  });
});
