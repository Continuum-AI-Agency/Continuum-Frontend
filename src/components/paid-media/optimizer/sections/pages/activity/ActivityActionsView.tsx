'use client';

// The Actions view of G13: the spend line with a dot per event, then the same events as a list
// grouped by day. Both are drawn from one set of reads and one filter — the action feed, the
// server log's platform rows, the account's daily spend and its change history — so a dot and its
// row always agree, and pointing at either lights the other.

import type { OptimizerFeedWindowDays } from '@continuum/contracts';
import { useReducedMotion } from 'motion/react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useOptimizerActions,
  useOptimizerAdAccounts,
  useOptimizerLogs,
  useOptimizerPortfolios,
} from '../../../useOptimizerData';
import { ALL_PORTFOLIOS, distinctPortfolioNames } from '../../logFilters';
import { OptimizerActionFeed } from '../../OptimizerActionFeed';
import { PLATFORM_NAMES } from '../../platforms/platformTabsModel';
import { ActivitySourceTabs } from './ActivitySourceTabs';
import { ActivitySpendChart } from './ActivitySpendChart';
import {
  type ActivitySourceFilter,
  activityDays,
  activityEvents,
  deliveryEvents,
  filterActions,
  filterPlatformItems,
  layoutMarkers,
  platformItems,
  sourceCounts,
} from './activityModel';
import {
  type ChartAccount,
  chartAccounts,
  defaultChartAccount,
  type SpendState,
  useActivitySpend,
} from './useActivitySpend';
import { type PlatformChangesRead, usePlatformChanges } from './usePlatformChanges';

/** What the change history could not say, so the timeline never passes for complete. */
function changeHistoryNotes(read: PlatformChangesRead): string[] {
  if (read.failed) {
    return [
      "Google's change history could not be read, so changes made in Google Ads are missing.",
    ];
  }
  if (read.truncated) {
    return [
      "Google's change history was cut short at its row limit: older changes may be missing.",
    ];
  }
  return [];
}

const accountLabel = (account: ChartAccount) =>
  `${PLATFORM_NAMES[account.platform]} · ${account.name?.trim() || account.id}`;

function ChartAccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: readonly ChartAccount[];
  value: string;
  onChange: (accountId: string) => void;
}) {
  if (accounts.length < 2) return null;
  const labelOf = (id: unknown) => {
    const account = accounts.find((candidate) => candidate.id === id);
    return account ? accountLabel(account) : String(id ?? '');
  };
  return (
    <Select onValueChange={(next) => onChange(String(next))} value={value}>
      <SelectTrigger aria-label="Ad account the line is drawn for" className="h-7 w-48 text-xs">
        <SelectValue>{labelOf}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {accountLabel(account)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ActivityActionsView({
  brandId,
  windowDays,
  footer,
}: {
  brandId: string;
  windowDays: OptimizerFeedWindowDays;
  footer?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [source, setSource] = useState<ActivitySourceFilter>('all');
  const [portfolio, setPortfolio] = useState<string>(ALL_PORTFOLIOS);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  // The same cache entries the feed below reads, so the chart costs no second request.
  const actions = useOptimizerActions(brandId, windowDays).data;
  const logs = useOptimizerLogs(brandId, windowDays).data;
  const portfolios = useOptimizerPortfolios(brandId, null).brandPortfolios;
  const accountsRead = useOptimizerAdAccounts(brandId);
  const accountRows = accountsRead.data;

  const days = useMemo(() => activityDays(windowDays), [windowDays]);
  const accounts = useMemo(() => chartAccounts(accountRows), [accountRows]);
  const accountId =
    pickedAccount && accounts.some((account) => account.id === pickedAccount)
      ? pickedAccount
      : defaultChartAccount(accounts, actions, portfolios);
  const account = accounts.find((candidate) => candidate.id === accountId) ?? null;
  const spendRead = useActivitySpend({ brandId, account, days });
  // Until the brand's accounts are known there is nothing to chart yet; a failed account read is
  // a failure, never "no account connected".
  const spend: SpendState =
    accountsRead.isLoading && accounts.length === 0
      ? { status: 'loading' }
      : accountsRead.isError && accounts.length === 0
        ? {
            status: 'error',
            message: "the brand's ad accounts could not be read.",
            retry: () => void accountsRead.refetch(),
          }
        : spendRead;

  const platformChanges = usePlatformChanges({ brandId, account, days });

  const series = spend.status === 'ready' ? spend.series : null;
  const platform = useMemo(
    () => platformItems(logs, series ? deliveryEvents(series) : [], platformChanges.changes),
    [logs, series, platformChanges.changes],
  );
  // The portfolio narrowing the list falls back from when its portfolio has left the window.
  const names = distinctPortfolioNames([
    ...actions.map((row) => ({ portfolio_name: row.portfolio_name ?? null })),
    ...platform.map((item) => ({ portfolio_name: item.portfolioName })),
  ]);
  const effectivePortfolio = names.includes(portfolio) ? portfolio : ALL_PORTFOLIOS;
  const filter = { source, portfolio: effectivePortfolio };
  const everyHand = { source: 'all' as const, portfolio: effectivePortfolio };

  const counts = sourceCounts(
    activityEvents(filterActions(actions, everyHand), filterPlatformItems(platform, everyHand)),
  );
  const { markers, overflow } = layoutMarkers(
    activityEvents(filterActions(actions, filter), filterPlatformItems(platform, filter)),
    days,
  );

  const pick = (id: string) => {
    setHighlightedId(id);
    const entry = Array.from(list.current?.querySelectorAll('[data-event-id]') ?? []).find(
      (element) => element.getAttribute('data-event-id') === id,
    );
    entry?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className="space-y-3">
      <ActivitySpendChart
        account={account}
        accountPicker={
          accountId ? (
            <ChartAccountPicker accounts={accounts} onChange={setPickedAccount} value={accountId} />
          ) : null
        }
        days={days}
        filter={<ActivitySourceTabs counts={counts} onChange={setSource} value={source} />}
        highlightedId={highlightedId}
        markers={markers}
        notes={changeHistoryNotes(platformChanges)}
        onHighlight={setHighlightedId}
        onPick={pick}
        overflow={overflow}
        spend={spend}
      />
      <div ref={list}>
        <OptimizerActionFeed
          brandId={brandId}
          footer={footer}
          highlightedId={highlightedId}
          onHighlight={setHighlightedId}
          onPortfolioChange={setPortfolio}
          platformItems={platform}
          portfolio={effectivePortfolio}
          source={source}
          windowDays={windowDays}
        />
      </div>
    </div>
  );
}
