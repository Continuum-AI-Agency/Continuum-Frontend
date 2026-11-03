'use client';

// The spend line's read: one ad account's day-by-day spend over the window's complete days, from
// the paid-media-metrics account overview (the read the Home and the Dashboard draw from). The
// Activity feed is brand-wide and a brand can hold a Meta and a Google account in different
// currencies, so the line is one account at a time; the page charts the account most of the
// window's actions touched, and offers the others.

import type { AdAccount, PaidAccountOverview, PortfolioListItem } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { bareAccountId } from '@/lib/paid-media/accountId';
import { fetchPaidAccountOverview } from '@/lib/paid-media/paid-overview.client';
import { lastCompleteDays } from '@/lib/paid-media/reportingWindow';
import type { OptimizerActionFeedRow } from '../../../useOptimizerData';
import { accountPlatform } from '../../platforms/platformTabsModel';
import { type ActivityDay, type SpendSeries, spendSeries } from './activityModel';

/** An account the line can be drawn for: Meta or Google, the two the account overview serves. */
export type ChartAccount = {
  id: string;
  platform: 'meta' | 'google_ads';
  name: string | null;
  currency: string | null;
};

export function chartAccounts(accounts: readonly AdAccount[]): ChartAccount[] {
  const seen = new Set<string>();
  const out: ChartAccount[] = [];
  for (const account of accounts) {
    const platform = accountPlatform(account);
    if (platform !== 'meta' && platform !== 'google_ads') continue;
    const key = `${platform}:${bareAccountId(account.account_id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: account.account_id,
      platform,
      name: account.name,
      currency: account.currency,
    });
  }
  // Meta first, as every platform list on the page reads.
  return out.sort((a, b) => (a.platform === b.platform ? 0 : a.platform === 'meta' ? -1 : 1));
}

/** The account the window's actions touched most, through each row's portfolio; the first
 *  account when none of them names one. Null when there is no account to chart. */
export function defaultChartAccount(
  accounts: readonly ChartAccount[],
  rows: readonly Pick<OptimizerActionFeedRow, 'portfolio_id'>[],
  portfolios: readonly Pick<PortfolioListItem, 'id' | 'ad_account_id'>[],
): string | null {
  if (accounts.length === 0) return null;
  const accountOf = new Map(
    portfolios.flatMap((portfolio) =>
      portfolio.ad_account_id ? [[portfolio.id, bareAccountId(portfolio.ad_account_id)]] : [],
    ),
  );
  const touches = new Map<string, number>();
  for (const row of rows) {
    const account = row.portfolio_id ? accountOf.get(row.portfolio_id) : undefined;
    if (account) touches.set(account, (touches.get(account) ?? 0) + 1);
  }
  let best = accounts[0] ?? null;
  let bestCount = best ? (touches.get(bareAccountId(best.id)) ?? 0) : 0;
  for (const account of accounts) {
    const count = touches.get(bareAccountId(account.id)) ?? 0;
    if (count > bestCount) {
      best = account;
      bestCount = count;
    }
  }
  return best?.id ?? null;
}

export type SpendState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'unreadable' }
  | { status: 'ready'; series: SpendSeries };

const FIVE_MINUTES = 5 * 60_000;

/** The day-by-day spend of one account over the chart's complete days. */
export function useActivitySpend({
  brandId,
  account,
  days,
}: {
  brandId: string;
  account: ChartAccount | null;
  days: readonly ActivityDay[];
}): SpendState {
  const complete = days.filter((day) => day.complete);
  const since = complete[0]?.key ?? null;
  const until = complete.at(-1)?.key ?? null;
  const query = useQuery<PaidAccountOverview>({
    queryKey: [
      'activity-spend',
      brandId,
      account?.platform ?? null,
      account?.id ?? null,
      since,
      until,
    ],
    queryFn: () =>
      fetchPaidAccountOverview({
        brandId,
        adAccountId: account?.id ?? '',
        platform: account?.platform === 'google_ads' ? 'google-ads' : 'meta',
        range:
          since && until
            ? { preset: 'custom', since, until }
            : lastCompleteDays(Math.max(1, complete.length)),
      }),
    enabled: Boolean(brandId && account && since && until),
    staleTime: FIVE_MINUTES,
    retry: 1,
  });

  const series = useMemo(
    () => (query.data ? spendSeries(query.data, days) : null),
    [query.data, days],
  );

  if (!account) return { status: 'none' };
  if (query.isPending) return { status: 'loading' };
  if (query.isError) {
    return {
      status: 'error',
      message:
        query.error instanceof Error ? query.error.message : 'The ad platform did not answer.',
      retry: () => void query.refetch(),
    };
  }
  return series ? { status: 'ready', series } : { status: 'unreadable' };
}
