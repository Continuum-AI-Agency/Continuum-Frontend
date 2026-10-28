import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { BID_CARD, EKATAR, GOALS, HISTORY, WITH_E1 } from './__fixtures__/googleTab';

// The edge is the boundary: each scope answers its fixture. The portfolios' goals and the cards
// are their own reads, tested where they live.
const asked: string[] = [];
let failCampaigns = false;
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
        const scope = String(options.body.scope);
        asked.push(scope);
        if (scope === 'top_campaigns') {
          return failCampaigns
            ? { data: null, error: new Error('502') }
            : { data: WITH_E1, error: null };
        }
        return { data: scope === 'change_history' ? HISTORY : null, error: null };
      },
    },
  }),
}));
let params = new URLSearchParams();
mock.module('next/navigation', () => ({
  usePathname: () => '/scale',
  useSearchParams: () => params,
}));
mock.module('./useGoogleCampaignGoals', () => ({
  useGoogleCampaignGoals: () => ({ status: 'ready', goals: GOALS, unknown: null }),
}));
const realData = await import('../../useOptimizerData');
mock.module('../../useOptimizerData', () => ({
  ...realData,
  useOptimizerPlatformCards: () => ({ status: 'ready', cards: [BID_CARD] }),
}));

const { GoogleTabSections } = await import('./GoogleTabSections');

afterEach(() => {
  cleanup();
  asked.length = 0;
  failCampaigns = false;
  params = new URLSearchParams();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoogleTabSections
        brandId="61b80f51-709a-4408-9f11-04142a286baa"
        currency="MXN"
        customerId="3710693645"
      />
    </QueryClientProvider>,
  );
}

describe('GoogleTabSections', () => {
  it('holds the three sections closed while reading, then fills them on one window', async () => {
    const view = mount();
    expect(view.getAllByTestId('google-section-loading')).toHaveLength(3);
    await waitFor(() => expect(view.getByTestId('google-tab-sections')).toBeTruthy());
    expect(view.getByTestId('google-sections-window').textContent).toContain('14 complete days');
    for (const id of ['google-account-by-type', 'google-campaign-explorer', 'google-bidding']) {
      expect(view.getByTestId(id)).toBeTruthy();
    }
    expect(view.getByTestId('google-bidding-proposal')).toBeTruthy();
    expect(asked).toContain('top_campaigns');
    expect(asked).toContain('change_history');
  });

  it('opens the campaign the URL names in its sheet', async () => {
    params = new URLSearchParams(`googleCampaign=${EKATAR}`);
    mount();
    await waitFor(() => expect(screen.getByTestId('google-campaign-detail')).toBeTruthy());
    expect(
      screen.getByText('VIVO 47-EKATAR', { selector: '[data-slot="sheet-title"]' }),
    ).toBeTruthy();
  });

  it('says the campaign read failed, never an empty account', async () => {
    failCampaigns = true;
    const view = mount();
    // The read retries once, a second later, before it calls the read failed.
    await waitFor(() => expect(view.getByTestId('google-sections-error')).toBeTruthy(), {
      timeout: 4000,
    });
    expect(view.queryByTestId('google-tab-sections')).toBeNull();
  });
});
