'use client';

// Competitive Report orchestrator — the Brand Spy "Report" tab. Zero state →
// live scan progress → the assembled report sections (summary, hooks, angles,
// gaps, competitors). The scan hook is hoisted to CompetitorSpyClient so the
// stream survives tab switches; this view only presents it.

import type { CompetitiveGapReport, CompetitorAngleMap } from '@continuum/contracts';
import { Loader2, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { MetricStrip } from '@/components/shared/MetricStrip';
import { Button } from '@/components/ui/button';
import { useCompetitiveReport } from '@/lib/api/competitorSpy';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { CompetitorAngleMatrix } from './CompetitorAngleMatrix';
import { CompetitorPatternTable } from './CompetitorPatternTable';
import { CompetitorSummaryStrip } from './CompetitorSummaryStrip';
import { GapAnalysisTable } from './GapAnalysisTable';
import { RecentActivitySection } from './RecentActivitySection';
import { ScanLauncher } from './ScanLauncher';
import { ScanProgress } from './ScanProgress';
import type { CompetitorScan } from './useCompetitorScan';

const SECTIONS = [
  { id: 'summary', label: 'Summary' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'angles', label: 'Angles' },
  { id: 'gaps', label: 'Gaps' },
  { id: 'competitors', label: 'Competitors' },
] as const;

function sectionAnchorId(id: string): string {
  return `report-${id}`;
}

export function CompetitiveReportView({
  brandId,
  scan,
  onManageCompetitors,
  website,
}: {
  brandId: string;
  scan: CompetitorScan;
  onManageCompetitors: () => void;
  website?: string | null;
}) {
  const { data, isLoading } = useCompetitiveReport(brandId);
  const searchParams = useSearchParams();
  const scrolledRef = useRef(false);

  const report = data?.report ?? null;
  const angleMap = data?.angleMap ?? null;
  const hasReport = Boolean(report && angleMap);

  useEffect(() => {
    if (scrolledRef.current || !hasReport) return;
    const section = searchParams.get('section');
    if (!section) return;
    scrolledRef.current = true;
    document
      .getElementById(sectionAnchorId(section))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [searchParams, hasReport]);

  if (scan.running) {
    return (
      <div className="space-y-4">
        <ScanProgress scan={scan.state} />
        {report && angleMap ? (
          <ReportSections
            angleMap={angleMap}
            brandId={brandId}
            report={report}
            scan={scan}
            refreshedAt={data?.refreshedAt ?? null}
            stale
          />
        ) : null}
      </div>
    );
  }

  if (!data && isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-1/3 animate-pulse rounded-md bg-muted/70" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/70" />
        <div className="h-48 animate-pulse rounded-xl bg-muted/70" />
      </div>
    );
  }

  if (data?.status === 'assembling' && !hasReport) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />A scan is already assembling
        your report — it will appear here when ready.
      </div>
    );
  }

  const scanCompletedBefore = Boolean(data?.refreshedAt);
  const marketIsSparse =
    scanCompletedBefore &&
    (data?.status === 'ready' || data?.status === 'empty') &&
    (!report ||
      report.sourceCounts.competitorSnapshots === 0 ||
      !angleMap ||
      angleMap.rows.length === 0);

  if (marketIsSparse) {
    return <SparseMarketNotice onRescan={scan.start} />;
  }

  if (!hasReport) {
    return (
      <ScanLauncher
        onManageCompetitors={onManageCompetitors}
        onStart={scan.start}
        website={website}
      />
    );
  }

  return (
    <ReportSections
      angleMap={angleMap as CompetitorAngleMap}
      brandId={brandId}
      refreshedAt={data?.refreshedAt ?? null}
      report={report as CompetitiveGapReport}
      scan={scan}
    />
  );
}

function ReportSections({
  brandId,
  report,
  angleMap,
  scan,
  refreshedAt,
  stale = false,
}: {
  brandId: string;
  report: CompetitiveGapReport;
  angleMap: CompetitorAngleMap;
  scan: CompetitorScan;
  refreshedAt: string | null;
  stale?: boolean;
}) {
  const crossRows = angleMap.rows.filter((row) => row.competitorId === null);
  const hookRows = crossRows.filter((row) => row.dimension === 'hook_archetype');
  const angleRows = crossRows.filter((row) => row.dimension === 'angle');
  const funnelRows = crossRows.filter((row) => row.dimension === 'funnel_stage');

  return (
    <div className="space-y-6">
      <nav
        aria-label="Report sections"
        className="sticky top-0 z-10 -mx-1 flex gap-1.5 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur"
      >
        {SECTIONS.map((section) => (
          <button
            className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            key={section.id}
            onClick={() =>
              document
                .getElementById(sectionAnchorId(section.id))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            type="button"
          >
            {section.label}
          </button>
        ))}
      </nav>

      <section className="scroll-mt-12 space-y-3" id={sectionAnchorId('summary')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MetricStrip
            items={[
              { label: 'Competitors', value: String(report.sourceCounts.competitors) },
              { label: 'Ads analyzed', value: String(report.sourceCounts.competitorSnapshots) },
              { label: 'Gaps found', value: String(report.gaps.length) },
            ]}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {stale ? 'Refreshing — showing the last report. ' : ''}
              Scanned{' '}
              {refreshedAt
                ? formatRelativeTime(refreshedAt)
                : formatRelativeTime(report.generatedAt)}
            </span>
            <Button
              disabled={scan.running}
              onClick={scan.start}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Re-scan
            </Button>
          </div>
        </div>
      </section>

      <section className="scroll-mt-12" id={sectionAnchorId('hooks')}>
        <CompetitorPatternTable
          dimension="hook_archetype"
          exemplars={report.exemplars.competitor}
          rows={hookRows}
          title="Hooks they keep scaling"
        />
      </section>

      <section className="scroll-mt-12 space-y-3" id={sectionAnchorId('angles')}>
        <CompetitorPatternTable
          dimension="angle"
          exemplars={report.exemplars.competitor}
          funnelRows={funnelRows}
          rows={angleRows}
          title="Angles they keep scaling"
        />
        <div className="rounded-lg border border-border/70 bg-card p-3">
          <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Who scales which angle
          </p>
          <CompetitorAngleMatrix rows={angleMap.rows} />
        </div>
      </section>

      <section className="scroll-mt-12" id={sectionAnchorId('gaps')}>
        <GapAnalysisTable report={report} />
      </section>

      <section className="scroll-mt-12 space-y-3" id={sectionAnchorId('competitors')}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Competitors
        </h2>
        <CompetitorSummaryStrip brandId={brandId} rows={angleMap.rows} />
        <RecentActivitySection brandId={brandId} />
      </section>
    </div>
  );
}

function SparseMarketNotice({ onRescan }: { onRescan: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
      <p className="max-w-xl text-sm text-muted-foreground">
        Meta&apos;s Ad Library provides limited commercial ad coverage for your market — we found no
        competitor ads to analyze. Organic competitor tracking still works from the Inspiration tab.
      </p>
      <Button onClick={onRescan} size="sm" type="button" variant="outline">
        <RefreshCw aria-hidden="true" className="size-3.5" />
        Re-scan
      </Button>
    </div>
  );
}
