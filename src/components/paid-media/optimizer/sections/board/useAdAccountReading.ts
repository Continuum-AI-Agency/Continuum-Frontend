'use client';

// Reads the account the board shows: gathers the signals from the reads the Overview and the
// Google tab already run (React Query dedupes them under the same keys) and hands them to
// readAdAccount. The reading is pure; this hook only collects its inputs, and
// src/lib/optimizer/adAccountSignals.ts maps them, the same mappers optimizer:reading:bench uses.
//
// While an input is still reading, the board gets the spine-only reading and isLoading. An input
// that failed is read without, and the reading says which one is missing and why.

import {
  type AccountPlatformMetrics,
  type AdAccount,
  type AdAccountMissingInput,
  type AdAccountReading,
  type AdSetSnapshot,
  type GoogleTopCampaigns,
  type PortfolioListItem,
  readAdAccount,
  readingApprovalNotRead,
  readingCampaignsAccountsNotRead,
  readingCampaignsNoGoogleAccount,
  readingCampaignsNotRead,
  readingCardsNotRead,
  readingWindowNotRead,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  type AdAccountReads,
  adAccountSignalsFrom,
  googleAccountOf,
  portfolioSignalOf,
  portfoliosOfAccount,
} from '@/lib/optimizer/adAccountSignals';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  type AccountReadEnvelope,
  accountSnapshotsQuery,
  type PlatformCardsState,
  useMetaReadAccount,
  useOptimizerAccountRead,
  useOptimizerAdAccounts,
  useOptimizerPlatformCards,
  useOptimizerPlatformPortfolios,
} from '../../useOptimizerData';
import { useGoogleCampaigns } from '../google/googleReads';
import { completeDaysWindow } from '../platforms/googleAdsOverviewModel';
import {
  type AccountPlatformMetricsState,
  useAccountPlatformMetrics,
} from '../platforms/useAccountPlatformMetrics';
import { portfolioGoalOf } from '../platforms/useGoogleAdsOverview';
import type { BoardPlatform } from './types';

export { portfolioSignalOf };

/** The Google sections' window: the goal is judged on volume, and seven days are too few
 *  conversions for most campaigns (GoogleTabSections reads the same 14 days). */
export const GOOGLE_CAMPAIGNS_WINDOW_DAYS = 14;

const FIVE_MINUTES = 5 * 60 * 1000;

export type AdAccountReadingState = {
  reading: AdAccountReading;
  isLoading: boolean;
};

type Read<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  /** `message` is the read's own error when it gave one a person can read. */
  | { status: 'error'; message: string | null }
  | { status: 'ready'; data: T };

/** Every read the reading takes, in the state React Query left it. */
export type AdAccountQueries = {
  platform: BoardPlatform;
  adAccountId: string | null;
  currency: string | null;
  portfolios: readonly PortfolioListItem[];
  accounts: Read<readonly AdAccount[]>;
  approval: Read<boolean>;
  metrics: AccountPlatformMetricsState;
  googleCards: PlatformCardsState;
  googleCampaigns: Read<{ read: GoogleTopCampaigns; resultKind: string | null }>;
  metaRead: Read<AccountReadEnvelope>;
  metaSnapshots: Read<readonly AdSetSnapshot[]>;
};

const busy = (read: { status: string }) => read.status === 'loading';

/**
 * What the reads add up to: the inputs for adAccountSignalsFrom, and whether any input the
 * platform needs is still reading. Pure, so the hook's choices are tested without React.
 */
