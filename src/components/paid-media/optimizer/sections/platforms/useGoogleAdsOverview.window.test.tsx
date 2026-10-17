import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// The Google tab reads once, on the producer's window. While the producer is still answering it
// reads nothing: a read on the fallback first was thrown away, and between UTC midnight and the
// account's own it covered a day the account had not finished (found by paid-parity, G3).
const invoked: { scope: unknown; range: unknown }[] = [];
const rpc = async (fn: string) => {
  if (fn !== 'list_brand_ad_accounts') throw new Error(`unexpected rpc ${fn}`);
  return {
    data: [
      {
        platform: 'google_ads',
        account_id: '5251780631',
        name: 'Easy Fit G',
        status: null,
        currency: 'MXN',
      },
    ],
    error: null,
  };
};
const invoke = async (_name: string, options: { body: Record<string, unknown> }) => {
  invoked.push({ scope: options.body.scope, range: options.body.range });
  return { data: null, error: null };
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ rpc, schema: () => ({ rpc }), functions: { invoke } }),
}));

const { useGoogleAdsOverview } = await import('./useGoogleAdsOverview');

const BRAND = '22222222-2222-4222-8222-222222222222';
const PRODUCER = { since: '2026-10-08', until: '2026-10-14' };

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  invoked.length = 0;
});

describe("useGoogleAdsOverview — one read, on the producer's window", () => {
  it('reads nothing while the producer is pending, then both scopes on its window', async () => {
    const { result, rerender } = renderHook(
      ({ window }: { window: typeof PRODUCER | 'pending' }) => useGoogleAdsOverview(BRAND, window),
      { initialProps: { window: 'pending' as typeof PRODUCER | 'pending' }, wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.status).toBe('loading'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invoked).toEqual([]);

    rerender({ window: PRODUCER });
    await waitFor(() => expect(invoked).toHaveLength(2));
    const range = { preset: 'custom', since: PRODUCER.since, until: PRODUCER.until };
    expect(invoked).toEqual(
      expect.arrayContaining([
        { scope: 'account_overview', range },
        { scope: 'top_campaigns', range },
      ]),
    );
  });
});
