'use client';

// One competitor's profile: header stats, hook/angle bar rows from their
// angle-map rows, and their live ad snapshots.

import { MetricStrip } from '@/components/shared/MetricStrip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AdSnapshotGrid } from '../AdSnapshotGrid';
import { CountList } from '../AwarenessReportView';
import type { CompetitorSummary } from './CompetitorSummaryStrip';
import { humanize } from './gapPresentation';

export function CompetitorProfileSheet({
  brandId,
  competitor,
  onOpenChange,
}: {
  brandId: string;
  competitor: CompetitorSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(competitor)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {competitor ? (
          <>
            <SheetHeader>
              <SheetTitle>{competitor.name}</SheetTitle>
              <SheetDescription>
                What this competitor keeps scaling in the Meta Ad Library.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <MetricStrip
                items={[
                  { label: 'Ads live', value: String(competitor.adsLive) },
                  ...(competitor.topHook
                    ? [{ label: 'Top hook', value: humanize(competitor.topHook) }]
                    : []),
                  ...(competitor.topAngle
                    ? [{ label: 'Top angle', value: humanize(competitor.topAngle) }]
                    : []),
                ]}
              />

              <DimensionBars
                competitorRows={competitor.rows}
                dimension="hook_archetype"
                title="Hooks"
              />
              <DimensionBars competitorRows={competitor.rows} dimension="angle" title="Angles" />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Live ads
                </h3>
                <AdSnapshotGrid
                  brandId={brandId}
                  competitorId={competitor.competitorId}
                  limit={20}
                />
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DimensionBars({
  title,
  dimension,
  competitorRows,
}: {
  title: string;
  dimension: CompetitorSummary['rows'][number]['dimension'];
  competitorRows: CompetitorSummary['rows'];
}) {
  const items = competitorRows
    .filter((row) => row.dimension === dimension)
    .sort((a, b) => b.adCount - a.adCount)
    .map((row) => ({ label: row.value, count: row.adCount }));

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <CountList items={items} />
    </section>
  );
}
