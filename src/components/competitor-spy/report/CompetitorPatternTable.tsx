'use client';

// "What they keep scaling" table for one angle-map dimension (cross-competitor
// rollup rows). Numbers are computed server-side (SQL angle-map RPC); this
// table only presents. Expanding a row shows the exemplar ads behind it.

import type { CompetitorAngleMapRow, GapCompetitorExemplar } from '@continuum/contracts';
import { useMemo } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { cn } from '@/lib/utils';
import { CompetitorExemplarStrip } from './CompetitorExemplarCard';
import { DIMENSION_LABEL, humanize, medianDays, percent, TIER_CLASS } from './gapPresentation';

export function CompetitorPatternTable({
  title,
  dimension,
  rows,
  exemplars,
  funnelRows,
}: {
  title: string;
  dimension: CompetitorAngleMapRow['dimension'];
  rows: CompetitorAngleMapRow[];
  exemplars: Record<string, GapCompetitorExemplar>;
  funnelRows?: CompetitorAngleMapRow[];
}) {
  const columns: InsightColumn<CompetitorAngleMapRow>[] = useMemo(
    () => [
      {
        id: 'category',
        header: 'Category',
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-muted px-1 py-px text-3xs text-muted-foreground">
              {DIMENSION_LABEL[row.dimension]}
            </span>
            <span className="truncate text-xs text-foreground">{humanize(row.value)}</span>
          </span>
        ),
        sortValue: (row) => row.value,
      },
      {
        id: 'competitors',
        header: 'Competitors',
        align: 'right',
        cell: (row) => <span className="text-xs tabular-nums">{row.competitorCount}</span>,
        sortValue: (row) => row.competitorCount,
      },
      {
        id: 'ads',
        header: 'Ads',
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums">
            {row.adCount}
            <span className="text-muted-foreground"> · {row.activeAdCount} active</span>
          </span>
        ),
        sortValue: (row) => row.adCount,
      },
      {
        id: 'scale',
        header: 'Scale',
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide',
                TIER_CLASS[row.tier],
              )}
            >
              {row.tier}
            </span>
            <span className="text-2xs tabular-nums text-muted-foreground">
              {medianDays(row.medianLongevityDays)}
            </span>
          </span>
        ),
        sortValue: (row) => row.medianLongevityDays,
      },
      {
        id: 'share',
        header: 'Share',
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums">{percent(row.longevityWeightedShare)}</span>
        ),
        sortValue: (row) => row.longevityWeightedShare,
      },
      {
        id: 'variants',
        header: 'Variants',
        align: 'right',
        cell: (row) => <span className="text-xs tabular-nums">{row.variantFamilies}</span>,
        sortValue: (row) => row.variantFamilies,
      },
    ],
    [],
  );

  return (
    <div className="space-y-2">
      {funnelRows && funnelRows.length > 0 ? <FunnelMixStrip rows={funnelRows} /> : null}
      <InsightDataTable
        columns={columns}
        defaultSort={{ columnId: 'share', direction: 'desc' }}
        emptyState={
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nothing labeled in this dimension yet.
          </p>
        }
        expandedContent={(row) => (
          <CompetitorExemplarStrip
            exemplars={row.exemplarSnapshotIds
              .map((snapshotId) => exemplars[snapshotId])
              .filter((exemplar): exemplar is GapCompetitorExemplar => Boolean(exemplar))}
          />
        )}
        getRowId={(row) => `${row.dimension}:${row.value}`}
        rows={rows}
        title={title}
      />
    </div>
  );
}

// Compact funnel-stage distribution (cross-rollup funnel_stage rows) shown
// above a pattern table — where competitor pressure sits in the funnel.
function FunnelMixStrip({ rows }: { rows: CompetitorAngleMapRow[] }) {
  const sorted = [...rows].sort((a, b) => b.longevityWeightedShare - a.longevityWeightedShare);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">Funnel mix</span>
      {sorted.map((row) => (
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-2xs tabular-nums text-muted-foreground"
          key={row.value}
        >
          <span className="uppercase">{humanize(row.value)}</span>{' '}
          {percent(row.longevityWeightedShare)}
        </span>
      ))}
    </div>
  );
}
