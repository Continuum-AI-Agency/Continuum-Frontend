import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { type PublishAccountsResponse, publishAccountsResponseSchema } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

type RequestArgs = { path: string; method?: string; body?: unknown; schema?: unknown };
const request = mock(async (_args: RequestArgs): Promise<unknown> => ({ accounts: [] }));

mock.module('@/lib/api/http', () => ({ http: { request }, request }));
afterAll(() => mock.restore());

import {
  accountName,
  accountsForPlatform,
  findAccount,
  type PublishAccount,
  publishAccountsKey,
  usePublishAccounts,
  useSaveDefaultAccount,
} from './publishTargets';
import { useCalendarStore } from './store';

const BRAND = '11111111-1111-4111-8111-111111111111';

const IG_A: PublishAccount = {
  id: 'ig-a',
  platform: 'instagram',
  handle: 'acme_a',
  displayName: 'Acme A',
  avatarUrl: 'https://cdn.test/a.jpg',
  needsReauth: false,
  isDefault: true,
};
const IG_B: PublishAccount = {
  ...IG_A,
  id: 'ig-b',
  handle: 'acme_b',
  avatarUrl: null,
  isDefault: false,
};
const FB_PAGE: PublishAccount = {
  id: 'fb-page',
  platform: 'facebook',
  handle: null,
  displayName: 'Acme Page',
  avatarUrl: null,
  needsReauth: false,
  isDefault: true,
};

function wrapperWith(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  request.mockClear();
  useCalendarStore.setState({
    accountContext: { accountIds: {}, accountOptions: {}, brandId: BRAND },
  });
});
afterEach(cleanup);

describe('account helpers', () => {
  it('names an account by its handle, a Page by its name, never by its id', () => {
    expect(accountName(IG_A)).toBe('@acme_a');
    expect(accountName(FB_PAGE)).toBe('Acme Page');
    expect(accountName({ ...FB_PAGE, displayName: null })).not.toContain('fb-page');
  });

  it('filters by platform and finds by id', () => {
    const all = [IG_A, FB_PAGE, IG_B];
    expect(accountsForPlatform(all, 'instagram')).toEqual([IG_A, IG_B]);
    expect(accountsForPlatform(all, 'tiktok')).toEqual([]);
    expect(findAccount(all, 'fb-page')).toBe(FB_PAGE);
    expect(findAccount(all, 'unknown')).toBeNull();
    expect(findAccount(all, null)).toBeNull();
  });
});

describe('usePublishAccounts', () => {
  it("reads the store brand's candidates from the publish-accounts route", async () => {
    request.mockImplementation(async () => ({ accounts: [IG_A, FB_PAGE] }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePublishAccounts(), {
      wrapper: wrapperWith(queryClient),
    });

    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual([IG_A, FB_PAGE]));
    const [args] = request.mock.calls[0] ?? [];
    expect(args?.path).toBe(`/api/organic/publish-accounts?brandId=${BRAND}`);
    expect(args?.schema).toBe(publishAccountsResponseSchema);
  });

  it('asks for nothing without a brand', () => {
    useCalendarStore.setState({
      accountContext: { accountIds: {}, accountOptions: {}, brandId: null },
    });
    const queryClient = new QueryClient();
    const { result } = renderHook(() => usePublishAccounts(), {
      wrapper: wrapperWith(queryClient),
    });
    expect(result.current).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('useSaveDefaultAccount', () => {
  it('stores the default on the server and takes its answer as the list', async () => {
    const after: PublishAccountsResponse = {
      accounts: [{ ...IG_B, isDefault: true }, { ...IG_A, isDefault: false }, FB_PAGE],
    };
    let resolvePut: (value: PublishAccountsResponse) => void = () => {};
    request.mockImplementation(
      (args: RequestArgs) =>
        new Promise((resolve) => {
          if (args.method === 'PUT') resolvePut = resolve;
          else resolve({ accounts: [IG_A, IG_B, FB_PAGE] });
        }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(publishAccountsKey(BRAND), { accounts: [IG_A, IG_B, FB_PAGE] });
    const { result } = renderHook(() => useSaveDefaultAccount(), {
      wrapper: wrapperWith(queryClient),
    });

    act(() => result.current('instagram', 'ig-b'));

    const put = request.mock.calls.find(([args]) => args.method === 'PUT')?.[0];
    expect(put?.path).toBe('/api/organic/publish-accounts/default');
    expect(put?.body).toEqual({ brandId: BRAND, platform: 'instagram', accountId: 'ig-b' });
    // The store default for new drafts moves at once.
    expect(useCalendarStore.getState().accountContext.accountIds.instagram).toBe('ig-b');
    // Optimistic: the list names the new default before the server answers, other platforms untouched.
    const optimistic = queryClient.getQueryData<PublishAccountsResponse>(publishAccountsKey(BRAND));
    expect(optimistic?.accounts.map((a) => [a.id, a.isDefault])).toEqual([
      ['ig-a', false],
      ['ig-b', true],
      ['fb-page', true],
    ]);

    await act(async () => resolvePut(after));
    expect(queryClient.getQueryData(publishAccountsKey(BRAND))).toEqual(after);
  });
});
