import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const rpc = mock(async () => ({ data: [], error: null }));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    schema: () => ({ rpc }),
    functions: { invoke: rpc },
  }),
}));

const { optimizerQueryKeys, useOptimizerPortfolios } = await import('./useOptimizerData');

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

describe('optimizer React Query reads', () => {
  it('uses the brand/account key and serves a fresh portfolio read from React Query', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Prospecting',
          objective: 'lead',
          level: 'adset',
          mode: 'balanced',
          apply_mode: 'recommend',
          daily_total: 500,
          period_budget: null,
          status: 'active',
          next_realloc_at: null,
          ad_account_id: 'act_1',
          adset_count: 2,
          pending_recommendations: 0,
        },
      ],
      error: null,
    });
    const { result, rerender } = renderHook(
      () => useOptimizerPortfolios('22222222-2222-4222-8222-222222222222', 'act_1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(optimizerQueryKeys.portfolios('brand', 'act_1')).toEqual([
      'optimizer',
      'portfolios',
      'brand',
      'act_1',
    ]);

    rerender();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps the read disabled until a brand exists', () => {
    const { result } = renderHook(() => useOptimizerPortfolios('', null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
