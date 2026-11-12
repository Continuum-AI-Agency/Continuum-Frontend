'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatCompetitorNumber } from '@/components/competitor-spy/brandVisuals';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';

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
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  const columns: InsightColumn<CompetitorAngleMapRow>[] = useMemo(
    () => [
      {
        id: 'category',
        header: localizeCompetitorCopy('Category', uiText),
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-muted px-1 py-px text-3xs text-muted-foreground">
              {localizeCompetitorCopy(DIMENSION_LABEL[row.dimension], uiText)}
            </span>
            <span className="truncate text-xs text-foreground">{humanize(row.value)}</span>
          </span>
        ),
        sortValue: (row) => row.value,
      },
      {
        id: 'competitors',
        header: localizeCompetitorCopy('Competitors', uiText),
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums">
            {formatCompetitorNumber(row.competitorCount, uiLocale)}
          </span>
        ),
        sortValue: (row) => row.competitorCount,
      },
      {
        id: 'ads',
        header: localizeCompetitorCopy('Ads', uiText),
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums">
            {formatCompetitorNumber(row.adCount, uiLocale)}
            <span className="text-muted-foreground">
              {uiText.rich('sentence_db381b75504e', {
                v0: () => row.activeAdCount,
              })}
            </span>
          </span>
        ),
        sortValue: (row) => row.adCount,
      },
      {
        id: 'scale',
        header: localizeCompetitorCopy('Scale', uiText),
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide',
                TIER_CLASS[row.tier],
              )}
            >
              {localizeCompetitorCopy(
                row.tier === 'scaling' ? 'Scaling' : row.tier === 'testing' ? 'Testing' : 'Fading',
                uiText,
              )}
            </span>
            <span className="text-2xs tabular-nums text-muted-foreground">
              {medianDays(row.medianLongevityDays, uiText)}
            </span>
          </span>
        ),
        sortValue: (row) => row.medianLongevityDays,
      },
      {
        id: 'share',
        header: localizeCompetitorCopy('Share', uiText),
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums">
            {percent(row.longevityWeightedShare, uiLocale)}
          </span>
        ),
        sortValue: (row) => row.longevityWeightedShare,
      },
      {
        id: 'variants',
        header: localizeCompetitorCopy('Variants', uiText),
        align: 'right',
        cell: (row) => <span className="text-xs tabular-nums">{row.variantFamilies}</span>,
        sortValue: (row) => row.variantFamilies,
      },
    ],
    [uiText, uiLocale],
  );

  return (
    <div className="space-y-2">
      {funnelRows && funnelRows.length > 0 ? <FunnelMixStrip rows={funnelRows} /> : null}
      <InsightDataTable
        columns={columns}
        defaultSort={{ columnId: 'share', direction: 'desc' }}
        emptyState={
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {uiText('nothing_labeled_in_this_dimension_yet_729cce7')}
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
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  const sorted = [...rows].sort((a, b) => b.longevityWeightedShare - a.longevityWeightedShare);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs uppercase tracking-wide text-muted-foreground">
        {uiText('funnel_mix_1465189')}
      </span>
      {sorted.map((row) => (
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-2xs tabular-nums text-muted-foreground"
          key={row.value}
        >
          <span className="uppercase">{humanize(row.value)}</span>{' '}
          {percent(row.longevityWeightedShare, uiLocale)}
        </span>
      ))}
    </div>
  );
}
