import { afterEach, describe, expect, it, jest, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const rpc = mock(async () => ({ data: [], error: null }));

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    schema: () => ({ rpc }),
    functions: { invoke: rpc },
  }),
}));

const {
  optimizerQueryKeys,
  useOptimizerMutations,
  useOptimizerPortfolios,
  useRevertOptimizerAction,
} = await import('./useOptimizerData');

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
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

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
  it('keys the portfolio read by brand alone and serves a fresh read from React Query', async () => {
    rpc.mockResolvedValueOnce({ data: [portfolioRow()], error: null });
    const { result, rerender } = renderHook(
      () => useOptimizerPortfolios('22222222-2222-4222-8222-222222222222', 'act_1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(optimizerQueryKeys.portfolios('brand')).toEqual(['optimizer', 'portfolios', 'brand']);

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

  it('answers the page shell and the tab from ONE read of the brand-scoped RPC', async () => {
    rpc.mockResolvedValueOnce({
      data: [portfolioRow(), portfolioRow({ id: OTHER_ID, ad_account_id: 'act_2' })],
      error: null,
    });
    const wrapper = createWrapper();
    const { result } = renderHook(
      () => ({
        shell: useOptimizerPortfolios(BRAND, null),
        tab: useOptimizerPortfolios(BRAND, 'act_1'),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.tab.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.current.shell.data).toHaveLength(2);
    expect(result.current.tab.data.map((row) => row.id)).toEqual([portfolioRow().id]);
    expect(result.current.tab.otherAccountIds).toEqual(['act_2']);
  });

  it('re-scopes an account switch from the read in hand, with no second request', async () => {
    rpc.mockResolvedValueOnce({
      data: [portfolioRow(), portfolioRow({ id: OTHER_ID, ad_account_id: 'act_2' })],
      error: null,
    });
    const { result, rerender } = renderHook(
      ({ account }: { account: string }) => useOptimizerPortfolios(BRAND, account),
      { wrapper: createWrapper(), initialProps: { account: 'act_1' } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ account: 'act_2' });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data.map((row) => row.id)).toEqual([OTHER_ID]);
    expect(result.current.otherAccountIds).toEqual(['act_1']);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps the last answer when a background refetch fails', async () => {
    rpc.mockResolvedValueOnce({ data: [portfolioRow()], error: null });
    const { result } = renderHook(() => useOptimizerPortfolios(BRAND, 'act_1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await result.current.refetch();

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 });
    expect(result.current.hasAnswer).toBe(true);
    expect(result.current.data).toHaveLength(1);
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

/** The optimizer surface's critical path on a fake clock. The RPC answers in 200 ms — the
 *  measured production latency of optimizer_list_portfolios for Vivo 47 — and the tab mounts
 *  the way it does on the Scale page: after the page shell's brand-wide read has landed. */
describe('portfolio read critical path (fake timers)', () => {
  const RPC_MS = 200;

  async function advanceUntil(done: () => boolean, limitMs = 5_000): Promise<number> {
    let elapsed = 0;
    while (!done() && elapsed < limitMs) {
      await act(async () => {
        jest.advanceTimersByTime(10);
      });
      elapsed += 10;
    }
    return elapsed;
  }

  it('paints the tab from the shell read: one RPC, no wait after mount, no read on switch', async () => {
    jest.useFakeTimers();
    try {
      rpc.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: [portfolioRow(), portfolioRow({ id: OTHER_ID, ad_account_id: 'act_2' })],
                  error: null,
                }),
              RPC_MS,
            ),
          ),
      );
      const wrapper = createWrapper();
      const shell = renderHook(() => useOptimizerPortfolios(BRAND, null), { wrapper });
      const shellMs = await advanceUntil(() => shell.result.current.isSuccess);

      const tab = renderHook(
        ({ account }: { account: string }) => useOptimizerPortfolios(BRAND, account),
        { wrapper, initialProps: { account: 'act_1' } },
      );
      const tabFreshMs = await advanceUntil(
        () => tab.result.current.isSuccess && !tab.result.current.isFetching,
      );
      const callsAfterMount = rpc.mock.calls.length;

      tab.rerender({ account: 'act_2' });
      const switchFreshMs = await advanceUntil(
        () => tab.result.current.isSuccess && !tab.result.current.isFetching,
      );

      console.info(
        `[critical-path] shell ${shellMs}ms · tab fresh +${tabFreshMs}ms after mount · ` +
          `switch fresh +${switchFreshMs}ms · RPCs ${callsAfterMount} → ${rpc.mock.calls.length}`,
      );
      // The clock steps 10 ms, and React Query notifies on the next tick.
      expect(shellMs).toBe(RPC_MS + 10);
      expect(tabFreshMs).toBe(0);
      expect(switchFreshMs).toBe(0);
      expect(callsAfterMount).toBe(1);
      expect(rpc.mock.calls.length).toBe(1);
      expect(tab.result.current.data.map((row) => row.id)).toEqual([OTHER_ID]);
    } finally {
      rpc.mockReset();
      rpc.mockImplementation(async () => ({ data: [], error: null }));
      jest.useRealTimers();
    }
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

  // optimizer_record_cycle is `on conflict (portfolio_id, utc_day) do nothing` and returns the
  // run already recorded today. A second Run now the same day therefore gets back the id that is
  // ALREADY on screen: nothing new was scored, and the notice has to say so.
  async function runWithLatestOnScreen(latestRunId: string | null) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(optimizerQueryKeys.performance(RAN.portfolioId), {
      portfolio: null,
      latest_run: latestRunId ? { id: latestRunId } : null,
      latest_items: [],
      recommendations: [],
      history: [],
    });
    const { result } = renderHook(() => useOptimizerMutations('brand', 'act_1'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    result.current.run.mutate(RAN.portfolioId);
    await waitFor(() => expect(result.current.run.isSuccess).toBe(true));
    return result.current.run.data;
  }

  it('flags a run that returned the cycle already on screen as already scored today', async () => {
    rpc.mockResolvedValueOnce({ data: RAN, error: null } as never);
    expect(await runWithLatestOnScreen(RAN.runId)).toMatchObject({
      status: 'ran',
      alreadyScoredToday: true,
    });
  });

  it('does not flag a run that produced a new cycle', async () => {
    rpc.mockResolvedValueOnce({ data: RAN, error: null } as never);
    const outcome = await runWithLatestOnScreen('33333333-3333-4333-8333-333333333333');
    expect(outcome).toMatchObject({ status: 'ran' });
    expect((outcome as { alreadyScoredToday?: boolean }).alreadyScoredToday).toBeUndefined();
  });

  it('logs the unreadable body itself, not just the schema issues', async () => {
    const error = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      const body = { ...RAN, recommendations: [{}] };
      rpc.mockResolvedValueOnce({ data: body, error: null } as never);
      expect(await runOnce()).toEqual({ status: 'unavailable', kind: 'malformed' });
      expect(JSON.stringify(logged)).toContain('"recommendations":[{}]');
    } finally {
      console.error = error;
    }
  });

  it('treats runId:null with no skip reason as malformed, not as success', async () => {
    rpc.mockResolvedValueOnce({ data: { ...RAN, runId: null }, error: null } as never);
    expect(await runOnce()).toEqual({ status: 'unavailable', kind: 'malformed' });
  });
});

describe('useRevertOptimizerAction', () => {
  const PORTFOLIO = '5aaf5931-7407-4940-aab6-52e914bced45';
  const AUDIT = '0f0f0f0f-0000-4000-8000-000000000001';
  const envelope = (status: string, dryRun: boolean) => ({
    ok: status === 'would_revert' || status === 'reverted',
    dryRun,
    runId: '0c0c0c0c-0000-4000-8000-000000000001',
    result: {
      status,
      audit_id: AUDIT,
      revert_audit_id: null,
      kind: 'set_budget',
      ref: null,
      restores: { minor: 117_900, currency: 'MXN' },
    },
  });

  function renderRevert() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRevertOptimizerAction(), { wrapper });
    return { result, invalidate };
  }

  it('previews through the revert edge and never names who authorized it', async () => {
    rpc.mockResolvedValueOnce({ data: envelope('would_revert', true), error: null } as never);
    const { result, invalidate } = renderRevert();
    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync({
        portfolio_id: PORTFOLIO,
        audit_id: AUDIT,
        dryRun: true,
      });
    });
    expect(rpc).toHaveBeenCalledWith('optimizer-apply-action-revert', {
      body: { portfolio_id: PORTFOLIO, audit_id: AUDIT, dryRun: true },
    });
    expect((answer as { result: { status: string } }).result.status).toBe('would_revert');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('re-reads the optimizer after a real undo lands', async () => {
    rpc.mockResolvedValueOnce({ data: envelope('reverted', false), error: null } as never);
    const { result, invalidate } = renderRevert();
    await act(async () => {
      await result.current.mutateAsync({ portfolio_id: PORTFOLIO, audit_id: AUDIT, dryRun: false });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: optimizerQueryKeys.root });
  });

  it('reads an undecodable reply as null and an edge error as unreachable', async () => {
    rpc.mockResolvedValueOnce({ data: { result: { status: 'undone' } }, error: null } as never);
    const { result } = renderRevert();
    let answer: unknown = 'unset';
    await act(async () => {
      answer = await result.current.mutateAsync({ portfolio_id: PORTFOLIO, audit_id: AUDIT });
    });
    expect(answer).toBeNull();

    rpc.mockResolvedValueOnce({ data: null, error: new Error('500') } as never);
    await act(async () => {
      await expect(
        result.current.mutateAsync({ portfolio_id: PORTFOLIO, audit_id: AUDIT }),
      ).rejects.toThrow('optimizer-apply-action-revert unreachable');
    });
  });
});
