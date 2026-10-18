import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PublishAccountsResponse } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

type RequestArgs = { path: string; method?: string; body?: unknown };
const request = mock(
  async (_args: RequestArgs): Promise<PublishAccountsResponse> => new Promise(() => {}),
);

mock.module('@/lib/api/http', () => ({ http: { request }, request }));
afterAll(() => mock.restore());

import { type PublishAccount, publishAccountsKey } from '@/lib/organic/publishTargets';
import { useCalendarStore } from '@/lib/organic/store';
import { PlannerAccountSwitcher } from './PlannerAccountSwitcher';

const BRAND = '11111111-1111-4111-8111-111111111111';
// Base UI mounts a portalled positioner; the first render in a busy run can be slow.
const TIMEOUT_MS = 30_000;

const base: PublishAccount = {
  id: 'ig-a',
  platform: 'instagram',
  handle: 'acme_a',
  displayName: 'Acme A',
  avatarUrl: null,
  needsReauth: false,
  isDefault: true,
};
const IG_A = base;
const IG_B: PublishAccount = { ...base, id: 'ig-b', handle: 'acme_b', isDefault: false };
const IG_OLD: PublishAccount = {
  ...base,
  id: 'ig-old',
  handle: 'acme_old',
  needsReauth: true,
  isDefault: false,
};
const TT_ONLY: PublishAccount = {
  ...base,
  id: 'tt-1',
  platform: 'tiktok',
  handle: 'acme.tt',
  isDefault: false,
};

function renderSwitcher(accounts: PublishAccount[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(publishAccountsKey(BRAND), { accounts });
  render(
    <QueryClientProvider client={queryClient}>
      <PlannerAccountSwitcher />
    </QueryClientProvider>,
  );
  return queryClient;
}

beforeEach(() => {
  request.mockClear();
  useCalendarStore.setState({
    accountContext: { accountIds: {}, accountOptions: {}, brandId: BRAND },
  });
});
afterEach(cleanup);

describe('PlannerAccountSwitcher', () => {
  it(
    'shows one default per connected platform, even a single account, named with its selection',
    () => {
      renderSwitcher([IG_A, IG_B, TT_ONLY]);
      const triggers = screen.getAllByRole('button', { name: /^Default / });
      expect(triggers.map((trigger) => trigger.getAttribute('aria-label'))).toEqual([
        'Default Instagram account: @acme_a',
        'Default TikTok account: Choose account',
      ]);
      expect(screen.queryByRole('button', { name: /^Default Facebook/ })).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    'falls back to the store default when the server has none',
    () => {
      useCalendarStore.setState({
        accountContext: { accountIds: { tiktok: 'tt-1' }, accountOptions: {}, brandId: BRAND },
      });
      renderSwitcher([TT_ONLY]);
      expect(screen.getByRole('button', { name: 'Default TikTok account: @acme.tt' })).toBeTruthy();
    },
    TIMEOUT_MS,
  );

  it(
    'offers the accounts as radios, a reconnect-only one disabled with a Reconnect link',
    () => {
      renderSwitcher([IG_A, IG_B, IG_OLD]);
      fireEvent.click(screen.getByRole('button', { name: 'Default Instagram account: @acme_a' }));
      const group = screen.getByRole('radiogroup', { name: 'New Instagram posts go to' });
      expect(within(group).getAllByRole('radio')).toHaveLength(3);
      expect(
        within(group).getByRole('radio', { name: '@acme_a' }).getAttribute('aria-checked'),
      ).toBe('true');
      expect(
        within(group).getByRole('radio', { name: '@acme_old' }).getAttribute('aria-disabled'),
      ).toBe('true');
      expect(
        within(group).getByRole('link', { name: 'Reconnect @acme_old' }).getAttribute('href'),
      ).toBe('/settings?section=integrations');
    },
    TIMEOUT_MS,
  );

  it(
    'sets the default for new drafts on the server and in the store',
    () => {
      renderSwitcher([IG_A, IG_B]);
      fireEvent.click(screen.getByRole('button', { name: 'Default Instagram account: @acme_a' }));
      const acmeB = within(screen.getByRole('radiogroup')).getByRole('radio', { name: '@acme_b' });
      fireEvent.pointerDown(acmeB);
      fireEvent.click(acmeB);

      const put = request.mock.calls.find(([args]) => args.method === 'PUT')?.[0];
      expect(put?.body).toEqual({ brandId: BRAND, platform: 'instagram', accountId: 'ig-b' });
      expect(useCalendarStore.getState().accountContext.accountIds.instagram).toBe('ig-b');
      expect(
        screen.getByRole('button', { name: 'Default Instagram account: @acme_b' }),
      ).toBeTruthy();
    },
    TIMEOUT_MS,
  );

  it(
    'renders nothing when the brand has no posting account',
    () => {
      renderSwitcher([]);
      expect(screen.queryByRole('button')).toBeNull();
    },
    TIMEOUT_MS,
  );
});