export function readsFromQueries(queries: AdAccountQueries): {
  reads: AdAccountReads;
  loading: boolean;
} {
  const { platform } = queries;
  const accounts = queries.accounts.status === 'ready' ? queries.accounts.data : [];
  const google = platform === 'google_ads' ? googleAccountOf(accounts) : null;
  const accountId = platform === 'google_ads' ? (google?.account_id ?? null) : queries.adAccountId;
  const portfolios = portfoliosOfAccount(queries.portfolios, platform, accountId);
  const missing: AdAccountMissingInput[] = [];

  if (queries.approval.status === 'error') {
    missing.push({ input: 'approval', reason: readingApprovalNotRead() });
  }
  const metrics: AccountPlatformMetrics | null =
    queries.metrics.status === 'ready' ? queries.metrics.metrics : null;
  if (queries.metrics.status === 'error' || queries.metrics.status === 'unavailable') {
    missing.push({ input: 'window', reason: readingWindowNotRead() });
  }

  const reads: AdAccountReads = {
    platform,
    accountId,
    currency:
      queries.currency ??
      google?.currency ??
      portfolios.find((portfolio) => portfolio.currency)?.currency ??
      null,
    portfolios,
    approvalRequired: queries.approval.status === 'ready' ? queries.approval.data : false,
    metrics,
    missing,
  };

  if (platform === 'google_ads') {
    const cards = queries.googleCards;
    if (cards.status === 'ready') reads.googleCards = cards.cards;
    else if (cards.status !== 'loading') {
      reads.googleCards = null;
      missing.push({ input: 'cards', reason: readingCardsNotRead('google_ads') });
    }
    const campaigns = queries.googleCampaigns;
    if (campaigns.status === 'ready') reads.googleCampaigns = campaigns.data;
    else if (campaigns.status === 'error') {
      missing.push({
        input: 'campaigns',
        reason: readingCampaignsNotRead('google_ads', campaigns.message),
      });
    } else if (queries.accounts.status === 'error') {
      missing.push({ input: 'campaigns', reason: readingCampaignsAccountsNotRead() });
    } else if (campaigns.status === 'idle' && queries.accounts.status === 'ready' && !google) {
      missing.push({ input: 'campaigns', reason: readingCampaignsNoGoogleAccount() });
    }
  } else {
    const read = queries.metaRead;
    if (read.status === 'ready') {
      reads.metaRead = read.data?.read
        ? { candidates: read.data.read.candidates, guards: read.data.read.guards }
        : null;
    } else if (read.status === 'error') {
      missing.push({ input: 'cards', reason: readingCardsNotRead('meta') });
    }
    const snapshots = queries.metaSnapshots;
    if (snapshots.status === 'ready') reads.metaSnapshots = snapshots.data;
    else if (snapshots.status === 'error') {
      missing.push({
        input: 'campaigns',
        reason: readingCampaignsNotRead('meta', snapshots.message),
      });
    }
  }

  const common = busy(queries.accounts) || busy(queries.approval) || busy(queries.metrics);
  const own =
    platform === 'google_ads'
      ? busy(queries.googleCards) || busy(queries.googleCampaigns)
      : busy(queries.metaRead) || busy(queries.metaSnapshots);
  return { reads, loading: common || own };
}

/** Whether changes on the brand go through its approval chain (brand_profiles row). */
function useApprovalChain(brandId: string) {
  return useQuery({
    queryKey: ['optimizer', 'approval-chain', brandId],
    queryFn: async () => {
      const { data, error } = await createSupabaseBrowserClient()
        .schema('brand_profiles')
        .from('brand_profiles')
        .select('approval_chain_required')
        .eq('id', brandId)
        .maybeSingle();
      if (error) throw new Error('brand_profiles unreachable');
      return data?.approval_chain_required === true;
    },
    enabled: Boolean(brandId),
    staleTime: FIVE_MINUTES,
    retry: 1,
  });
}

