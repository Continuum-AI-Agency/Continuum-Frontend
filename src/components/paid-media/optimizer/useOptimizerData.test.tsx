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

const { optimizerQueryKeys, useOptimizerMutations, useOptimizerPortfolios } = await import(
  './useOptimizerData'
);

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

const BRAND = '22222222-2222-4222-8222-222222222222';

function portfolioRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('optimizer React Query reads', () => {
  it('uses the brand/account key and serves a fresh portfolio read from React Query', async () => {
    rpc.mockResolvedValueOnce({ data: [portfolioRow()], error: null });
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

  it('matches a portfolio stored act_123 against a selection of 123', async () => {
    rpc.mockResolvedValueOnce({
      data: [portfolioRow({ ad_account_id: 'act_123' })],
      error: null,
    });
    const { result } = renderHook(() => useOptimizerPortfolios(BRAND, '123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.otherAccountIds).toEqual([]);
  });

  it('matches a portfolio stored 123 against a selection of act_123', async () => {
    rpc.mockResolvedValueOnce({
      data: [portfolioRow({ ad_account_id: '123' })],
      error: null,
    });
    const { result } = renderHook(() => useOptimizerPortfolios(BRAND, 'act_123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it('reports the brand total and the owning accounts when the filter empties the list', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        portfolioRow({ ad_account_id: 'act_999' }),
        portfolioRow({ id: '33333333-3333-4333-8333-333333333333', ad_account_id: 'act_999' }),
      ],
      error: null,
    });
    const { result } = renderHook(() => useOptimizerPortfolios(BRAND, 'act_1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.brandPortfolioCount).toBe(2);
    expect(result.current.otherAccountIds).toEqual(['act_999']);
  });

  it('reports a genuinely empty brand with no other accounts to point at', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { result } = renderHook(() => useOptimizerPortfolios(BRAND, 'act_1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.brandPortfolioCount).toBe(0);
    expect(result.current.otherAccountIds).toEqual([]);
  });

  it('keeps the valid portfolios when one row drifts instead of collapsing the list', async () => {
    rpc.mockResolvedValueOnce({
      data: [portfolioRow(), { id: 'not-a-uuid' }],
      error: null,
    });
    const { result } = renderHook(() => useOptimizerPortfolios(BRAND, 'act_1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.droppedRowCount).toBe(1);
  });

  it('surfaces a wholly undecodable list as an error, never as an empty account', async () => {
    // The read retries once, so both attempts see the drifted body.
    rpc.mockResolvedValueOnce({ data: [{ id: 'not-a-uuid' }], error: null });
    rpc.mockResolvedValueOnce({ data: [{ id: 'not-a-uuid' }], error: null });
    const { result } = renderHook(() => useOptimizerPortfolios(BRAND, 'act_1'), {
      wrapper: createWrapper(),
    });

    // The read retries with a ~1s backoff, so the error state lands after the default wait.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 });
    expect(result.current.data).toEqual([]);
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

// The bug these exist to fence:
//
// RunCycleResponseSchema declared recommendations/applied/failed as ARRAYS and runId as a
// required uuid. The optimizer service has always sent COUNTS and a nullable runId. safeParse
// could therefore NEVER succeed — runCycle returned null on every healthy cycle, and the panel
// read that null as "Optimizer service not live yet". The cycle had run, scored the ad sets,
// and persisted the whole time.
//
// `ran` below is the VERBATIM body the service sends. Against the old schema it fails to parse.
describe('runCycle outcomes', () => {
  const RAN = {
    portfolioId: '11111111-1111-4111-8111-111111111111',
    runId: '22222222-2222-4222-8222-222222222222',
    snapshotCount: 3,
    recommendations: 1,
    applied: 0,
    failed: 0,
    deduped: 0,
    stubbed: 0,
    held: 0,
  };
  const skip = (reason: 'no_adsets' | 'no_snapshots') => ({
    ...RAN,
    runId: null,
    snapshotCount: 0,
    recommendations: 0,
    skipped: reason,
  });

  async function runOnce() {
    const { result } = renderHook(() => useOptimizerMutations('brand', 'act_1'), {
      wrapper: createWrapper(),
    });
    result.current.run.mutate('11111111-1111-4111-8111-111111111111');
    await waitFor(() => expect(result.current.run.isSuccess).toBe(true));
    return result.current.run.data;
  }

  it('reports a persisted cycle as ran — the exact body the old schema rejected', async () => {
    rpc.mockResolvedValueOnce({ data: RAN, error: null } as never);
    expect(await runOnce()).toEqual({ status: 'ran', run: expect.objectContaining(RAN) });
  });

  it('reports an empty portfolio as SKIPPED, not as an offline service', async () => {
    rpc.mockResolvedValueOnce({ data: skip('no_adsets'), error: null } as never);
    const outcome = await runOnce();
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'no_adsets' });
  });

  it('reports a cycle with no live Meta data as SKIPPED', async () => {
    rpc.mockResolvedValueOnce({ data: skip('no_snapshots'), error: null } as never);
    expect(await runOnce()).toMatchObject({ status: 'skipped', reason: 'no_snapshots' });
  });

  it('maps a 501 to not_configured (OPTIMIZER_SERVICE_URL unset on the edge)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { context: { status: 501 } } } as never);
    expect(await runOnce()).toEqual({ status: 'unavailable', kind: 'not_configured' });
  });

  it('maps a 403 to forbidden — a refusal, never an outage', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { context: { status: 403 } } } as never);
    expect(await runOnce()).toEqual({ status: 'unavailable', kind: 'forbidden' });
  });

  it('flags contract drift as malformed rather than silently returning null', async () => {
    // recommendations as an ARRAY: precisely the shape the old schema demanded.
    rpc.mockResolvedValueOnce({ data: { ...RAN, recommendations: [{}] }, error: null } as never);
    expect(await runOnce()).toEqual({ status: 'unavailable', kind: 'malformed' });
  });

  it('treats runId:null with no skip reason as malformed, not as success', async () => {
    rpc.mockResolvedValueOnce({ data: { ...RAN, runId: null }, error: null } as never);
    expect(await runOnce()).toEqual({ status: 'unavailable', kind: 'malformed' });
  });
});
