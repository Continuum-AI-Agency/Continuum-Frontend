'use client';

// Read-only account baseline shown before portfolio creation. Allocation and
// recommendations are computed only by the backend optimizer after creation.
//
// A sortable, name-first InsightDataTable (the raw <table> is gone). When a caller
// threads brandId/accountId, each ad-set row EXPANDS to the ads inside it — creative
// thumbnails + the labeler's angle chips — so an operator can explore the ad sets
// (and the ads within them) before creating, the §7 requirement. Without those
// props the table is still sortable and name-first, just without the drill-in.

import type { AdSetSnapshot, OptimizationObjective } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { useMemo } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { Skeleton } from '@/components/ui/skeleton';
import { AdThumb } from '../AdThumb';
import { AdSetIdLabel } from '../charts/AdSetIdLabel';
import { formatCpa, formatCurrency } from '../format';
import { type OptimizerAdsetRow, snapshotToRow } from '../kpiColumns';
import { useOptimizerAdAngles, useOptimizerAdsetAds } from '../useOptimizerData';
import { AngleChip } from './AdsetCreativeVerdicts';

const DASH = '—';

type PortfolioPreviewProps = {
  snapshots: AdSetSnapshot[];
  objective: OptimizationObjective;
  currency?: string | null;
  /** Threading these turns on the per-ad-set drill-in (ads + thumbnails + angles). */
  brandId?: string;
  accountId?: string | null;
};

export function PortfolioPreview({
  snapshots,
  objective,
  currency,
  brandId,
  accountId,
}: PortfolioPreviewProps) {
  const metric = getOptimizationMetricDefinition(objective);
  const rows = useMemo(
    () => snapshots.map((snapshot) => snapshotToRow(snapshot, { metric })),
    [snapshots, metric],
  );

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No ad-set metrics to preview yet for this group.
      </p>
    );
  }

  const canDrill = Boolean(brandId && accountId);

  const columns: InsightColumn<OptimizerAdsetRow>[] = [
    {
      id: 'name',
      header: 'Ad set',
      align: 'left',
      sortValue: (row) => (row.name ?? row.adsetId).toLowerCase(),
      cell: (row) => (
        <AdSetIdLabel
          className="w-full max-w-[14rem]"
          id={row.adsetId}
          name={row.name ?? undefined}
        />
      ),
    },
    {
      id: 'budget',
      header: 'Budget',
      align: 'right',
      sortValue: (row) => row.currentBudget ?? 0,
      cell: (row) => formatCurrency(row.currentBudget, currency),
    },
    {
      id: 'spend',
      header: 'Spend 14d',
      align: 'right',
      sortValue: (row) => row.spend ?? 0,
      cell: (row) => formatCurrency(row.spend, currency),
    },
    {
      id: 'cost',
      header: metric.costLabel,
      align: 'right',
      sortValue: (row) => row.cost ?? -1,
      cell: (row) => (row.cost != null ? formatCpa(row.cost, currency) : DASH),
    },
  ];

  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs font-semibold text-muted-foreground">Ad sets today</p>
        <span className="text-3xs text-muted-foreground">
          Recommendations are calculated by the backend after creation
        </span>
      </div>
      <InsightDataTable
        columns={columns}
        defaultSort={{ columnId: 'spend', direction: 'desc' }}
        expandedContent={
          canDrill
            ? (row) => (
                <PreviewAdsDrillIn
                  accountId={accountId ?? null}
                  adsetId={row.adsetId}
                  brandId={brandId as string}
                />
              )
            : undefined
        }
        getRowId={(row) => row.adsetId}
        rows={rows}
      />
    </div>
  );
}

function PreviewAdsDrillIn({
  brandId,
  accountId,
  adsetId,
}: {
  brandId: string;
  accountId: string | null;
  adsetId: string;
}) {
  const adsQuery = useOptimizerAdsetAds(brandId, accountId, adsetId);
  const anglesQuery = useOptimizerAdAngles(brandId, accountId, adsetId);
  const angleByAd = useMemo(
    () => new Map(anglesQuery.data.map((angle) => [angle.ad_id, angle])),
    [anglesQuery.data],
  );

  if (adsQuery.isLoading) {
    return (
      <div className="space-y-1">
        <Skeleton className="h-7 rounded-md" />
        <Skeleton className="h-7 w-2/3 rounded-md" />
      </div>
    );
  }
  if (adsQuery.isError) {
    return <p className="text-2xs text-warning">Couldn&rsquo;t load the ads in this ad set.</p>;
  }
  if (adsQuery.data.length === 0) {
    return <p className="text-2xs text-muted-foreground">No ads in this ad set.</p>;
  }

  return (
    <ul className="space-y-1">
      {adsQuery.data.map((ad) => {
        const angle = angleByAd.get(ad.id);
        return (
          <li className="flex items-center gap-2" key={ad.id}>
            <AdThumb
              accountId={accountId}
              adId={ad.id}
              adName={ad.name}
              brandId={brandId}
              thumbnailUrl={ad.thumbnailUrl}
            />
            <span className="min-w-0 flex-1 truncate text-2xs text-foreground">
              {ad.name || ad.id}
            </span>
            {angle ? <AngleChip angle={angle} /> : null}
            {ad.status ? (
              <span className="shrink-0 text-3xs text-muted-foreground uppercase tracking-wide">
                {ad.status.toLowerCase()}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
