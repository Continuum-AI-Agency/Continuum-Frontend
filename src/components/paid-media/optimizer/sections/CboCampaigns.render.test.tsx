import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { AdSetSnapshot } from '@continuum/contracts';
import type { CampaignSection } from '../picker/campaignGroups';

// Render the dialog inline (children always mount) so the preview body can be
// asserted without Radix portal/focus plumbing — the established pattern for
// dialog surfaces in this codebase (see organic/primitives/WorkspacePanel.test).
mock.module('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

type ConvertState = {
  data: unknown;
  isPending: boolean;
  isError: boolean;
};

let convertState: ConvertState = { data: null, isPending: false, isError: false };
const mutateSpy = mock((_input: unknown) => {});

// The as-if-converted preview hook — controlled per test. `mutate` records the engine
// inputs the dialog synthesized; `data` drives the rendered preview body.
let cyclePreviewState: { data: unknown; isPending: boolean } = { data: null, isPending: false };
const cycleMutateSpy = mock((_input: unknown) => {});

mock.module('../useOptimizerData', () => ({
  useConvertCbo: () => ({ ...convertState, mutate: mutateSpy }),
  useCyclePreview: () => ({ ...cyclePreviewState, mutate: cycleMutateSpy }),
}));

const { CboCampaigns } = await import('./CboCampaigns');

function section(overrides: Partial<CampaignSection> & { campaignId: string }): CampaignSection {
  return {
    campaignName: 'Summer CBO',
    adsets: [],
    eligibleCount: 0,
    totalCount: 2,
    totalBudget: 0,
    totalSpend14: 100,
    totalEvents14: 0,
    totalAds: 0,
    cpa: null,
    mismatchCount: 0,
    ...overrides,
  };
}

const ZERO = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };

function snap(id: string, campaignId: string, kpiField: string): AdSetSnapshot {
  return {
    id,
    campaignId,
    kpiField,
    status: 'frozen',
    freeze: true,
    freezeReason: 'unsupported_budget',
    currentBudget: 0,
    ageDays: 30,
    windows: {
      d3: { ...ZERO },
      d7: { ...ZERO, spend: 210 },
      d14: { ...ZERO, spend: 420, purchases: 6 },
    },
  } as unknown as AdSetSnapshot;
}

// A ready dryRun convert preview with two per-ad-set budgets, so the "Preview as
// converted" expander is offered.
const OK_CONVERT = {
  ok: true,
  dryRun: true,
  currency: 'USD',
  adset_budgets: [
    { adset_id: 'as1', adset_name: 'Broad', daily_budget: 4200, daily_major: 42 },
    { adset_id: 'as2', adset_name: 'Lookalike', daily_budget: 1500, daily_major: 15 },
  ],
};

beforeEach(() => {
  convertState = { data: null, isPending: false, isError: false };
  cyclePreviewState = { data: null, isPending: false };
  mutateSpy.mockClear();
  cycleMutateSpy.mockClear();
});
afterEach(cleanup);

