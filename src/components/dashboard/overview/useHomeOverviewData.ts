'use client';

// Loads what the Home overview shows for the ad accounts in scope — Meta ad accounts and Google
// Ads customers: account totals (the last 7 complete days vs the 7 before), campaigns ranked by
// the primary objective, the best and worst Meta ad with a fresh image, and the brand's organic
// rollups. Each read fails on its own; a block whose read failed says so and the rest of the
// Home still renders.

import {
  datasetCreativeRefSchema,
  type HomeObjectiveMetric,
  type PaidEntityKpi,
  type PaidRankedEntity,
} from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import { fetchJainaCreativePreview } from '@/lib/api/jainaCreativePreview.client';
import {
  type BrandOrganicSnapshot,
  loadBrandOrganicSnapshot,
  type SnapshotAccountRef,
} from '@/lib/organic/brandOrganicSnapshot';
import { kpiUnit } from '@/lib/paid-media/paid-kpi';
import { fetchPaidAccountOverview } from '@/lib/paid-media/paid-overview.client';
import { fetchPaidRanking } from '@/lib/paid-media/paid-ranking.client';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import { lastCompleteDays } from '@/lib/paid-media/reportingWindow';
import {
  type CurrencyGroup,
  GOOGLE_HOME_RESULTS,
  type GoogleHomeResult,
  googleOverviewForHome,
  googleVolumeRanking,
  type HomeAccountOverview,
  rankingKpisFor,
  totalsByCurrency,
} from './homeOverviewModel';

// The seven complete days ending yesterday, asked as an explicit range: the edge's `last_7d`
// is [now − 7d, now], eight days with today half-written (PP-L3-last-7d-asks-eight-days-
// including-today). Read per call, not once at import, because yesterday moves at midnight.
const homeRange = () => lastCompleteDays(7);

export type HomeAdPlatform = 'meta' | 'google_ads';

/** An ad account the Home reads. `currency` is what its account row stores, null when the row
 *  has none; the read then names it (useAccountTotals' `currencyOf`). */
export type HomeAdAccount = {
  id: string;
  name: string;
  currency: string | null;
  platform: HomeAdPlatform;
};

/** The platform name the paid-media edge routes on. */
const EDGE_PLATFORM: Record<HomeAdPlatform, PaidMediaPlatform> = {
  meta: 'meta',
  google_ads: 'google-ads',
};

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

export type RankedWithAccount = PaidRankedEntity & { adAccountId: string };

export type CreativeExtremes = {
  best: RankedWithAccount | null;
  worst: RankedWithAccount | null;
  images: Record<string, string | null>;
};

export type HomeTotals = {
  /** Per currency, the currency the Home leads with first: money is never added across them. */
  groups: CurrencyGroup[];
  /** Each account that answered: its row's currency, else the one its read was labelled with. */
  currencyOf: Record<string, string | null>;
};

/** The accounts as a stable value: a new array holding the same accounts does not read again. */
function useStableAccounts(accounts: HomeAdAccount[]): HomeAdAccount[] {
  const key = JSON.stringify(
    accounts.map((account) => [account.id, account.name, account.currency, account.platform]),
  );
  return useMemo(
    () =>
      (JSON.parse(key) as [string, string, string | null, HomeAdPlatform][]).map(
        ([id, name, currency, platform]) => ({ id, name, currency, platform }),
      ),
    [key],
  );
}

/** One account's read in the Home's words. Google counts one business result per read, so a
 *  Google account is read once per result the Home shows, and answers only when every read does. */
async function readAccount(brandId: string, account: HomeAdAccount): Promise<HomeAccountOverview> {
  const range = homeRange();
  if (account.platform === 'meta') {
    return fetchPaidAccountOverview({ brandId, adAccountId: account.id, platform: 'meta', range });
  }
  const [leads, purchases] = await Promise.all(
    GOOGLE_HOME_RESULTS.map((resultBucket: GoogleHomeResult) =>
      fetchPaidAccountOverview({
        brandId,
        adAccountId: account.id,
        platform: 'google-ads',
        range,
        resultBucket,
      }),
    ),
  );
  return googleOverviewForHome({ leads: leads ?? null, purchases: purchases ?? null });
}

