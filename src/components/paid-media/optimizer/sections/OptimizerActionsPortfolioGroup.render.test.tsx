import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import {
  type ApplyAdsetStatusResponse,
  ApplyAdsetStatusResponseSchema,
  type ApplyRunResponse,
  ApplyRunResponseSchema,
  type CycleItemRow,
  type PortfolioListItem,
  type RecommendationRow,
} from '@continuum/contracts';
import type { ReactNode } from 'react';

const RUN_ID = '22222222-2222-4222-8222-222222222222';
const PAUSE_ID = '33333333-3333-4333-8333-333333333333';
const HIDDEN_ID = '44444444-4444-4444-8444-444444444444';
const CREATIVE_ID = '55555555-5555-4555-8555-555555555555';

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
    {
      id: CREATIVE_ID,
      adset_id: 'as-creative',
      adset_name: 'Winner Set',
      ad_id: 'ad-winner',
      kind: 'variate_creative',
      trigger: 'C2_creative_winner',
      severity: 'medium',
      reason: 'The winning creative costs less per result than the rest of the set',
      status: 'pending',
      seed: {
        adSetId: 'as-creative',
        winnerAdId: 'ad-winner',
        rebuildCraft: true,
        groundedOn: ['hook_archetype=social_proof @ tof'],
      },
    },
  ],
  history: [],
};

// A report whose budget move is already APPROVED (apply_status:'approved_pending') and whose
// pause rec is already APPROVED — the only state in which the money-write execute buttons
// ("Apply N budget moves" / "Pause N ad sets") render. This drives the confirm-dialog → drain
// path that the pure-selection report above never reaches.
const approvedBudgetItem: CycleItemRow = {
  adset_id: 'as-budget',
  adset_name: 'Budget Set',
  current_budget: 100,
  final_budget: 130,
  change_abs: 30,
  change_pct: 0.3,
  apply_status: 'approved_pending',
};
const approvedPauseRec: RecommendationRow = {
  id: PAUSE_ID,
  adset_id: 'as-pause',
  adset_name: 'Pause Set',
  kind: 'pause',
  trigger: 'P2_sustained_poor',
  severity: 'high',
  reason: 'CPA well above target',
  status: 'approved',
};
const executableReport = {
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
  latest_items: [approvedBudgetItem],
  recommendations: [approvedPauseRec],
  history: [],
};

// The mocked performance read returns whichever report the current test installed. Defaults
// back to the pure-selection `report` in afterEach so the existing suites are untouched.
let activeReport: unknown = report;

// The portfolio's recent ad-account writes, as public.optimizer_list_actions returns them.
// Empty by default so the existing queue specs are unaffected.
const RECENT_AUDIT_ID = '66666666-6666-4666-8666-666666666666';
let recentActions: Record<string, unknown>[] = [];

const requestApplyItemsMutate = mock(() => {});
const setStatusesMutate = mock(() => {});
const setStatusMutate = mock(() => {});

// The two Meta-write drains. Stable module-level spies (not fresh per render) so a click can be
// asserted against them. A per-test handler lets a test drive the mutation's onSuccess/onError
// to read back the drain's summary the way the component does.
type SpyMutateOptions<T> = {
  onSuccess?: (data: T) => void;
  onError?: (err: unknown) => void;
};
let applyApprovedHandler: (
  payload: unknown,
  opts: SpyMutateOptions<ApplyRunResponse | null>,
) => void = () => {};
let applyAdsetStatusHandler: (
  payload: unknown,
  opts: SpyMutateOptions<ApplyAdsetStatusResponse | null>,
) => void = () => {};
const applyApprovedMutate = mock(
  (payload: unknown, opts: SpyMutateOptions<ApplyRunResponse | null>) =>
    applyApprovedHandler(payload, opts),
);
const applyAdsetStatusMutate = mock(
  (payload: unknown, opts: SpyMutateOptions<ApplyAdsetStatusResponse | null>) =>
    applyAdsetStatusHandler(payload, opts),
);

