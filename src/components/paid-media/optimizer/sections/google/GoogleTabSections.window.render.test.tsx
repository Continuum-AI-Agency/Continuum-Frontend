import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { BID_CARD, GOALS, HISTORY, WITH_E1 } from './__fixtures__/googleTab';

// PP-DT-B-utc-complete-days-window: the tab's campaign sections read "the last 14 complete days"
// in UTC while the header read the producer's window, dated in the account's calendar — the same
// page said "Oct 20 – Oct 26" and "Oct 17 – Oct 30". Handed the account's last complete day, the
// sections end there.

const ranges: Array<{ scope: string; range: unknown }> = [];
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
        const scope = String(options.body.scope);
        ranges.push({ scope, range: options.body.range });
        if (scope === 'top_campaigns') return { data: WITH_E1, error: null };
        return {
          data: scope === 'change_history' ? HISTORY : null,
          error: null,
        };
      },
    },
  }),
}));
mock.module('next/navigation', () => ({
  usePathname: () => '/scale',
  useSearchParams: () => new URLSearchParams(),
}));
mock.module('./useGoogleCampaignGoals', () => ({
  useGoogleCampaignGoals: () => ({
    status: 'ready',
    goals: GOALS,
    unknown: null,
  }),
}));
const realData = await import('../../useOptimizerData');
mock.module('../../useOptimizerData', () => ({
  ...realData,
  useOptimizerPlatformCards: () => ({ status: 'ready', cards: [BID_CARD] }),
}));

const { GoogleTabSections } = await import('./GoogleTabSections');

afterEach(() => {
  cleanup();
  ranges.length = 0;
});

describe('the tab’s campaign sections end on the account’s last complete day', () => {
  // A day the UTC clock never lands on today, so the test cannot pass by the calendar's luck:
  // the producer last read the account through Oct 25.
  it('handed Oct 25, the 14 days read Oct 12 – Oct 25 whatever the UTC date', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <GoogleTabSections
          brandId="61b80f51-709a-4408-9f11-04142a286baa"
          currency="MXN"
          customerId="3710693645"
          lastCompleteDay="2026-10-25"
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(ranges.some((r) => r.scope === 'top_campaigns')).toBe(true));
    const campaigns = ranges.find((r) => r.scope === 'top_campaigns');
    expect(campaigns?.range).toMatchObject({
      since: '2026-10-12',
      until: '2026-10-25',
    });
  });
});
