import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { CyclePreviewResponse, PortfolioListItem } from '@continuum/contracts';

const noopMutation = () => ({
  mutate: mock(() => {}),
  mutateAsync: mock(async () => {}),
  isPending: false,
});

const enrolledRows = [
  { adset_id: 'as-1', adset_name: 'Set One' },
  { adset_id: 'as-paused', adset_name: 'Paused Set' },
];

/** The portfolio row the performance report carries — the only read that returns cpa_target
 *  and velocity_cap_pct, which is why the panel seeds those two fields from it. */
let performanceData: unknown = null;
/** The read-only /cycle/preview outcome the staged arming flow renders. */
let cyclePreviewOutcome: { status: 'ready'; preview: CyclePreviewResponse } | undefined;
const cyclePreviewMutate = mock(() => {});

mock.module('../useOptimizerData', () => ({
  useOptimizerMutations: () => ({
    update: noopMutation(),
    enroll: noopMutation(),
    unenroll: noopMutation(),
    archive: noopMutation(),
    setPaused: noopMutation(),
  }),
  useOptimizerEnrolledAdsets: () => ({
    data: enrolledRows,
    isLoading: false,
  }),
  useOptimizerAccountEnrollments: () => ({ data: [], isLoading: false, isError: false }),
  useOptimizerPerformance: () => ({ data: performanceData, isLoading: false, isError: false }),
  useCyclePreview: () => ({
    mutate: cyclePreviewMutate,
    data: cyclePreviewOutcome,
    isPending: false,
  }),
  useOptimizerAdsetInventory: () => ({
    data: [
      {
        id: 'as-paused',
        name: 'Paused Set',
        campaignId: 'c-1',
        campaignName: 'Campaign',
        configuredStatus: 'PAUSED',
        effectiveStatus: 'PAUSED',
        lifecycle: 'recoverable',
        currentBudget: 25,
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        adCount: 1,
      },
    ],
    fetchedAt: null,
    partial: false,
    truncated: false,
    refresh: () => {},
    canRefresh: true,
    isRefreshing: false,
    isLoading: false,
    isError: false,
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
  CampaignAdsetPicker: ({
    entities,
    selectedAdsetIds,
    onChange,
  }: {
    entities: { id: string; name: string; providerLifecycle?: string }[];
    selectedAdsetIds: string[];
    onChange: (ids: string[]) => void;
  }) => (
    <div data-testid="picker">
      {entities.map((entity) => (
        <div key={entity.id}>
          {entity.name} {entity.providerLifecycle}
          {entity.id === 'as-paused' ? (
            <button
              type="button"
              onClick={() => onChange(selectedAdsetIds.filter((id) => id !== entity.id))}
            >
              Remove paused set
            </button>
          ) : null}
        </div>
      ))}
    </div>
  ),
}));

const { PortfolioManagePanel, adsetsThatStopMatching } = await import('./PortfolioManagePanel');

beforeEach(() => {
  performanceData = null;
  cyclePreviewOutcome = undefined;
  cyclePreviewMutate.mockClear();
});
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

const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

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
  });

  it('keeps an enrolled paused ad set visible and lets the operator remove it', () => {
    renderPanel();

    expect(screen.getByText(/Paused Set recoverable/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove paused set' }));

    expect(document.body.textContent).toContain('1 to remove');
  });
});

describe('every field shows what the portfolio is running — no keep-current sentinel', () => {
  it('seeds the name and the daily budget from the portfolio', () => {
    renderPanel();
    expect(input(/^Name$/).value).toBe('Prospecting');
    expect(input(/Daily budget/).value).toBe('4200');
  });

  it('shows the autopilot caps an operator is about to arm behind, in typed units', () => {
    renderPanel({
      apply_mode: 'autopilot',
      max_daily_apply_minor: 630_000, // MINOR units → $6,300/day
      max_change_pct_per_cycle: 0.2, // fraction → 20%
    });
    expect(input(/Max autopilot spend\/day/).value).toBe('6300');
    expect(input(/Max change per cycle/).value).toBe('20');
  });

  it('seeds the advanced fields from the performance report, the only read that has them', () => {
    performanceData = {
      portfolio: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Prospecting',
        mode: 'balanced',
        apply_mode: 'recommend',
        status: 'active',
        cpa_target: 42,
        velocity_cap_pct: 0.35,
      },
      latest_run: null,
      latest_items: [],
      recommendations: [],
      history: [],
    };
    renderPanel();
    fireEvent.click(screen.getByText('Advanced'));
    expect(input(/Target CPA/).value).toBe('42');
    expect(input(/Max move per ad set\/cycle/).value).toBe('35');
  });

  it('fills the guardrail inputs from the suggestion chips', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Set up autopilot/ }));

    // Max autopilot spend/day ≈ daily budget × 1.5 = 4200 × 1.5 = 6300.
    fireEvent.click(screen.getByText('Suggest $6,300'));
    expect(input(/Max autopilot spend\/day/).value).toBe('6300');

    // Max change per cycle chip fills 20.
    fireEvent.click(screen.getByText('Suggest 20%'));
    expect(input(/Max change per cycle/).value).toBe('20');
  });
});

