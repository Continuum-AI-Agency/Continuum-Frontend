import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { FunctionsHttpError } from '@supabase/supabase-js';

const invokeMock = mock(async (..._args: unknown[]) => ({ data: { campaigns: [] }, error: null }));
const consumePrefetchedCampaignsMock = mock(
  (..._args: unknown[]): Promise<Array<{ id: string; name: string }>> | null => null,
);

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke: invokeMock } }),
}));

mock.module('@/lib/prefetch/paid-media-cache', () => ({
  consumePrefetchedCampaigns: consumePrefetchedCampaignsMock,
  consumePrefetchedIndexes: () => null,
}));

mock.module('@/lib/brands/brand-switch', () => ({
  registerBrandScopedStore: () => {},
}));

const { makeCampaignPerformanceKey, usePaidMediaPerformanceStore } = await import(
  './performance-store'
);

const params = {
  brandId: 'brand-1',
  adAccountId: 'act_12345',
  platform: 'meta' as const,
  range: { preset: 'last_7d' as const },
};

describe('paid media performance store', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ data: { campaigns: [] }, error: null });
    consumePrefetchedCampaignsMock.mockReset();
    consumePrefetchedCampaignsMock.mockImplementation(() => null);
    usePaidMediaPerformanceStore.getState().reset();
  });

  it('preserves the typed Edge error metadata for user-visible recovery', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(
        new Response(
          JSON.stringify({
            error: 'Meta account lookup is temporarily unavailable.',
            errorCode: 'UPSTREAM_UNAVAILABLE',
            platform: 'meta',
            retryable: true,
            retryAfter: 30,
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    });

    await expect(
      usePaidMediaPerformanceStore.getState().loadCampaignPerformance(params),
    ).rejects.toThrow('Meta account lookup is temporarily unavailable.');

    expect(
      usePaidMediaPerformanceStore.getState().campaigns[makeCampaignPerformanceKey(params)],
    ).toMatchObject({
      status: 'error',
      error: 'Meta account lookup is temporarily unavailable.',
      errorCode: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      retryAfter: 30,
    });
  });

  it('forces Retry past the fresh cache and performs a new campaign invocation', async () => {
    const store = usePaidMediaPerformanceStore.getState();

    await store.loadCampaignPerformance(params);
    await usePaidMediaPerformanceStore.getState().loadCampaignPerformance(params);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await usePaidMediaPerformanceStore.getState().loadCampaignPerformance(params, { force: true });

    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('forces Retry past a populated campaign prefetch', async () => {
    consumePrefetchedCampaignsMock.mockImplementation(() =>
      Promise.resolve([{ id: 'prefetched-campaign', name: 'Prefetched campaign' }]),
    );

    const prefetched = await usePaidMediaPerformanceStore
      .getState()
      .loadCampaignPerformance(params);

    expect(prefetched).toEqual([{ id: 'prefetched-campaign', name: 'Prefetched campaign' }]);
    expect(consumePrefetchedCampaignsMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(0);

    await usePaidMediaPerformanceStore.getState().loadCampaignPerformance(params, { force: true });

    expect(consumePrefetchedCampaignsMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
