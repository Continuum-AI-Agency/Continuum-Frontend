/**
 * The last link of the cited-optimizer chain, and the only one that can make it land anywhere.
 *
 * A cited optimizer figure in a Jaina answer opens the account read. Everything below this file
 * only forwards a callback; this shell is the one place that can honour it, because the account
 * read lives on a DIFFERENT tab — tab selection is React state here, and where to arrive inside
 * the optimizer is URL state the optimizer owns. Wiring one without the other is the same defect
 * one layer along: a control that reacts and shows the reader nothing.
 *
 * So both halves are asserted from one click: the performance tab is on screen, and the URL now
 * names the Overview with any portfolio drill-in cleared.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCampaignStore } from '@/CampaignCanvas/stores/useCampaignStore';
import type { CampaignCanvasPayload } from '@/lib/campaign-canvas/payload';

const navigation = {
  pathname: '/scale',
  params: new URLSearchParams('tab=jaina&optimizerView=portfolios&portfolio=portfolio-1'),
};

const pushedHrefs: string[] = [];
let latestCanvasPayload: CampaignCanvasPayload | null | undefined;

mock.module('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.params,
  useRouter: () => ({
    replace: () => undefined,
    push: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
  }),
}));

mock.module('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'user-1', email: 'someone@example.com' } }),
}));

mock.module('@/components/paid-media/AdAccountSelector', () => ({
  AdAccountSelector: () => <div data-testid="ad-account-selector" />,
}));

mock.module('@/components/paid-media/PaidSetupDiagnostics', () => ({
  PaidSetupDiagnostics: () => <div data-testid="paid-setup-diagnostics" />,
}));

mock.module('@/components/paid-media/jaina/components/SavedDashboardsPanel', () => ({
  SavedDashboardsPanel: () => <div data-testid="saved-dashboards" />,
}));

mock.module('@/components/paid-media/campaigns/usePrefetchScaleCampaigns', () => ({
  usePrefetchScaleCampaigns: () => () => undefined,
}));

mock.module('@/lib/prefetch/paid-media-cache', () => ({
  prefetchPaidMediaDashboard: () => undefined,
}));

mock.module('@/components/paid-media/optimizer/useOptimizerData', () => ({
  useOptimizerAdAccounts: () => ({ isSuccess: false, data: [] }),
  useOptimizerPortfolios: () => ({ isSuccess: false, isError: false, brandPortfolios: [] }),
  usePrefetchOptimizerOverview: () => () => undefined,
}));

mock.module('@/components/paid-media/dashboard/whats-working/WhatsWorkingExplorerPopover', () => ({
  WhatsWorkingExplorerPopover: () => <div data-testid="whats-working" />,
}));

/** Stands in for the whole optimizer surface: its presence is the tab having actually moved. */
mock.module('@/components/paid-media/optimizer/OptimizerTab', () => ({
  OptimizerTab: () => <div data-testid="optimizer-tab" />,
}));

/** Stands in for the transcript: the chip's click, with nothing else of Jaina loaded. */
mock.module('@/components/paid-media/jaina/JainaChatSurface', () => ({
  JainaChatSurface: ({
    onOpenAccountRead,
    campaignCanvasPayload,
  }: {
    onOpenAccountRead?: (readId: string) => void;
    campaignCanvasPayload?: CampaignCanvasPayload | null;
  }) => {
    latestCanvasPayload = campaignCanvasPayload;
    return (
      <button
        type="button"
        data-testid="cited-chip"
        onClick={() => onOpenAccountRead?.('read-abc')}
        disabled={!onOpenAccountRead}
      >
        open the read
      </button>
    );
  },
}));

mock.module('@/CampaignCanvas/components/CampaignCanvas', () => ({
  CampaignCanvas: () => <div data-testid="campaign-canvas" />,
}));

mock.module('@/components/providers/ActiveBrandProvider', () => ({
  useActiveBrandContext: () => ({
    activeBrandId: 'brand-1',
    brandSummaries: [{ id: 'brand-1', name: 'Test Brand' }],
    user: { id: 'user-1' },
  }),
}));
mock.module('@/CampaignCanvas/components/ScaffoldRecordBar', () => ({
  ScaffoldRecordBar: () => null,
}));