describe('the guardrail section renders only when it is relevant', () => {
  it('stays out of the way on a portfolio that is not on autopilot', () => {
    renderPanel();
    expect(screen.queryByText('Autopilot guardrails')).toBeNull();
    expect(screen.getByRole('button', { name: /Set up autopilot/ })).toBeDefined();
  });

  it('is always on screen for a portfolio autopilot is already flying', () => {
    renderPanel({
      apply_mode: 'autopilot',
      max_daily_apply_minor: 630_000,
      max_change_pct_per_cycle: 0.2,
    });
    expect(screen.getByText('Autopilot guardrails')).toBeDefined();
    // Already armed — no staging block, and no second "arm" affordance.
    expect(screen.queryByRole('button', { name: 'Arm autopilot' })).toBeNull();
  });

  it('opens on demand so the caps can be set in the first place', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Set up autopilot/ }));
    expect(screen.getByText('Autopilot guardrails')).toBeDefined();
  });
});

describe('arming autopilot is staged: caps → preview → arm', () => {
  const openStaging = () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Set up autopilot/ }));
  };

  it('cannot preview or arm before both caps are set', () => {
    openStaging();
    expect(
      (screen.getByRole('button', { name: /Preview what autopilot would do/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Arm autopilot' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('runs the real engine preview once both caps are set, and only then offers the arm', () => {
    openStaging();
    fireEvent.change(input(/Max autopilot spend\/day/), { target: { value: '6300' } });
    fireEvent.change(input(/Max change per cycle/), { target: { value: '20' } });

    const preview = screen.getByRole('button', {
      name: /Preview what autopilot would do/,
    }) as HTMLButtonElement;
    expect(preview.disabled).toBe(false);
    // Still not armable — nothing has been previewed yet.
    expect(
      (screen.getByRole('button', { name: 'Arm autopilot' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(preview);
    expect(cyclePreviewMutate).toHaveBeenCalledTimes(1);
    const request = cyclePreviewMutate.mock.calls[0]?.[0] as unknown as {
      objective: string;
      mode: string;
      total: number;
    };
    expect(request.objective).toBe('purchase');
    expect(request.mode).toBe('balanced');
  });

  it('says what autopilot would have written and what it would have held', () => {
    cyclePreviewOutcome = {
      status: 'ready',
      preview: {
        items: [
          {
            adset_id: 'as-1',
            current_budget: 100,
            final_budget: 110,
            change_abs: 10,
            change_pct: 0.1,
          },
          {
            adset_id: 'as-2',
            current_budget: 100,
            final_budget: 40,
            change_abs: -60,
            change_pct: -0.6,
          },
        ],
        recommendations: [],
        confidence: null,
        pacing: null,
      },
    };
    openStaging();
    fireEvent.change(input(/Max autopilot spend\/day/), { target: { value: '6300' } });
    fireEvent.change(input(/Max change per cycle/), { target: { value: '20' } });

    // One move inside the 20% cap is written; the −60% move is held for approval.
    expect(document.body.textContent).toContain('would have written');
    expect(screen.getByRole('button', { name: 'Arm autopilot' })).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Arm autopilot' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('warns when the daily pool is over the ceiling — autopilot would write nothing', () => {
    cyclePreviewOutcome = {
      status: 'ready',
      preview: {
        items: [
          {
            adset_id: 'as-1',
            current_budget: 100,
            final_budget: 110,
            change_abs: 10,
            change_pct: 0.1,
          },
        ],
        recommendations: [],
        confidence: null,
        pacing: null,
      },
    };
    openStaging();
    // A $10/day ceiling under a $4,200/day pool: the service refuses every write.
    fireEvent.change(input(/Max autopilot spend\/day/), { target: { value: '10' } });
    fireEvent.change(input(/Max change per cycle/), { target: { value: '20' } });

    expect(document.body.textContent).toContain('autopilot would write nothing at all');
  });
});
