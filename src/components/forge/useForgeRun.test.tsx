import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PostgresChangesSubscription } from '@/lib/supabase/realtime';

let subscription: PostgresChangesSubscription;
const fetchRun = mock(async (_brandId: string, _assetId: string): Promise<unknown> => null);
mock.module('@/lib/library/templateSources', () => ({ fetchTemplateRun: fetchRun }));
mock.module('@/lib/supabase/realtime', () => ({
  subscribeToPostgresChanges: (options: PostgresChangesSubscription) => {
    subscription = options;
    return () => undefined;
  },
}));

const { useForgeRun } = await import('./useForgeRun');
afterEach(cleanup);
beforeEach(() => {
  fetchRun.mockReset();
  fetchRun.mockImplementation(async () => null);
});

const withClient = (client: QueryClient) =>
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

test('late reads and notifications cannot replace another brand or current source run', async () => {
  let release!: (value: unknown) => void;
  fetchRun.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  fetchRun.mockImplementation(async () => ({ run_id: 'current', state: 'rendering' }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(({ brand }) => useForgeRun(brand, 'asset'), {
    initialProps: { brand: 'first' },
    wrapper: withClient(client),
  });
  hook.rerender({ brand: 'second' });
  await waitFor(() => expect(hook.result.current.run?.run_id).toBe('current'));
  await act(async () => release({ run_id: 'old-brand', state: 'failed' }));
  expect(hook.result.current.run?.run_id).toBe('current');
  const before = fetchRun.mock.calls.length;
  act(() =>
    subscription.bindings[0]!.onRow(
      { asset_id: 'asset', brand_id: 'first', run_id: 'old-brand' },
      { eventType: 'UPDATE', old: {} },
    ),
  );
  expect(fetchRun.mock.calls.length).toBe(before);
  act(() =>
    subscription.bindings[0]!.onRow(
      { asset_id: 'asset', brand_id: 'second', run_id: 'old-source', state: 'failed' },
      { eventType: 'UPDATE', old: {} },
    ),
  );
  await waitFor(() => expect(fetchRun.mock.calls.length).toBe(before + 1));
  expect(hook.result.current.run?.run_id).toBe('current');
});

test('reuses a fresh run after its detail view remounts', async () => {
  fetchRun.mockImplementation(async () => ({ run_id: 'current', state: 'rendering' }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = withClient(client);
  const first = renderHook(() => useForgeRun('brand', 'asset'), { wrapper });
  await waitFor(() => expect(first.result.current.run?.run_id).toBe('current'));
  first.unmount();

  const second = renderHook(() => useForgeRun('brand', 'asset'), { wrapper });
  await waitFor(() => expect(second.result.current.run?.run_id).toBe('current'));

  expect(fetchRun).toHaveBeenCalledTimes(1);
});
