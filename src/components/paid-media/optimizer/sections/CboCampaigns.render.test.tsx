import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

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

mock.module('../useOptimizerData', () => ({
  useConvertCbo: () => ({ ...convertState, mutate: mutateSpy }),
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
    ...overrides,
  };
}

beforeEach(() => {
  convertState = { data: null, isPending: false, isError: false };
  mutateSpy.mockClear();
});
afterEach(cleanup);

describe('CboCampaigns', () => {
  it('renders nothing when there are no CBO campaigns', () => {
    const { container } = render(
      <CboCampaigns brandId="b1" accountId="act_1" currency="USD" sections={[]} />,
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
      />,
    );
    expect(getByText('Broad')).toBeTruthy();
    expect(getByText('$42/d')).toBeTruthy();
    expect(getByText('Lookalike')).toBeTruthy();
    expect(getByText('$15/d')).toBeTruthy();
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
      />,
    );
    expect(getByText('Reconnect Meta to preview the conversion.')).toBeTruthy();
  });

  it('shows a loading state while the preview computes', () => {
    convertState.isPending = true;
    const { getByText } = render(
      <CboCampaigns
        brandId="b1"
        accountId="act_1"
        currency="USD"
        sections={[section({ campaignId: 'c1' })]}
      />,
    );
    expect(getByText('Computing per-ad-set budgets…')).toBeTruthy();
  });
});
