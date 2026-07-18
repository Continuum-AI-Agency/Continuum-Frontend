'use client';

// The gap report table — own-vs-competitor creative gaps, pre-sorted by
// severity on the backend (rows render as delivered; no client re-sort).

import type { CompetitiveGapReport, CompetitiveGapRow } from '@continuum/contracts';
import { useMemo } from 'react';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { cn } from '@/lib/utils';
import { GapBadge } from './GapBadge';
import { GapEvidencePanel } from './GapEvidencePanel';
import {
  DIMENSION_LABEL,
  FLAG_LABEL,
  humanize,
  medianDays,
  percent,
  TIER_CLASS,
} from './gapPresentation';

export function GapAnalysisTable({ report }: { report: CompetitiveGapReport }) {
  const columns: InsightColumn<CompetitiveGapRow>[] = useMemo(
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
      },
      {
        id: 'gap',
        header: 'Gap',
        cell: (row) => <GapBadge category={row.category} />,
      },
      {
        id: 'pressure',
        header: 'Competitor pressure',
        cell: (row) => (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="tabular-nums">{row.competitorEvidence.adCount} ads</span>
            <span className="tabular-nums text-muted-foreground">
              {medianDays(row.competitorEvidence.medianLongevityDays)}
            </span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide',
                TIER_CLASS[row.competitorEvidence.tier],
              )}
            >
              {row.competitorEvidence.tier}
            </span>
          </span>
        ),
      },
      {
        id: 'winRate',
        header: 'Your win rate',
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span className="text-xs tabular-nums">{percent(row.ownEvidence?.winRate)}</span>
            {(row.ownEvidence?.flags ?? []).map((flag) => (
              <span
                className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-3xs text-amber-600 dark:text-amber-400"
                key={flag}
                title="Treat this win-rate with care — see the attribution note below."
              >
                {FLAG_LABEL[flag]}
              </span>
            ))}
          </span>
        ),
      },
      {
        id: 'evidence',
        header: 'Evidence',
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.competitorEvidence.adCount} vs {row.ownEvidence?.labeledAds ?? 0} ads
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-2">
      <InsightDataTable
        columns={columns}
        emptyState={
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No gaps computed yet — run a scan.
          </p>
        }
        expandedContent={(row) => <GapEvidencePanel exemplars={report.exemplars} row={row} />}
        getRowId={(row) => `${row.dimension}:${row.value}:${row.category}`}
        rows={report.gaps}
        title="Gap analysis"
      />
      <p className="px-1 text-3xs text-muted-foreground">{report.attributionNote}</p>
    </div>
  );
}
