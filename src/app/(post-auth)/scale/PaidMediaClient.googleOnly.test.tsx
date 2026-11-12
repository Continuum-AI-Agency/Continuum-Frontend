import { render } from '@/i18n/__tests__/render';
/**
 * PP-DT-E-scale-google-only-gated (deep test 2026-10-31, lane E): Pink Elephant and Tangassi have a
 * Google Ads account and no Meta ad account. Scale always opened on Meta, found no Meta account to
 * select and put the whole of Performance + — the Google tab, the Google portfolio, the P8
 * findings shipped for Pink on 10-29 — behind "Connect an ad account to unlock Scale". The only way
 * in was the small "Looking for a different platform? Google Ads" switch under the checklist.
 *
 * A brand whose assigned ad accounts are all Google's opens on Google.
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, screen, waitFor } from '@testing-library/react';

const navigation = { params: new URLSearchParams('tab=performance') };
let assignedAccounts: { platform: string; account_id: string; name: string }[] = [];
const optimizerTabProps: { adAccountId: string; platform: string }[] = [];

mock.module('next/navigation', () => ({
  usePathname: () => '/scale',
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
  useOptimizerAdAccounts: () => ({
    isSuccess: true,
    isPending: false,
    data: assignedAccounts,
  }),
  useOptimizerPortfolios: () => ({
    isSuccess: true,
    isError: false,
    brandPortfolios: assignedAccounts.map((account) => ({
      ad_account_id: account.account_id,
      status: 'active',
      daily_total: 100,
    })),
  }),
  usePrefetchOptimizerOverview: () => () => undefined,
}));
mock.module('@/components/paid-media/dashboard/whats-working/WhatsWorkingExplorerPopover', () => ({
  WhatsWorkingExplorerPopover: () => <div data-testid="whats-working" />,
}));
mock.module('@/components/paid-media/optimizer/OptimizerTab', () => ({
  OptimizerTab: (props: { adAccountId: string; platform: string }) => {
    optimizerTabProps.push({
      adAccountId: props.adAccountId,
      platform: props.platform,
    });
    return <div data-testid="optimizer-tab" />;
  },
}));
mock.module('@/components/paid-media/jaina/JainaChatSurface', () => ({
  JainaChatSurface: () => <div data-testid="jaina-chat" />,
}));
mock.module('@/CampaignCanvas/components/CampaignCanvas', () => ({
  CampaignCanvas: () => <div data-testid="campaign-canvas" />,
}));
mock.module('@/components/providers/ActiveBrandProvider', () => ({
  useActiveBrandContext: () => ({
    activeBrandId: 'brand-pink',
    brandSummaries: [{ id: 'brand-pink', name: 'Pink Elephant' }],
    user: { id: 'user-1' },
  }),
}));
mock.module('@/CampaignCanvas/components/ScaffoldRecordBar', () => ({
  ScaffoldRecordBar: () => null,
}));

const PaidMediaClientPage = (await import('./PaidMediaClient')).default;

afterEach(() => {
  cleanup();
  optimizerTabProps.length = 0;
});

describe('Scale on a brand whose ad accounts are all Google', () => {
  it('opens Performance + on the Google account instead of the connect gate', async () => {
    assignedAccounts = [
      {
        platform: 'google_ads',
        account_id: '6619636193',
        name: 'Pink Elephant',
      },
    ];
    render(
      <PaidMediaClientPage
        brandProfileId="brand-pink"
        brandName="Pink Elephant"
        initialAdAccountId={null}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('optimizer-tab')).toBeTruthy());
    expect(screen.queryByTestId('paid-setup-diagnostics')).toBeNull();
    expect(optimizerTabProps.at(-1)).toEqual({
      adAccountId: '6619636193',
      platform: 'google-ads',
    });
  });

  it('still opens on Meta when the brand has a Meta ad account as well', async () => {
    assignedAccounts = [
      {
        platform: 'google_ads',
        account_id: '5251780631',
        name: 'Easy Fit Google',
      },
      {
        platform: 'meta_ads',
        account_id: 'act_521903353286118',
        name: 'Easy Fit',
      },
    ];
    render(
      <PaidMediaClientPage
        brandProfileId="brand-pink"
        brandName="Easy Fit"
        initialAdAccountId={null}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('optimizer-tab')).toBeTruthy());
    expect(optimizerTabProps.at(-1)?.platform).toBe('meta');
  });
});
