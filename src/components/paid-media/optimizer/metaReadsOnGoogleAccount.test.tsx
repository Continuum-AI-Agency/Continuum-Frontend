import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// PP-DT-E-optimizer-meta-reads-on-google-account (deep test 2026-10-31, lane E). Scale selects a
// Google customer on its Google platform, and every Optimizer view under it posted that id to
// paid-media-metrics as a META ad account (ad-set snapshots, campaign snapshots, the ad-set
// inventory): two or three 404s on every Pink Elephant and Tangassi page. The brand's account
// list names each account's platform; an account it names on another platform is never posted to
// the Meta reader, and a Meta account (or one the list does not name) is read as before.

const GOOGLE = '6619636193';
const META = 'act_1779847382038564';
const UNLISTED = 'act_999';
const BRAND = '8e5b7185-e43f-4150-b763-b86c4f5297a0';

const ACCOUNTS = [
  {
    platform: 'google_ads',
    account_id: GOOGLE,
    name: 'Pink Elephant',
    status: null,
    currency: 'MXN',
  },
  { platform: 'meta_ads', account_id: META, name: 'VIVO47 MKT', status: null, currency: 'MXN' },
];

const invoke = mock(async (_name: string, _options: { body: Record<string, unknown> }) => ({
  data: { snapshots: [], adsets: [], fetchedAt: null },
  error: null,
}));
// The Google portfolio's own metrics read answers as a server that does not have the RPC yet
// (PGRST202): settled at once, so the row's pending state is the Meta read's alone.
const rpc = mock(async (name: string) =>
  name === 'optimizer_get_portfolio_metrics'
    ? { data: null, error: { code: 'PGRST202', message: 'not in the schema cache' } }
    : { data: name === 'list_brand_ad_accounts' ? ACCOUNTS : [], error: null },
);

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    schema: () => ({ rpc }),
    functions: { invoke },
  }),
}));

const { useOptimizerAccountSnapshots, useOptimizerAdsetInventory } = await import(
  './useOptimizerData'
);
const { usePortfolioFigures } = await import('./sections/usePortfolioFigures');

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

/** Every account the Meta reader was asked for, by scope. */
function metaReads(): { scope: unknown; accountId: unknown }[] {
  return invoke.mock.calls
    .filter(([name]) => name === 'paid-media-metrics')
    .map(([, options]) => ({ scope: options.body.scope, accountId: options.body.accountId }));
}

/** Every mocked read has answered and every read it unlocks has had its turn. */
async function quiet(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
}

afterEach(() => {
  cleanup();
  invoke.mockClear();
  rpc.mockClear();
});

const googlePortfolio = {
  id: 'e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed',
  name: 'Evento Webinar 29 Octubre',
  objective: 'lead',
  level: 'campaign',
  mode: 'balanced',
  apply_mode: 'recommend',
  daily_total: 300,
  period_budget: null,
  status: 'active',
  next_realloc_at: null,
  ad_account_id: GOOGLE,
  adset_count: 2,
  pending_recommendations: 0,
  platforms: ['google_ads'],
  platform_writes: { google_ads: false },
} as never;

describe('Meta-only reads on a Google account', () => {
  it('never posts a Google customer to the Meta snapshot reader', async () => {
    const { result } = renderHook(() => useOptimizerAccountSnapshots(BRAND, GOOGLE, 'campaign'), {
      wrapper: createWrapper(),
    });
    await quiet();
    expect(metaReads()).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it('never posts a Google customer to the Meta ad-set inventory', async () => {
    renderHook(() => useOptimizerAdsetInventory(BRAND, GOOGLE, true), {
      wrapper: createWrapper(),
    });
    await quiet();
    expect(metaReads()).toEqual([]);
  });

  it('prices a Google portfolio row with no Meta read, and stops reading once its own reads land', async () => {
    const { result } = renderHook(
      () =>
        usePortfolioFigures({
          brandId: BRAND,
          adAccountId: GOOGLE,
          portfolios: [googlePortfolio],
          series: [[]],
        }),
      { wrapper: createWrapper() },
    );
    await quiet();
    expect(metaReads()).toEqual([]);
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it('still reads a Meta account, and an account the list does not name, from the Meta reader', async () => {
    renderHook(() => useOptimizerAccountSnapshots(BRAND, META), { wrapper: createWrapper() });
    renderHook(() => useOptimizerAdsetInventory(BRAND, UNLISTED, true), {
      wrapper: createWrapper(),
    });
    await waitFor(() =>
      expect(metaReads()).toEqual(
        expect.arrayContaining([
          { scope: 'adset_snapshots', accountId: META },
          { scope: 'adset_inventory', accountId: UNLISTED },
        ]),
      ),
    );
    expect(
      invoke.mock.calls
        .filter(([name]) => name === 'paid-media-metrics')
        .every(([, options]) => options.body.platform === 'meta'),
    ).toBe(true);
  });
});