mock.module('../useOptimizerData', () => ({
  useOptimizerPerformance: () => ({ data: activeReport, isLoading: false }),
  useOptimizerActions: () => ({ data: recentActions }),
  useOptimizerEnrolledAdsets: () => ({ data: [] }),
  useOptimizerMutations: () => ({
    setStatus: { mutate: setStatusMutate, isPending: false },
    setStatuses: { mutate: setStatusesMutate, isPending: false },
    requestApplyItems: { mutate: requestApplyItemsMutate, isPending: false },
  }),
  useApplyApproved: () => ({ mutate: applyApprovedMutate, isPending: false }),
  useApplyAdsetStatus: () => ({ mutate: applyAdsetStatusMutate, isPending: false }),
}));

// The confirm AlertDialog is a Radix portal + focus-scope; render it as plain, open-gated
// markup (mirrors WorkspacePanel.test) so this suite exercises the confirm → drain wiring, not
// Radix internals. Open-gated so the confirm action only exists once the dialog is opened; the
// latest onOpenChange is captured (single dialog per render) so Cancel closes exactly as the
// component's own handler does. No hooks here — a mocked ui module has no dispatcher.
let dialogOnOpenChange: (open: boolean) => void = () => {};
mock.module('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: ReactNode;
  }) => {
    dialogOnOpenChange = onOpenChange ?? (() => {});
    return open ? children : null;
  },
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <div role="alertdialog">{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button onClick={() => dialogOnOpenChange(false)} type="button">
      {children}
    </button>
  ),
  AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

// RecommendationInsight opens its own edge read; stub it to the label text so this suite is
// only about the queue's selection/approval behavior.
// The undo strip mounts the SAME RevertApplyDialog the action feed does; stub it to its
// trigger so this suite asserts that undo is reachable from the queue, not the dialog's own
// dry-run -> confirm flow (covered where the dialog lives).
mock.module('./RevertApplyDialog', () => ({
  RevertApplyDialog: ({ auditId, scope }: { auditId: string; scope?: string | null }) => (
    <button type="button" data-audit-id={auditId}>
      {scope === 'adset_status' ? 'Unpause' : 'Revert'}
    </button>
  ),
}));

mock.module('./RecommendationInsight', () => ({
  RecommendationInsight: ({ kind }: { kind: string }) => <span>{kind}</span>,
}));

const { OptimizerActionsPortfolioGroup, buildActionQueue, isSelectableRow, selectionLabel } =
  await import('./OptimizerActionsPortfolioGroup');

