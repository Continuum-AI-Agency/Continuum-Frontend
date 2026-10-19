// The brand's posting accounts, every platform — the one list the account pickers read.
//
// Source: GET /api/organic/publish-accounts?brandId= (`publishAccountsResponseSchema`), already
// posting asset types only, de-duplicated, every platform, the default first. React Query owns
// the cache, keyed per brand; setting a default writes the server's answer straight back into it.

import {
  findStampedCandidate,
  type PublishAccountCandidate,
  type PublishAccountsResponse,
  type PublishPlatform,
  publishAccountLabel,
  publishAccountsResponseSchema,
} from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from '@/components/ui/toast-imperative';
import { http } from '@/lib/api/http';
import { useCalendarStore } from '@/lib/organic/store';

export type PublishAccount = PublishAccountCandidate;

export const publishAccountsKey = (brandId: string) =>
  ['organic', 'publish-accounts', brandId] as const;

const NO_ACCOUNTS: PublishAccount[] = [];

/** The brand's posting accounts (the store's brand unless one is given). Empty while loading. */
export function usePublishAccounts(brandIdOverride?: string | null): PublishAccount[] {
  return usePublishAccountsState(brandIdOverride).accounts;
}

/** The same list, plus whether it is still loading — so "none yet" never reads as "none". */
export function usePublishAccountsState(brandIdOverride?: string | null): {
  accounts: PublishAccount[];
  isLoading: boolean;
} {
  const storeBrandId = useCalendarStore((state) => state.accountContext.brandId);
  const brandId = brandIdOverride ?? storeBrandId;
  const query = useQuery({
    queryKey: publishAccountsKey(brandId ?? 'none'),
    enabled: Boolean(brandId),
    staleTime: 60_000,
    retry: 1,
    queryFn: ({ signal }) =>
      http.request<PublishAccountsResponse>({
        path: `/api/organic/publish-accounts?brandId=${encodeURIComponent(brandId ?? '')}`,
        schema: publishAccountsResponseSchema,
        signal,
      }),
  });
  return {
    accounts: query.data?.accounts ?? NO_ACCOUNTS,
    isLoading: query.isPending && Boolean(brandId),
  };
}

export function accountsForPlatform(
  accounts: PublishAccount[],
  platform: PublishPlatform,
): PublishAccount[] {
  return accounts.filter((account) => account.platform === platform);
}

export function findAccount(
  accounts: PublishAccount[],
  id: string | null | undefined,
): PublishAccount | null {
  if (!id) return null;
  // A stamp may name a twin link of a candidate (`aliases`): it is that candidate.
  return findStampedCandidate(accounts, id)?.candidate ?? null;
}

/** '@handle' when the account has one, else its name. Never a UUID. */
export function accountName(account: PublishAccount): string {
  return publishAccountLabel(account);
}

/** Sets the brand's default account for NEW drafts on a platform (never re-stamps a draft). */
export function useSaveDefaultAccount(): (platform: PublishPlatform, accountId: string) => void {
  const queryClient = useQueryClient();
  const selectAccount = useCalendarStore((state) => state.selectAccount);
  const brandId = useCalendarStore((state) => state.accountContext.brandId);
  return React.useCallback(
    (platform, accountId) => {
      if (!brandId) return;
      selectAccount(platform, accountId);
      // Optimistic: the switcher names the new default at once; the PUT's answer replaces it.
      queryClient.setQueryData<PublishAccountsResponse>(publishAccountsKey(brandId), (current) =>
        current
          ? {
              accounts: current.accounts.map((account) =>
                account.platform === platform
                  ? { ...account, isDefault: account.id === accountId }
                  : account,
              ),
            }
          : current,
      );
      void http
        .request<PublishAccountsResponse>({
          path: '/api/organic/publish-accounts/default',
          method: 'PUT',
          body: { brandId, platform, accountId },
          schema: publishAccountsResponseSchema,
        })
        .then((response) => queryClient.setQueryData(publishAccountsKey(brandId), response))
        .catch((error: unknown) => {
          console.error('[publishTargets] could not save the default account', error);
          toast.error('Could not save the default account', {
            description: 'New posts may still go to the previous default. Try again.',
          });
          void queryClient.invalidateQueries({ queryKey: publishAccountsKey(brandId) });
        });
    },
    [brandId, queryClient, selectAccount],
  );
}