describe('CboCampaigns', () => {
  it('renders nothing when there are no CBO campaigns', () => {
    const { container } = render(
      <CboCampaigns brandId="b1" accountId="act_1" currency="USD" sections={[]} snapshots={[]} />,
    );
    expect(container.textContent).toBe('');
  });

  it('lists each CBO campaign with its ad-set count and a keyboard-focusable convert button', () => {
    const { getByText, getByRole } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1', campaignName: 'Summer CBO', totalCount: 3 })]}
        snapshots={[]}
      />,
    );
    expect(getByText('Summer CBO')).toBeTruthy();
    expect(getByText('3 ad sets · uses Advantage Campaign Budget (CBO)')).toBeTruthy();
    const convert = getByRole('button', { name: /Convert to ad-set budgets/ });
    expect(convert.tagName).toBe('BUTTON');
  });

  it('previews the per-ad-set budgets (real text) and disables Apply', () => {
    convertState.data = {
      ok: true,
      dryRun: true,
      currency: 'USD',
      adset_budgets: [
        { adset_id: 'as1', adset_name: 'Broad', daily_budget: 4200, daily_major: 42 },
        { adset_id: 'as2', adset_name: 'Lookalike', daily_budget: 1500, daily_major: 15 },
      ],
    };
    const { getByText, getByRole } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[]}
      />,
    );
    expect(getByText('Broad')).toBeTruthy();
    expect(getByText('$42/d')).toBeTruthy();
    expect(getByText('Lookalike')).toBeTruthy();
    expect(getByText('$15/d')).toBeTruthy();
    // The changeover headline: campaign-held budget today vs the sum of new budgets.
    expect(getByText('$57/d')).toBeTruthy();
    const apply = getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it('requests a dryRun preview when the convert button is clicked', () => {
    const { getByRole } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c9' })]}
        snapshots={[]}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Convert to ad-set budgets/ }));
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(mutateSpy).toHaveBeenCalledWith({
      brandId: 'b1',
      accountId: 'act_1',
      campaignId: 'c9',
      dryRun: true,
    });
  });

  it('surfaces a friendly message on a soft failure', () => {
    convertState.data = { ok: false, reason: 'no_token', adset_budgets: [] };
    const { getByText } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[]}
      />,
    );
    expect(getByText('Reconnect Meta to preview the conversion.')).toBeTruthy();
  });

  it('tells the user to ASSIGN (not reconnect) an unassigned account', () => {
    convertState.data = { ok: false, reason: 'not_permitted', adset_budgets: [] };
    const { getByText } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[]}
      />,
    );
    expect(
      getByText(
        "This ad account isn't assigned to this brand. Assign it in Settings → Integrations, then try again.",
      ),
    ).toBeTruthy();
  });

  it('shows a loading state while the preview computes', () => {
    convertState.isPending = true;
    const { getByText } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[]}
      />,
    );
    expect(getByText('Computing per-ad-set budgets…')).toBeTruthy();
  });

  it('offers the "Preview as converted" expander only after the dryRun budgets load', () => {
    const { queryByRole, rerender, getByRole } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[snap('as1', 'c1', 'purchases')]}
      />,
    );
    expect(queryByRole('button', { name: /Preview as converted/ })).toBeNull();

    convertState.data = OK_CONVERT;
    rerender(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[snap('as1', 'c1', 'purchases')]}
      />,
    );
    expect(getByRole('button', { name: /Preview as converted/ })).toBeTruthy();
  });

  it('runs the engine preview over the synthesized post-convert ad sets on open', () => {
    convertState.data = OK_CONVERT;
    const { getByRole } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[snap('as1', 'c1', 'purchases'), snap('as2', 'c1', 'purchases')]}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Preview as converted/ }));
    expect(cycleMutateSpy).toHaveBeenCalledTimes(1);
    const input = cycleMutateSpy.mock.calls[0][0] as {
      brandId: string;
      accountId: string;
      objective: string;
      mode: string;
      total: number;
      snapshots: AdSetSnapshot[];
    };
    expect(input.brandId).toBe('b1');
    expect(input.accountId).toBe('act_1');
    expect(input.mode).toBe('balanced');
    // Dominant declared kpiField (purchases) reverses to the purchase objective.
    expect(input.objective).toBe('purchase');
    // Two budgets → two synthesized snapshots, active + budgeted to their ABO daily_major.
    expect(input.snapshots).toHaveLength(2);
    expect(input.snapshots.every((s) => s.status === 'active' && !s.freeze)).toBe(true);
    expect(input.total).toBeCloseTo(57, 5);
  });

  it('renders the reallocation flow and a recommendation count when the preview is ready', () => {
    convertState.data = OK_CONVERT;
    cyclePreviewState.data = {
      status: 'ready',
      preview: {
        items: [
          {
            adset_id: 'as1',
            current_budget: 42,
            final_budget: 50,
            change_abs: 8,
            change_pct: 0.19,
          },
          {
            adset_id: 'as2',
            current_budget: 15,
            final_budget: 7,
            change_abs: -8,
            change_pct: -0.53,
          },
        ],
        recommendations: [{ kind: 'pause' }, { kind: 'creative_refresh' }],
        confidence: { score: 0.7, band: 'high' },
        pacing: { dailyTotal: 57 },
      },
    };
    const { getByRole, getByText } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[snap('as1', 'c1', 'purchases'), snap('as2', 'c1', 'purchases')]}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Preview as converted/ }));
    expect(getByText('$8 moved across 2 ad sets')).toBeTruthy();
    expect(getByText('2 action recommendations raised on the converted ad sets.')).toBeTruthy();
  });

  it('degrades quietly (no error wall) when the preview service is not deployed', () => {
    convertState.data = OK_CONVERT;
    cyclePreviewState.data = { status: 'unavailable' };
    const { getByRole, getByText } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[snap('as1', 'c1', 'purchases')]}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Preview as converted/ }));
    // Curly apostrophes (&rsquo;) in the copy — match on the apostrophe-free fragment.
    expect(getByText(/the optimizer preview service/)).toBeTruthy();
  });
});

// The worst moment in the whole surface: SignalReadiness diagnoses "nothing
// movable", instructs the user to convert a campaign to ad-set budgets, shows a
// working preview of exactly that — and then refuses. It stayed refused (the real
// write is still unvalidated), but a refusal has to be stated ONCE and has to name
// the move the user can make today.
describe('CboCampaigns — the disabled Apply', () => {
  const renderRow = () =>
    render(
      <CboCampaigns
        accountId="act_1"
        brandId="b1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
        snapshots={[]}
      />,
    );

  it('names the manual path the user can take right now', () => {
    const text = renderRow().container.textContent ?? '';
    expect(text).toContain('Meta Ads Manager');
    expect(text).toContain('optimizer picks them up on its next cycle');
  });

  it('says why Apply is off exactly once', () => {
    const text = renderRow().container.textContent ?? '';
    const mentions = text.match(/validated/gi) ?? [];
    expect(mentions).toHaveLength(1);
  });

  // A `title` on a disabled button is unreliable across browsers and unreachable
  // by keyboard, so the reason is bound with aria-describedby instead.
  it('binds the reason to the button for assistive tech', () => {
    const { getByRole } = renderRow();
    const apply = getByRole('button', { name: 'Apply' }) as HTMLButtonElement;

    expect(apply.disabled).toBe(true);
    const describedBy = apply.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    // getElementById, not querySelector: React's useId emits colons, which are
    // not valid in a CSS selector without escaping.
    const note = document.getElementById(describedBy as string);
    expect(note?.textContent).toContain('Apply is off');
    expect(apply.getAttribute('title')).toBeNull();
  });

  it('leaves the dialog by a neutral Close rather than implying a cancelled action', () => {
    expect(renderRow().getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});