const PaidMediaClientPage = (await import('./PaidMediaClient')).default;
const CampaignFlowCanvasPage = (await import('@/CampaignCanvas')).default;

afterEach(() => {
  cleanup();
  pushedHrefs.length = 0;
  useCampaignStore.getState().resetForBrandSwitch();
  latestCanvasPayload = undefined;
  navigation.params = new URLSearchParams(
    'tab=jaina&optimizerView=portfolios&portfolio=portfolio-1',
  );
});

const page = (): ReactNode => (
  <PaidMediaClientPage brandProfileId="brand-1" brandName="Test Brand" initialAdAccountId="act-1" />
);

describe('a cited optimizer figure opens the account read from the Jaina tab', () => {
  it('moves to the performance tab and points the URL at the Overview', async () => {
    const realPushState = window.history.pushState.bind(window.history);
    window.history.pushState = ((_state: unknown, _title: string, href?: string) => {
      if (typeof href === 'string') pushedHrefs.push(href);
    }) as typeof window.history.pushState;

    try {
      render(page());

      const chip = await screen.findByTestId('cited-chip');
      // The handler has to exist before the click means anything: a disabled stand-in is this
      // test's version of the chip that was a button and did nothing.
      expect((chip as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(chip);

      await waitFor(() => expect(screen.getByTestId('optimizer-tab')).toBeTruthy());
      expect(pushedHrefs).toEqual(['/scale?tab=performance&optimizerView=overview']);
    } finally {
      window.history.pushState = realPushState;
    }
  });
});

describe('side Canvas edits reach the associated Jaina chat', () => {
  it('passes current labels and copy after edits, and omits the graph when closed', async () => {
    useCampaignStore.getState().resetForBrandSwitch();
    const campaignId = useCampaignStore
      .getState()
      .addNode('campaign', { label: 'Original campaign' });
    const adId = useCampaignStore
      .getState()
      .addNode('ad', { label: 'Original ad', primaryText: 'Original copy' });
    render(page());
    await screen.findByTestId('cited-chip');
    expect(latestCanvasPayload).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Canvas', exact: true }));
    await waitFor(() => expect(JSON.stringify(latestCanvasPayload)).toContain('Original campaign'));
    act(() => {
      useCampaignStore.getState().updateNodeData(campaignId, { label: 'Edited campaign' });
      useCampaignStore.getState().updateNodeData(adId, { primaryText: 'Edited copy' });
    });
    await waitFor(() => {
      const graph = JSON.stringify(latestCanvasPayload);
      expect(graph).toContain('Edited campaign');
      expect(graph).toContain('Edited copy');
      expect(graph).not.toContain('Original campaign');
      expect(graph).not.toContain('Original copy');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide canvas', exact: true }));
    await waitFor(() => expect(latestCanvasPayload).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Canvas', exact: true }));
    await waitFor(() => expect(JSON.stringify(latestCanvasPayload)).toContain('Edited copy'));
  });
});

describe('full Canvas edits reach its floating Jaina chat', () => {
  it('rebuilds the payload from current store data', async () => {
    useCampaignStore.getState().resetForBrandSwitch();
    const campaignId = useCampaignStore
      .getState()
      .addNode('campaign', { label: 'Original full-page campaign' });
    render(<CampaignFlowCanvasPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Jaina', exact: true }));
    await screen.findByTestId('cited-chip');
    expect(JSON.stringify(latestCanvasPayload)).toContain('Original full-page campaign');
    act(() =>
      useCampaignStore
        .getState()
        .updateNodeData(campaignId, { label: 'Edited full-page campaign' }),
    );
    await waitFor(() => {
      expect(JSON.stringify(latestCanvasPayload)).toContain('Edited full-page campaign');
      expect(JSON.stringify(latestCanvasPayload)).not.toContain('Original full-page campaign');
    });
  });
});