afterEach(() => {
  cleanup();
  requestApplyItemsMutate.mockClear();
  setStatusesMutate.mockClear();
  setStatusMutate.mockClear();
  applyApprovedMutate.mockClear();
  applyAdsetStatusMutate.mockClear();
  applyApprovedHandler = () => {};
  applyAdsetStatusHandler = () => {};
  activeReport = report;
  recentActions = [];
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
  it('builds a budget row, a pause row, a creative row, and a hidden ad-level row', () => {
    const rows = buildActionQueue({
      portfolio: null,
      latest_run: { id: RUN_ID } as never,
      latest_items: report.latest_items as never,
      recommendations: report.recommendations as never,
      history: [],
    });
    expect(rows.map((row) => row.route).sort()).toEqual(['budget', 'creative', 'hidden', 'pause']);
  });

  it('marks a pending creative-request row selectable', () => {
    const rows = buildActionQueue({
      portfolio: null,
      latest_run: null,
      latest_items: [],
      recommendations: report.recommendations as never,
      history: [],
    });
    const creative = rows.find((row) => row.route === 'creative');
    expect(creative).toBeDefined();
    expect(isSelectableRow(creative as never)).toBe(true);
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
    expect(screen.queryByLabelText('Select pause this ad for as-ad')).toBeNull();
  });

  it('selecting a budget row and approving calls requestApplyItems with its adset id', () => {
    renderGroup();
    fireEvent.click(screen.getByLabelText('Select budget move for Budget Set'));
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
    fireEvent.click(screen.getByLabelText('Select pause ad set for Pause Set'));
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    expect(setStatusesMutate).toHaveBeenCalledTimes(1);
    const [payload] = setStatusesMutate.mock.calls[0] as [{ rec_ids: string[]; status: string }];
    expect(payload.rec_ids).toEqual([PAUSE_ID]);
    expect(payload.status).toBe('approved');
    expect(requestApplyItemsMutate).not.toHaveBeenCalled();
  });

  it('selecting a creative row and approving flips its status to approved (opens a request)', () => {
    renderGroup();
    fireEvent.click(screen.getByLabelText('Select make variations of the winner for Winner Set'));
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    expect(setStatusMutate).toHaveBeenCalledTimes(1);
    const [payload] = setStatusMutate.mock.calls[0] as [
      { recommendation_id: string; status: string },
    ];
    expect(payload.recommendation_id).toBe(CREATIVE_ID);
    expect(payload.status).toBe('approved');
    // Creative approvals are a status flip that opens a task/job — not a budget or pause write.
    expect(requestApplyItemsMutate).not.toHaveBeenCalled();
    expect(setStatusesMutate).not.toHaveBeenCalled();
  });

  it('renders the creative row as a real selectable action, not the ad-level danger affordance', () => {
    renderGroup();
    // A selectable checkbox (not the pause_ad danger icon). The headline is the stubbed
    // RecommendationInsight, which renders the kind — proving it took the insight path, not
    // the muted hidden-row path the pause_ad row uses.
    expect(
      screen.getByLabelText('Select make variations of the winner for Winner Set'),
    ).toBeDefined();
    expect(document.body.textContent).toContain('variate_creative');
  });

  it('disables approval in observe mode and explains why', () => {
    renderGroup({ apply_mode: 'observe' });
    const approve = screen.getByRole('button', { name: /approve all/i }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(document.body.textContent).toContain('Observe');
  });
});

// The money-safety path: only APPROVED rows surface the execute buttons, and only the confirm
// dialog's action fires a real Meta write (dryRun:false). Every case here proves a write happens
// exactly when a human confirms it — and never otherwise.
describe('OptimizerActionsPortfolioGroup — confirm-dialog execute (Meta writes)', () => {
  it('confirming the budget-execute dialog fires applyApproved.mutate with dryRun:false', () => {
    activeReport = executableReport;
    renderGroup();
    fireEvent.click(screen.getByRole('button', { name: /apply 1 budget move/i }));
    // The dialog is now open; its action performs the real budget write.
    fireEvent.click(screen.getByRole('button', { name: /^apply budget moves$/i }));

    expect(applyApprovedMutate).toHaveBeenCalledTimes(1);
    const [payload] = applyApprovedMutate.mock.calls[0] as [
      { portfolio_id: string; run_id?: string; dryRun: boolean },
    ];
    expect(payload.dryRun).toBe(false);
    expect(payload.portfolio_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(payload.run_id).toBe(RUN_ID);
    expect(applyAdsetStatusMutate).not.toHaveBeenCalled();
  });

  it('confirming the pause-execute dialog fires applyAdsetStatus.mutate with dryRun:false', () => {
    activeReport = executableReport;
    renderGroup();
    fireEvent.click(screen.getByRole('button', { name: /pause 1 ad set/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause ad sets$/i }));

    expect(applyAdsetStatusMutate).toHaveBeenCalledTimes(1);
    const [payload] = applyAdsetStatusMutate.mock.calls[0] as [
      { portfolio_id: string; dryRun: boolean },
    ];
    expect(payload.dryRun).toBe(false);
    expect(payload.portfolio_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(applyApprovedMutate).not.toHaveBeenCalled();
  });

  it('dismissing the confirm dialog performs no Meta write', () => {
    activeReport = executableReport;
    renderGroup();
    fireEvent.click(screen.getByRole('button', { name: /apply 1 budget move/i }));
    // Opened: the confirm action exists.
    expect(screen.getByRole('button', { name: /^apply budget moves$/i })).toBeDefined();
    // Cancelling closes it without draining anything.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('button', { name: /^apply budget moves$/i })).toBeNull();
    expect(applyApprovedMutate).not.toHaveBeenCalled();
    expect(applyAdsetStatusMutate).not.toHaveBeenCalled();
  });

  it('observe mode disables both execute buttons and blocks any Meta write', () => {
    activeReport = executableReport;
    renderGroup({ apply_mode: 'observe' });
    const applyBtn = screen.getByRole('button', {
      name: /apply 1 budget move/i,
    }) as HTMLButtonElement;
    const pauseBtn = screen.getByRole('button', { name: /pause 1 ad set/i }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(pauseBtn.disabled).toBe(true);
    fireEvent.click(applyBtn);
    fireEvent.click(pauseBtn);
    expect(applyApprovedMutate).not.toHaveBeenCalled();
    expect(applyAdsetStatusMutate).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Observe');
  });

  it('renders the budget drain failure read back from the result, not an assumed success', () => {
    activeReport = executableReport;
    applyApprovedHandler = (_payload, opts) => {
      opts.onSuccess?.(
        ApplyRunResponseSchema.parse({ ok: false, dryRun: false, reason: 'observe_mode' }),
      );
    };
    renderGroup();
    fireEvent.click(screen.getByRole('button', { name: /apply 1 budget move/i }));
    fireEvent.click(screen.getByRole('button', { name: /^apply budget moves$/i }));

    expect(document.body.textContent).toContain('Observe mode blocks Meta writes.');
  });

  it('summarizes applied + deduped counts read back from the pause drain results', () => {
    activeReport = executableReport;
    applyAdsetStatusHandler = (_payload, opts) => {
      opts.onSuccess?.(
        ApplyAdsetStatusResponseSchema.parse({
          ok: true,
          dryRun: false,
          applied: 1,
          failed: 0,
          deduped: 2,
          results: [],
        }),
      );
    };
    renderGroup();
    fireEvent.click(screen.getByRole('button', { name: /pause 1 ad set/i }));
    fireEvent.click(screen.getByRole('button', { name: /^pause ad sets$/i }));

    expect(document.body.textContent).toContain('Paused 1 · 2 already done');
  });

  it('an ad-level row is never selectable and never yields an execute affordance', () => {
    activeReport = {
      portfolio: executableReport.portfolio,
      latest_run: executableReport.latest_run,
      latest_items: [],
      recommendations: [
        {
          id: HIDDEN_ID,
          adset_id: 'as-ad',
          ad_id: 'ad-1',
          kind: 'pause_ad',
          trigger: 'creative_worn',
          severity: 'medium',
          reason: 'One ad is dragging the set',
          status: 'pending',
        } satisfies RecommendationRow,
      ],
      history: [],
    };
    renderGroup();

    // The finding renders as a read-only danger affordance, never a selectable control.
    expect(
      screen.getByLabelText('Ad-level execution is in progress — not yet surfaced here'),
    ).toBeDefined();
    expect(screen.queryByLabelText('Select pause this ad for as-ad')).toBeNull();
    // No money-write affordance exists for it, and it cannot be approved from this surface.
    expect(screen.queryByRole('button', { name: /budget move/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /ad set/i })).toBeNull();
    const approveAll = screen.getByRole('button', { name: /approve all/i }) as HTMLButtonElement;
    expect(approveAll.disabled).toBe(true);
  });
});

// A REBALANCE: one ad set is cut to fund another, exactly the shape the engine's conserved
// allocation vector produces and that the queue used to render as two unrelated rows. The
// donor is 'held' (autopilot parked it over the % cap) to prove grouping never costs a held
// item its own approval path.
const rebalanceReport = {
  portfolio: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Prospecting',
    mode: 'balanced',
    apply_mode: 'recommend',
    status: 'active',
  },
  latest_run: { id: RUN_ID, cycle_ts: '2026-07-20T00:00:00Z', mode: 'balanced' },
  latest_items: [
    {
      adset_id: 'as-cold',
      adset_name: 'Cold Lookalike',
      current_budget: 50,
      final_budget: 35,
      change_abs: -15,
      change_pct: -0.3,
      apply_status: 'held',
      // The sentence the ENGINE wrote at cycle time (optimizer.cycle_items.reason) — the same
      // string the apply copies into apply_audits.justification.
      reason: 'Earned a smaller share of the pool than its current budget.',
      diagnostics: { score3d: 0.41, score7d: 0.38, score14d: 0.44 },
    },
    {
      adset_id: 'as-retarget',
      adset_name: 'Retarget 30d',
      current_budget: 50,
      final_budget: 65,
      change_abs: 15,
      change_pct: 0.3,
      apply_status: null,
    },
  ],
  recommendations: [],
  history: [],
};

describe('a conserved rebalance reads as ONE decision without losing per-ad-set control', () => {
  it('names both sides of a 1:1 transfer in the group header', () => {
    activeReport = rebalanceReport;
    const { container } = renderGroup();
    // The whole point: the operator sees that cutting one ad set is what funds the other.
    expect(container.textContent).toContain('Moving');
    expect(container.textContent).toContain('from Cold Lookalike into Retarget 30d');
    expect(container.textContent).toContain('Total daily spend unchanged');
  });

  it('keeps BOTH ad sets individually selectable, held one included', () => {
    activeReport = rebalanceReport;
    renderGroup();
    expect(screen.getByLabelText('Select budget move for Cold Lookalike')).toBeTruthy();
    expect(screen.getByLabelText('Select budget move for Retarget 30d')).toBeTruthy();
    expect(screen.getByLabelText('Select all budget moves in this cycle')).toBeTruthy();
  });

  it('says what approving only one half costs, and that the pair is flat', () => {
    activeReport = rebalanceReport;
    const { container } = renderGroup();

    fireEvent.click(screen.getByLabelText('Select budget move for Retarget 30d'));
    expect(container.textContent).toContain('Net +$15/day');

    fireEvent.click(screen.getByLabelText('Select budget move for Cold Lookalike'));
    expect(container.textContent).toContain('Spend stays flat');
    expect(container.textContent).not.toContain('Net +$15/day');
  });

  it('selects the whole group from the header checkbox, then clears it', () => {
    activeReport = rebalanceReport;
    const { container } = renderGroup();
    const groupBox = screen.getByLabelText('Select all budget moves in this cycle');

    fireEvent.click(groupBox);
    expect(container.textContent).toContain('Spend stays flat');

    fireEvent.click(groupBox);
    expect(container.textContent).not.toContain('Spend stays flat');
  });

  it('approves the selected pair as ONE batched RPC carrying both ad set ids', () => {
    activeReport = rebalanceReport;
    renderGroup();
    fireEvent.click(screen.getByLabelText('Select all budget moves in this cycle'));
    fireEvent.click(screen.getByRole('button', { name: /approve selected/i }));

    expect(requestApplyItemsMutate).toHaveBeenCalledTimes(1);
    const payload = requestApplyItemsMutate.mock.calls[0][0] as {
      run_id: string;
      adset_ids: string[];
    };
    expect(payload.run_id).toBe(RUN_ID);
    expect([...payload.adset_ids].sort()).toEqual(['as-cold', 'as-retarget']);
  });

  it('shows each row who it funds / who funded it', () => {
    activeReport = rebalanceReport;
    const { container } = renderGroup();
    expect(container.textContent).toContain('→ funds Retarget 30d');
    expect(container.textContent).toContain('← funded by Cold Lookalike');
  });

  // The "why" is READ, never recomputed: the queue renders the persisted cycle_items.reason
  // so a human and the money ledger cannot be told two different stories about one move.
  it('renders the persisted reason as the why, alongside the scores behind it', () => {
    activeReport = rebalanceReport;
    const { container } = renderGroup();
    fireEvent.click(screen.getAllByLabelText('Show detail')[0]);
    expect(container.textContent).toContain(
      'Earned a smaller share of the pool than its current budget.',
    );
    expect(container.textContent).toContain('3d 0.41 / 7d 0.38 / 14d 0.44');
  });

  // A row scored before the engine persisted a reason says nothing rather than manufacturing
  // one the audit trail does not carry.
  it('says no why at all when the row carries no persisted reason', () => {
    activeReport = rebalanceReport;
    const { container } = renderGroup();
    fireEvent.click(screen.getAllByLabelText('Show detail')[1]);
    expect(container.textContent).toContain('Before → after: $50 → $65');
    expect(container.textContent).not.toContain('Why:');
  });

  it('does NOT group a cycle that only raises — there is no donor and nothing to describe', () => {
    // `report` (the default) has a lone +$30 move. A header there would invent a transfer.
    const { container } = renderGroup();
    expect(container.textContent).not.toContain('Reallocating');
    expect(container.textContent).not.toContain('Moving');
    expect(screen.queryByLabelText('Select all budget moves in this cycle')).toBeNull();
  });
});


// Approving a change and undoing it belong to the same moment. The confirm dialogs used to
// end with "revert it from the activity log" — a different page, found by hand. The writes
// this queue made now sit under it with their undo attached.
describe('undo is one click from the queue that made the write', () => {
  const moneyAction = (over: Record<string, unknown> = {}) => ({
    id: RECENT_AUDIT_ID,
    ts: '2026-08-26T09:00:00Z',
    family: 'money',
    op: 'budget',
    portfolio_id: '11111111-1111-4111-8111-111111111111',
    portfolio_name: 'Prospecting',
    before: { minor: 5000 },
    after: { minor: 3500 },
    actor_kind: 'autopilot',
    reversible: true,
    ...over,
  });

  it('lists this portfolio\'s recent ad-account writes with a revert', () => {
    recentActions = [moneyAction()];
    renderGroup();
    expect(screen.getByText('Recently applied')).toBeTruthy();
    const revert = screen.getByRole('button', { name: 'Revert' });
    expect(revert.getAttribute('data-audit-id')).toBe(RECENT_AUDIT_ID);
  });

  it('gates the button on the RPC flag, never on the row shape', () => {
    recentActions = [moneyAction({ reversible: false })];
    renderGroup();
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('shows an already-undone write as reverted instead of offering it again', () => {
    recentActions = [moneyAction({ reverted_by: '77777777-7777-4777-8777-777777777777' })];
    renderGroup();
    expect(screen.getByText('Reverted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('never offers undo for a setting change — that is not one write against Meta', () => {
    recentActions = [
      moneyAction({ family: 'settings', op: 'setting', entity_id: 'daily_total', reversible: false }),
    ];
    renderGroup();
    expect(screen.queryByText('Recently applied')).toBeNull();
  });

  it('shows nothing at all when this portfolio has no recent writes', () => {
    recentActions = [moneyAction({ portfolio_id: 'some-other-portfolio' })];
    renderGroup();
    expect(screen.queryByText('Recently applied')).toBeNull();
  });

  it('tells the operator undo is right here, not on another page', () => {
    activeReport = executableReport;
    const { container } = renderGroup();
    fireEvent.click(screen.getByRole('button', { name: /apply .* budget move/i }));
    expect(container.textContent).toContain('Recently applied below');
    expect(container.textContent).not.toContain('from the activity log');
  });
});

// Found by optimizer:rebalance:e2e:bench against the live Agency account: one cycle queued a
// budget move AND a creative refresh on the SAME ad set, and both checkboxes were labelled
// "Select ALEIRA // $12 PRIMER MES // AGOSTO". Two different Meta writes, one accessible
// name — a screen reader user could not tell which one they were authorizing.
describe('two decisions on one ad set are separately nameable', () => {
  const sameAdset = {
    adset_id: 'as-shared',
    adset_name: 'ALEIRA // $12 PRIMER MES // AGOSTO',
  };

  it('names the budget move and the recommendation differently', () => {
    const rows = buildActionQueue({
      portfolio: null,
      latest_run: null,
      history: [],
      latest_items: [
        {
          ...sameAdset,
          current_budget: 50,
          final_budget: 65,
          change_abs: 15,
          change_pct: 0.3,
          apply_status: null,
        },
      ],
      recommendations: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          ...sameAdset,
          kind: 'creative_refresh',
          trigger: 'F1_creative_fatigue',
          severity: 'medium',
          reason: 'CTR down 42%',
          status: 'pending',
        },
      ],
    });

    expect(rows).toHaveLength(2);
    const labels = rows.map(selectionLabel);
    expect(new Set(labels).size).toBe(2);
    expect(labels).toContain('Select budget move for ALEIRA // $12 PRIMER MES // AGOSTO');
    expect(labels).toContain('Select refresh creative for ALEIRA // $12 PRIMER MES // AGOSTO');
  });

  it('falls back to the ad-set id when the roster carries no name', () => {
    const rows = buildActionQueue({
      portfolio: null,
      latest_run: null,
      history: [],
      latest_items: [
        {
          adset_id: 'as-nameless',
          current_budget: 50,
          final_budget: 65,
          change_abs: 15,
          change_pct: 0.3,
          apply_status: null,
        },
      ],
      recommendations: [],
    });
    expect(selectionLabel(rows[0])).toBe('Select budget move for as-nameless');
  });
});
