'use client';

// Horizontal per-competitor summary cards derived from the angle map's
// per-competitor rows. Clicking a card opens the competitor profile sheet.

import type { CompetitorAngleMapRow } from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { CompetitorProfileSheet } from './CompetitorProfileSheet';
import { humanize } from './gapPresentation';

export type CompetitorSummary = {
  competitorId: string;
  name: string;
  adsLive: number;
  topHook: string | null;
  topAngle: string | null;
  rows: CompetitorAngleMapRow[];
};

// Hooks partition ads (one archetype per ad), so summing activeAdCount over the
// hook_archetype rows approximates live ads without double counting; when a
// competitor has no labeled hooks yet, fall back to the max across dimensions.
export function summarizeCompetitors(rows: CompetitorAngleMapRow[]): CompetitorSummary[] {
  const byCompetitor = new Map<string, CompetitorAngleMapRow[]>();
  for (const row of rows) {
    if (!row.competitorId) continue;
    const list = byCompetitor.get(row.competitorId) ?? [];
    list.push(row);
    byCompetitor.set(row.competitorId, list);
  }

  const topValue = (
    competitorRows: CompetitorAngleMapRow[],
    dimension: CompetitorAngleMapRow['dimension'],
  ): string | null => {
    const candidates = competitorRows
      .filter((row) => row.dimension === dimension)
      .sort((a, b) => b.longevityWeightedShare - a.longevityWeightedShare);
    return candidates[0]?.value ?? null;
  };

  return [...byCompetitor.entries()]
    .map(([competitorId, competitorRows]) => {
      const hookRows = competitorRows.filter((row) => row.dimension === 'hook_archetype');
      const adsLive =
        hookRows.length > 0
          ? hookRows.reduce((sum, row) => sum + row.activeAdCount, 0)
          : Math.max(...competitorRows.map((row) => row.activeAdCount), 0);
      return {
        competitorId,
        name: competitorRows.find((row) => row.competitorName)?.competitorName ?? 'Unknown',
        adsLive,
        topHook: topValue(competitorRows, 'hook_archetype'),
        topAngle: topValue(competitorRows, 'angle'),
        rows: competitorRows,
      };
    })
    .sort((a, b) => b.adsLive - a.adsLive);
}

export function CompetitorSummaryStrip({
  brandId,
  rows,
}: {
  brandId: string;
  rows: CompetitorAngleMapRow[];
}) {
  const summaries = useMemo(() => summarizeCompetitors(rows), [rows]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = summaries.find((summary) => summary.competitorId === selectedId) ?? null;

  if (summaries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
        Per-competitor breakdowns appear once their ads are labeled.
      </p>
    );
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {summaries.map((summary) => (
          <button
            className="flex w-52 shrink-0 flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
            key={summary.competitorId}
            onClick={() => setSelectedId(summary.competitorId)}
            type="button"
          >
            <span className="truncate text-sm font-medium text-foreground">{summary.name}</span>
            <span className="text-2xs tabular-nums text-muted-foreground">
              {summary.adsLive} ads live
            </span>
            {summary.topHook ? (
              <span className="truncate text-2xs text-muted-foreground">
                Top hook: <span className="text-foreground">{humanize(summary.topHook)}</span>
              </span>
            ) : null}
            {summary.topAngle ? (
              <span className="truncate text-2xs text-muted-foreground">
                Top angle: <span className="text-foreground">{humanize(summary.topAngle)}</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <CompetitorProfileSheet
        brandId={brandId}
        competitor={selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}
