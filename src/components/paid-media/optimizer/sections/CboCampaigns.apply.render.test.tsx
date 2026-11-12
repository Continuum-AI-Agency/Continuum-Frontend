// Decision 3 (Ramiro, 2026-11-01): the real CBO→ABO convert is enabled, and it always stays
// behind its approval card. The convert dialog IS that card: it previews the per-ad-set budgets
// (dryRun), and only Apply, clicked inside it while a preview with budgets is on screen, asks for
// the real convert. Apply carries exactly the previewed budgets, so the edge writes what the
// person approved or nothing at all (preview_changed).
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { render } from '@/i18n/__tests__/render';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { CampaignSection } from '../picker/campaignGroups';

// Render the dialog inline (children always mount) so the card can be asserted without the
// portal/focus plumbing — the same stand-in CboCampaigns.render.test.tsx uses.
mock.module('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

/** The convert mutation as the row reads it. `variables` is the last request sent: a real
 *  convert (dryRun:false) or a preview. */
type ConvertState = {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  variables?: unknown;
};

const IDLE: ConvertState = { data: null, isPending: false, isError: false };
let convertState: ConvertState = IDLE;
const mutateSpy = mock((_input: unknown) => {});

// Spread the real module: `mock.module` replaces it for the whole process.
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useConvertCbo: () => ({ ...convertState, mutate: mutateSpy }),
  useCyclePreview: () => ({ data: null, isPending: false, mutate: () => {} }),
}));

const { CboCampaigns } = await import('./CboCampaigns');

function section(): CampaignSection {
  return {
    campaignId: 'c1',
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
  };
}

const SHOWN = [
  { adset_id: 'as1', adset_name: 'Broad', daily_budget: 4200, daily_major: 42 },
  {
    adset_id: 'as2',
    adset_name: 'Lookalike',
    daily_budget: 1500,
    daily_major: 15,
  },
];

/** A dryRun preview with two per-ad-set budgets on screen. */
const PREVIEW = {
  ok: true,
  dryRun: true,
  campaignId: 'c1',
  currency: 'USD',
  adset_budgets: SHOWN,
};

/** What Apply must send back for PREVIEW: the previewed budgets, MINOR units, nothing else. */
const APPROVED = [
  { adset_id: 'as1', daily_budget: 4200 },
  { adset_id: 'as2', daily_budget: 1500 },
];

const REAL_CONVERT = {
  brandId: 'b1',
  accountId: 'act_1',
  campaignId: 'c1',
  dryRun: false,
  expectedAdsetBudgets: APPROVED,
};

const CONVERTED = {
  ok: true,
  dryRun: false,
  campaignId: 'c1',
  currency: 'USD',
  converted: 2,
  adset_budgets: SHOWN,
  verified: true,
  read_back: {
    verdict: 'verified',
    campaign: { daily_budget: null, lifetime_budget: null },
    adsets: [
      { adset_id: 'as1', expected: 4200, observed: 4200 },
      { adset_id: 'as2', expected: 1500, observed: 1500 },
    ],
    problems: [],
  },
};

const renderRow = () =>
  render(
    <CboCampaigns
      accountId="act_1"
      brandId="b1"
      currency="USD"
      sections={[section()]}
      snapshots={[]}
    />,
  );

const applyOf = (view: ReturnType<typeof renderRow>) =>
  view.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;

beforeEach(() => {
  convertState = { ...IDLE };
  mutateSpy.mockClear();
});
afterEach(cleanup);