/** `attempt` is Retry's counter: bumping it re-runs the read with the same inputs. An account
 *  whose read fails is left out; the totals fail only when no account answers. */
export function useAccountTotals(brandId: string, accounts: HomeAdAccount[], attempt = 0) {
  const [state, setState] = useState<Load<HomeTotals>>({ status: 'loading' });
  const stable = useStableAccounts(accounts);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    Promise.allSettled(stable.map((account) => readAccount(brandId, account))).then((results) => {
      if (cancelled) return;
      const reads = results.flatMap((result, index) => {
        const account = stable[index];
        return result.status === 'fulfilled' && account
          ? [{ account, overview: result.value }]
          : [];
      });
      if (reads.length === 0 && stable.length > 0) {
        setState({ status: 'error' });
        return;
      }
      const currencyOf: Record<string, string | null> = {};
      for (const { account, overview } of reads) {
        currencyOf[account.id] = account.currency ?? overview.currency ?? null;
      }
      setState({
        status: 'ready',
        data: {
          groups: totalsByCurrency(
            reads.map(({ account, overview }) => ({
              currency: currencyOf[account.id] ?? null,
              overview,
            })),
          ),
          currencyOf,
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, stable, attempt]);

  return state;
}

type RankingRequest = {
  account: HomeAdAccount;
  kpi: PaidEntityKpi;
  resultBucket?: GoogleHomeResult;
};

/**
 * `leadCurrency` is the currency the Home leads with (useAccountTotals): a KPI in money ranks only
 * the accounts that report in it, because a cost in MXN and one in USD do not order. Left out,
 * every account ranks.
 */
async function rankAcross(
  brandId: string,
  requests: RankingRequest[],
  scope: 'top_campaigns' | 'top_ads',
  direction: 'top' | 'bottom',
  limit: number,
  leadCurrency: string | null | undefined,
): Promise<RankedWithAccount[]> {
  const ranked =
    leadCurrency === undefined
      ? requests
      : requests.filter(
          (request) =>
            kpiUnit(request.kpi) !== 'currency' || request.account.currency === leadCurrency,
        );
  // No account to rank (a goal Google does not report, a Google-only brand's ads) is nothing to
  // rank, not a failure: `every` over an empty list is true, which used to turn this case into
  // "Couldn't load … right now".
  if (ranked.length === 0) return [];
  const settled = await Promise.allSettled(
    ranked.map(({ account, kpi, resultBucket }) =>
      fetchPaidRanking({
        brandId,
        adAccountId: account.id,
        platform: EDGE_PLATFORM[account.platform],
        scope,
        kpi,
        direction,
        limit,
        range: homeRange(),
        ...(resultBucket ? { resultBucket } : {}),
      }).then((rows) => rows.map((row) => ({ ...row, adAccountId: account.id }))),
    ),
  );
  const rows = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (rows.length === 0 && settled.every((r) => r.status === 'rejected')) {
    throw new Error('ranking unavailable');
  }
  // Each account ranked its own rows; re-rank the union by the same KPI and direction. The KPI is
  // the one asked for (Meta's "leads" and Google's "conversions" of leads order the same way).
  const [first] = ranked;
  const lowerIsBetter =
    first !== undefined &&
    (first.kpi.startsWith('cost_per') || first.kpi === 'cpc' || first.kpi === 'cpm');
  const ascending = (direction === 'top') === lowerIsBetter;
  return rows
    .sort((a, b) => (ascending ? a.kpi_value - b.kpi_value : b.kpi_value - a.kpi_value))
    .slice(0, limit);
}

/** What each account ranks campaigns on for a goal: Meta its own KPI, Google the goal's business
 *  result as conversions; a Google account has nothing to rank for a goal it does not report. */
function campaignRequests(
  accounts: HomeAdAccount[],
  metric: HomeObjectiveMetric,
): RankingRequest[] {
  return accounts.flatMap((account) => {
    if (account.platform === 'meta') return [{ account, kpi: rankingKpisFor(metric).volume }];
    const google = googleVolumeRanking(metric);
    return google ? [{ account, ...google }] : [];
  });
}

/** How many of the accounts can rank campaigns for the goal. */
export function campaignRankableCount(
  accounts: HomeAdAccount[],
  metric: HomeObjectiveMetric | null,
): number {
  return metric ? campaignRequests(accounts, metric).length : accounts.length;
}

export function useTopCampaigns(
  brandId: string,
  accounts: HomeAdAccount[],
  metric: HomeObjectiveMetric | null,
  attempt = 0,
  leadCurrency?: string | null,
) {
  const [state, setState] = useState<Load<RankedWithAccount[]>>({ status: 'loading' });
  const stable = useStableAccounts(accounts);

  useEffect(() => {
    if (!metric) return;
    let cancelled = false;
    setState({ status: 'loading' });
    rankAcross(brandId, campaignRequests(stable, metric), 'top_campaigns', 'top', 4, leadCurrency)
      .then((rows) => !cancelled && setState({ status: 'ready', data: rows }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [brandId, stable, metric, attempt, leadCurrency]);

  return state;
}

/** Creative + ranks image ads, which only Meta accounts serve here: a Google ad is text or an
 *  asset group with no image to show. */
export function useCreativeExtremes(
  brandId: string,
  accounts: HomeAdAccount[],
  metric: HomeObjectiveMetric | null,
  attempt = 0,
  leadCurrency?: string | null,
) {
  const [state, setState] = useState<Load<CreativeExtremes>>({ status: 'loading' });
  const stable = useStableAccounts(accounts);

  useEffect(() => {
    if (!metric) return;
    const { efficiency, volume } = rankingKpisFor(metric);
    const kpi = efficiency ?? volume;
    const requests = stable
      .filter((account) => account.platform === 'meta')
      .map((account) => ({ account, kpi }));
    let cancelled = false;
    setState({ status: 'loading' });

    Promise.all([
      rankAcross(brandId, requests, 'top_ads', 'top', 1, leadCurrency),
      rankAcross(brandId, requests, 'top_ads', 'bottom', 1, leadCurrency),
    ])
      .then(async ([top, bottom]) => {
        const best = top[0] ?? null;
        const worst = bottom[0] && bottom[0].id !== best?.id ? bottom[0] : null;
        const images: Record<string, string | null> = {};
        await Promise.all(
          [best, worst]
            .filter((row): row is RankedWithAccount => row !== null)
            .map(async (row) => {
              try {
                const preview = await fetchJainaCreativePreview(
                  datasetCreativeRefSchema.parse({
                    brand_id: brandId,
                    ad_account_id: row.adAccountId,
                    ad_id: row.id,
                  }),
                );
                images[row.id] = preview.image_url ?? preview.thumbnail_url;
              } catch {
                images[row.id] = null;
              }
            }),
        );
        if (!cancelled) setState({ status: 'ready', data: { best, worst, images } });
      })
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [brandId, stable, metric, attempt, leadCurrency]);

  return state;
}

export function useOrganicSnapshot(brandId: string, accounts: SnapshotAccountRef[], attempt = 0) {
  const [state, setState] = useState<Load<BrandOrganicSnapshot>>({ status: 'loading' });
  const key = accounts
    .map((account) => `${account.platform}|${account.integrationAccountId}|${account.name}`)
    .join(',');
  // Rebuilt from the key so a new array with the same accounts does not refetch.
  const stableAccounts = useMemo<SnapshotAccountRef[]>(
    () =>
      key
        ? key.split(',').map((entry) => {
            const [platform, integrationAccountId, ...name] = entry.split('|');
            return {
              platform: platform as SnapshotAccountRef['platform'],
              integrationAccountId: integrationAccountId ?? '',
              name: name.join('|'),
            };
          })
        : [],
    [key],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadBrandOrganicSnapshot({ brandId, accounts: stableAccounts, rangePreset: 'last_7d' })
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [brandId, stableAccounts, attempt]);

  return state;
}
