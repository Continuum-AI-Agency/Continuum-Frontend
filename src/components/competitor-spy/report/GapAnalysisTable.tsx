'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';

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
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  const columns: InsightColumn<CompetitiveGapRow>[] = useMemo(
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
      },
      {
        id: 'gap',
        header: localizeCompetitorCopy('Gap', uiText),
        cell: (row) => <GapBadge category={row.category} />,
      },
      {
        id: 'pressure',
        header: localizeCompetitorCopy('Competitor pressure', uiText),
        cell: (row) => (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="tabular-nums">
              {uiText('m_ae6a8b6bfd', {
                count: row.competitorEvidence.adCount,
              })}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {medianDays(row.competitorEvidence.medianLongevityDays, uiText)}
            </span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide',
                TIER_CLASS[row.competitorEvidence.tier],
              )}
            >
              {localizeCompetitorCopy(
                row.competitorEvidence.tier === 'scaling'
                  ? 'Scaling'
                  : row.competitorEvidence.tier === 'testing'
                    ? 'Testing'
                    : 'Fading',
                uiText,
              )}
            </span>
          </span>
        ),
      },
      {
        id: 'winRate',
        header: localizeCompetitorCopy('Your win rate', uiText),
        cell: (row) => (
          <span className="flex items-center gap-1.5">
            <span className="text-xs tabular-nums">
              {percent(row.ownEvidence?.winRate, uiLocale)}
            </span>
            {(row.ownEvidence?.flags ?? []).map((flag) => (
              <span
                className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-3xs text-amber-600 dark:text-amber-400"
                key={flag}
                title={uiText('treat_this_win_rate_with_care_see_the_attribu_82060da')}
              >
                {localizeCompetitorCopy(FLAG_LABEL[flag], uiText)}
              </span>
            ))}
          </span>
        ),
      },
      {
        id: 'evidence',
        header: localizeCompetitorCopy('Evidence', uiText),
        align: 'right',
        cell: (row) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {uiText.rich('sentence_f381846ce06c', {
              v0: () => row.competitorEvidence.adCount,
              v1: () => row.ownEvidence?.labeledAds ?? 0,
            })}
          </span>
        ),
      },
    ],
    [uiText, uiLocale],
  );

  return (
    <div className="space-y-2">
      <InsightDataTable
        columns={columns}
        emptyState={
          <p className="px-2 py-3 text-xs text-muted-foreground">
            {uiText('no_gaps_computed_yet_run_a_scan_184129e')}
          </p>
        }
        expandedContent={(row) => <GapEvidencePanel exemplars={report.exemplars} row={row} />}
        getRowId={(row) => `${row.dimension}:${row.value}:${row.category}`}
        rows={report.gaps}
        title={uiText('gap_analysis_ed1291b')}
      />
      <p className="px-1 text-3xs text-muted-foreground">{report.attributionNote}</p>
    </div>
  );
}
