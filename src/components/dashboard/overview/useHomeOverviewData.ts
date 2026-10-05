'use client';

// Loads what the Home overview shows for the ad accounts in scope: account totals (last 7 days
// vs the 7 before), campaigns and ads ranked by the primary objective, a fresh image for the
// best and worst ad, and the brand's organic rollups. Each read fails on its own; a block whose
// read failed says so and the rest of the Home still renders.

import {
  datasetCreativeRefSchema,
  type HomeObjectiveMetric,
  type PaidRankedEntity,
} from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import { fetchJainaCreativePreview } from '@/lib/api/jainaCreativePreview.client';
import {
  type BrandOrganicSnapshot,
  loadBrandOrganicSnapshot,
  type SnapshotAccountRef,
} from '@/lib/organic/brandOrganicSnapshot';
import {
  fetchPaidAccountOverview,
  type PaidAccountOverview,
} from '@/lib/paid-media/paid-overview.client';
import { fetchPaidRanking } from '@/lib/paid-media/paid-ranking.client';
import { type OverviewTotals, rankingKpisFor, sumOverviews } from './homeOverviewModel';

const RANGE = { preset: 'last_7d' } as const;

export type HomeAdAccount = { id: string; name: string; currency: string | null };

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

export type RankedWithAccount = PaidRankedEntity & { adAccountId: string };

export type CreativeExtremes = {
  best: RankedWithAccount | null;
  worst: RankedWithAccount | null;
  images: Record<string, string | null>;
};

export function useAccountTotals(brandId: string, accounts: HomeAdAccount[]) {
  const [state, setState] = useState<Load<OverviewTotals>>({ status: 'loading' });
  const key = accounts.map((account) => account.id).join(',');

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    const ids = key ? key.split(',') : [];
    Promise.allSettled(
      ids.map((adAccountId) =>
        fetchPaidAccountOverview({ brandId, adAccountId, platform: 'meta', range: RANGE }),
      ),
    ).then((results) => {
      if (cancelled) return;
      const ok = results
        .filter((r): r is PromiseFulfilledResult<PaidAccountOverview> => r.status === 'fulfilled')
        .map((r) => r.value);
      setState(
        ok.length > 0 || ids.length === 0
          ? { status: 'ready', data: sumOverviews(ok) }
          : { status: 'error' },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, key]);

  return state;
}

async function rankAcross(
  brandId: string,
  accountIds: string[],
  scope: 'top_campaigns' | 'top_ads',
  kpi: Parameters<typeof fetchPaidRanking>[0]['kpi'],
  direction: 'top' | 'bottom',
  limit: number,
): Promise<RankedWithAccount[]> {
  const settled = await Promise.allSettled(
    accountIds.map((adAccountId) =>
      fetchPaidRanking({
        brandId,
        adAccountId,
        platform: 'meta',
        scope,
        kpi,
        direction,
        limit,
        range: RANGE,
      }).then((rows) => rows.map((row) => ({ ...row, adAccountId }))),
    ),
  );
  const rows = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (rows.length === 0 && settled.every((r) => r.status === 'rejected')) {
    throw new Error('ranking unavailable');
  }
  // Each account ranked its own rows; re-rank the union by the same KPI and direction.
  const lowerIsBetter =
    rows[0]?.kpi.startsWith('cost_per') || rows[0]?.kpi === 'cpc' || rows[0]?.kpi === 'cpm';
  const ascending = (direction === 'top') === Boolean(lowerIsBetter);
  return rows
    .sort((a, b) => (ascending ? a.kpi_value - b.kpi_value : b.kpi_value - a.kpi_value))
    .slice(0, limit);
}

export function useTopCampaigns(
  brandId: string,
  accounts: HomeAdAccount[],
  metric: HomeObjectiveMetric | null,
) {
  const [state, setState] = useState<Load<RankedWithAccount[]>>({ status: 'loading' });
  const key = accounts.map((account) => account.id).join(',');

  useEffect(() => {
    if (!metric) return;
    let cancelled = false;
    setState({ status: 'loading' });
    rankAcross(
      brandId,
      key ? key.split(',') : [],
      'top_campaigns',
      rankingKpisFor(metric).volume,
      'top',
      4,
    )
      .then((rows) => !cancelled && setState({ status: 'ready', data: rows }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [brandId, key, metric]);

  return state;
}

export function useCreativeExtremes(
  brandId: string,
  accounts: HomeAdAccount[],
  metric: HomeObjectiveMetric | null,
) {
  const [state, setState] = useState<Load<CreativeExtremes>>({ status: 'loading' });
  const key = accounts.map((account) => account.id).join(',');

  useEffect(() => {
    if (!metric) return;
    const { efficiency, volume } = rankingKpisFor(metric);
    const kpi = efficiency ?? volume;
    const ids = key ? key.split(',') : [];
    let cancelled = false;
    setState({ status: 'loading' });

    Promise.all([
      rankAcross(brandId, ids, 'top_ads', kpi, 'top', 1),
      rankAcross(brandId, ids, 'top_ads', kpi, 'bottom', 1),
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
  }, [brandId, key, metric]);

  return state;
}

export function useOrganicSnapshot(brandId: string, accounts: SnapshotAccountRef[]) {
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
  }, [brandId, stableAccounts]);

  return state;
}
