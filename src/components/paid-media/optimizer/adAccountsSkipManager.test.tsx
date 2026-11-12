import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderHook } from '@/i18n/__tests__/render';

// PP-DT-E-home-setup-mode-mcc-mismatch, the Scale half (deep test 2026-10-31, lane E, low). The
// Sound Vault's only assignment is a Google Ads manager (MCC "Cont Sandbox", 4990471415): it runs
// no campaigns and holds none. list_brand_ad_accounts returns it with status "manager", and Scale
// and the Optimizer read that list as the brand's ad accounts: Scale opened Performance + on it and
// the portfolio wizard offered it ("Cont Sandbox · Google ads · Manager", "No active ad sets found").
// A Google Ads manager is never one of the brand's ad accounts — the Home's rule too.

const MCC = {
  platform: 'google_ads',
  account_id: '4990471415',
  name: 'Cont Sandbox',
  status: 'manager',
  currency: null,
};
const CLIENT = {
  platform: 'google_ads',
  account_id: '5251780631',
  name: 'Easy Fit',
  status: null,
  currency: 'MXN',
};
const META = {
  platform: 'meta_ads',
  account_id: 'act_521903353286118',
  name: 'Easyfit',
  status: '1',
  currency: 'MXN',
};

let rows: unknown[] = [];
const rpc = mock(async (name: string) => ({
  data: name === 'list_brand_ad_accounts' ? rows : [],
  error: null,
}));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    schema: () => ({ rpc }),
    functions: { invoke: rpc },
  }),
}));

const { useOptimizerAdAccounts } = await import('./useOptimizerData');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

describe("the brand's ad accounts", () => {
  it('never include a Google Ads manager', async () => {
    rows = [MCC, CLIENT, META];
    const { result } = renderHook(() => useOptimizerAdAccounts('brand-1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.map((account) => account.account_id)).toEqual([
      CLIENT.account_id,
      META.account_id,
    ]);
  });

  it('are none for a brand whose only assignment is a manager', async () => {
    rows = [MCC];
    const { result } = renderHook(() => useOptimizerAdAccounts('brand-2'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
