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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const navigation = {
  pathname: '/scale',
  params: new URLSearchParams('tab=jaina&optimizerView=portfolios&portfolio=portfolio-1'),
};

const pushedHrefs: string[] = [];

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

mock.module('@/lib/prefetch/paid-media-cache', () => ({
  prefetchPaidMediaDashboard: () => undefined,
}));

mock.module('@/components/paid-media/optimizer/useOptimizerData', () => ({
  useOptimizerAdAccounts: () => ({ isSuccess: false, data: [] }),
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
  JainaChatSurface: ({ onOpenAccountRead }: { onOpenAccountRead?: (readId: string) => void }) => (
    <button
      type="button"
      data-testid="cited-chip"
      onClick={() => onOpenAccountRead?.('read-abc')}
      disabled={!onOpenAccountRead}
    >
      open the read
    </button>
  ),
}));

const PaidMediaClientPage = (await import('./PaidMediaClient')).default;

afterEach(() => {
  cleanup();
  pushedHrefs.length = 0;
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