describe('CboCampaigns — Apply is the approval', () => {
  it('stays off before any preview is on screen', () => {
    expect(applyOf(renderRow()).disabled).toBe(true);
  });

  it('stays off while the preview computes', () => {
    convertState = {
      ...IDLE,
      isPending: true,
      variables: { ...REAL_CONVERT, dryRun: true },
    };
    expect(applyOf(renderRow()).disabled).toBe(true);
  });

  it('stays off, and asks for nothing, when the preview failed or found nothing to convert', () => {
    const failed: ConvertState[] = [
      { ...IDLE, isError: true },
      { ...IDLE, data: { ok: false, reason: 'no_token', adset_budgets: [] } },
      { ...IDLE, data: { ...PREVIEW, adset_budgets: [] } },
    ];
    for (const state of failed) {
      convertState = state;
      const apply = applyOf(renderRow());
      expect(apply.disabled).toBe(true);
      fireEvent.click(apply);
      cleanup();
    }
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it('turns on once a preview with budgets is on screen', () => {
    convertState = { ...IDLE, data: PREVIEW };
    expect(applyOf(renderRow()).disabled).toBe(false);
  });

  it('asks for the real convert once, carrying exactly the previewed budgets', () => {
    convertState = { ...IDLE, data: PREVIEW };
    fireEvent.click(applyOf(renderRow()));
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(mutateSpy).toHaveBeenCalledWith(REAL_CONVERT);
  });

  it('binds what Apply writes to the button for assistive tech', () => {
    convertState = { ...IDLE, data: PREVIEW };
    const apply = applyOf(renderRow());
    const describedBy = apply.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    // getElementById, not querySelector: React's useId emits colons.
    expect(document.getElementById(describedBy as string)?.textContent).toContain(
      'Apply writes exactly these budgets',
    );
    expect(apply.getAttribute('title')).toBeNull();
  });

  it('stays off while the real convert is in flight, and says what it is doing', () => {
    convertState = { ...IDLE, isPending: true, variables: REAL_CONVERT };
    const view = renderRow();
    expect(applyOf(view).disabled).toBe(true);
    expect(view.getByText('Converting the campaign on Meta…')).toBeTruthy();
  });
});

describe('CboCampaigns — what Apply did', () => {
  it('a converted campaign says what changed on Meta and when the optimizer takes over', () => {
    convertState = { ...IDLE, data: CONVERTED, variables: REAL_CONVERT };
    const view = renderRow();
    const text = view.container.textContent ?? '';
    expect(text).toContain('The campaign budget was removed');
    expect(text).toContain('each ad set now holds its own daily budget');
    expect(text).toContain('The optimizer picks them up on its next cycle');
    expect(view.getByText('$42.00 USD/d')).toBeTruthy();
    expect(view.getByText('$15.00 USD/d')).toBeTruthy();
    expect(text).toContain('Read back from Meta');
    expect(text).not.toContain('Check it in Meta Ads Manager');
    // Nothing is left to approve: the card offers no second Apply.
    expect(view.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('a convert the read-back did not verify says so', () => {
    for (const verdict of ['mismatch', 'unreadable']) {
      convertState = {
        ...IDLE,
        data: {
          ...CONVERTED,
          verified: false,
          read_back: { ...CONVERTED.read_back, verdict },
        },
        variables: REAL_CONVERT,
      };
      const text = renderRow().container.textContent ?? '';
      expect(text).toContain('Meta accepted the change');
      expect(text).toContain('Check it in Meta Ads Manager');
      expect(text).not.toContain('Read back from Meta');
      cleanup();
    }
  });

  it('a campaign already converted today says nothing was written again', () => {
    // The ledger's deduped answer carries no dryRun flag: it must not read as a fresh preview.
    convertState = {
      ...IDLE,
      data: {
        ok: true,
        deduped: true,
        campaignId: 'c1',
        currency: 'USD',
        adset_budgets: SHOWN,
      },
      variables: REAL_CONVERT,
    };
    const view = renderRow();
    const text = view.container.textContent ?? '';
    expect(text).toContain('already converted today');
    expect(text).toContain('nothing was written again');
    expect(view.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('budgets that changed since the preview: nothing written, the new budgets shown, Apply approves them afresh', () => {
    const moved = [{ ...SHOWN[0], daily_budget: 4500, daily_major: 45 }, SHOWN[1]];
    convertState = {
      ...IDLE,
      data: {
        ok: false,
        reason: 'preview_changed',
        campaignId: 'c1',
        currency: 'USD',
        adset_budgets: moved,
      },
      variables: REAL_CONVERT,
    };
    const view = renderRow();
    const text = view.container.textContent ?? '';
    expect(text).toContain('The budgets changed since this preview');
    expect(text).toContain('nothing was written');
    expect(view.getByText('$45.00 USD/d')).toBeTruthy();

    const apply = applyOf(view);
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(mutateSpy).toHaveBeenCalledWith({
      ...REAL_CONVERT,
      expectedAdsetBudgets: [
        { adset_id: 'as1', daily_budget: 4500 },
        { adset_id: 'as2', daily_budget: 1500 },
      ],
    });
  });

  it('a real convert that did not come back says to check Meta before trying again', () => {
    convertState = {
      ...IDLE,
      data: undefined,
      isError: true,
      variables: REAL_CONVERT,
    };
    const view = renderRow();
    const text = view.container.textContent ?? '';
    expect(text).toContain('confirm the conversion');
    expect(text).toContain('Check the campaign in Meta Ads Manager before trying again');
    expect(applyOf(view).disabled).toBe(true);
  });
});