export function useAdAccountReading({
  brandId,
  platform,
  adAccountId,
  portfolios,
  currency,
}: {
  brandId: string;
  platform: BoardPlatform;
  adAccountId: string | null;
  portfolios: PortfolioListItem[];
  currency: string | null;
}): AdAccountReadingState {
  const onGoogle = platform === 'google_ads';
  const accounts = useOptimizerAdAccounts(brandId);
  const approval = useApprovalChain(brandId);
  const metrics = useAccountPlatformMetrics(brandId);

  // Google: the tab's cards, and its campaigns over the sections' window under the same key.
  const googleCards = useOptimizerPlatformCards(brandId, 'google_ads');
  const googlePortfolios = useOptimizerPlatformPortfolios(brandId, 'google_ads');
  const google = accounts.isSuccess ? googleAccountOf(accounts.data) : null;
  const resultBucket = portfolioGoalOf(googlePortfolios.data);
  const lastCompleteDay = metrics.status === 'ready' ? metrics.metrics.window.until : null;
  const campaignsWindow = completeDaysWindow(
    GOOGLE_CAMPAIGNS_WINDOW_DAYS,
    new Date(),
    lastCompleteDay,
  );
  const campaignsReady = onGoogle && metrics.status !== 'loading' && !googlePortfolios.isPending;
  const googleCampaigns = useGoogleCampaigns({
    brandId: campaignsReady ? brandId : '',
    customerId: campaignsReady ? (google?.account_id ?? '') : '',
    resultBucket,
    window: campaignsWindow,
  });

  // Meta: the account read and the ad-set snapshots the Overview's figures already read.
  const accountRead = useOptimizerAccountRead(brandId, onGoogle ? null : adAccountId);
  const meta = useMetaReadAccount(brandId, onGoogle ? null : adAccountId);
  const snapshots = useQuery({
    ...accountSnapshotsQuery(brandId, adAccountId ?? '', 'adset'),
    enabled: !onGoogle && Boolean(brandId && meta.accountId),
  });

  // Each piece is a primitive or a reference React Query keeps stable while its data is
  // unchanged, so the reading is recomputed only when an input moved.
  const accountsData = accounts.isSuccess ? accounts.data : null;
  const accountsFailed = accounts.isError;
  const approvalData = approval.data;
  const approvalFailed = approval.isError;
  const approvalBusy = approval.isLoading;
  const metricsStatus = metrics.status;
  const metricsData = metrics.status === 'ready' ? metrics.metrics : null;
  const cardsState = onGoogle ? googleCards : null;
  const campaignsData = googleCampaigns.data;
  const campaignsError = googleCampaigns.error;
  const campaignsBusy = googleCampaigns.isLoading || (!campaignsReady && google != null);
  const readData = accountRead.data;
  const readFailed = accountRead.isError;
  const readBusy = accountRead.isLoading;
  const snapshotsData = snapshots.data?.snapshots;
  const snapshotsFailed = snapshots.isError;
  const snapshotsBusy = snapshots.isLoading || (!meta.settled && Boolean(adAccountId));

  return useMemo(() => {
    const queries: AdAccountQueries = {
      platform,
      adAccountId,
      currency,
      portfolios,
      accounts: accountsFailed
        ? { status: 'error', message: null }
        : accountsData
          ? { status: 'ready', data: accountsData }
          : { status: 'loading' },
      approval: approvalFailed
        ? { status: 'error', message: null }
        : approvalBusy
          ? { status: 'loading' }
          : { status: 'ready', data: approvalData === true },
      metrics: metricsData
        ? { status: 'ready', metrics: metricsData }
        : metricsStatus === 'error'
          ? { status: 'error', message: 'Could not read the multi-platform numbers.' }
          : metricsStatus === 'unavailable'
            ? { status: 'unavailable' }
            : { status: 'loading' },
      googleCards: cardsState ?? { status: 'ready', cards: [] },
      googleCampaigns: !onGoogle
        ? { status: 'idle' }
        : campaignsError
          ? {
              status: 'error',
              message: campaignsError instanceof Error ? campaignsError.message : null,
            }
          : campaignsData
            ? { status: 'ready', data: { read: campaignsData, resultKind: resultBucket } }
            : campaignsBusy
              ? { status: 'loading' }
              : { status: 'idle' },
      metaRead: onGoogle
        ? { status: 'idle' }
        : readFailed
          ? { status: 'error', message: null }
          : readBusy
            ? { status: 'loading' }
            : { status: 'ready', data: readData ?? null },
      metaSnapshots:
        onGoogle || !adAccountId
          ? { status: 'idle' }
          : snapshotsFailed
            ? { status: 'error', message: null }
            : snapshotsData
              ? { status: 'ready', data: snapshotsData }
              : snapshotsBusy
                ? { status: 'loading' }
                : { status: 'idle' },
    };
    const { reads, loading } = readsFromQueries(queries);
    const reading = loading
      ? readAdAccount({
          platform,
          accountId: reads.accountId,
          portfolios: reads.portfolios.map((portfolio) => portfolioSignalOf(portfolio, platform)),
          approvalRequired: false,
          currency: reads.currency,
        })
      : readAdAccount(adAccountSignalsFrom(reads));
    return { reading, isLoading: loading };
  }, [
    platform,
    onGoogle,
    adAccountId,
    currency,
    portfolios,
    accountsData,
    accountsFailed,
    approvalData,
    approvalFailed,
    approvalBusy,
    metricsStatus,
    metricsData,
    cardsState,
    campaignsData,
    campaignsError,
    campaignsBusy,
    resultBucket,
    readData,
    readFailed,
    readBusy,
    snapshotsData,
    snapshotsFailed,
    snapshotsBusy,
  ]);
}
