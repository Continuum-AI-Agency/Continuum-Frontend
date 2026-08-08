import type { ReactNode } from 'react';
import { BrandInsightsGenerateButton } from '@/components/brand-insights/BrandInsightsGenerateButton';
import { SendPulseButton } from '@/components/dashboard/SendPulseButton';

type DashboardBriefingProps = {
  brandId: string;
  lastGeneratedAt?: string;
  // A quiet KPI strip under the header. Left column: the account insights list.
  // Right column: the top creatives.
  metricStripSlot?: ReactNode;
  insightsSlot?: ReactNode;
  creativesSlot?: ReactNode;
};

// The lead value moment for the home board: an "Overview" header + manual
// refresh, the headline KPI strip, then the account insights beside the top
// creatives. Each module carries its own jump-to-workspace shortcut; trends live
// in the Brand Trends data table below.
export function DashboardBriefing({
  brandId,
  lastGeneratedAt,
  metricStripSlot,
  insightsSlot,
  creativesSlot,
}: DashboardBriefingProps) {
  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-2 px-[var(--card-pad)] py-[var(--section-header-pad-block)]">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Overview</h2>
          <p className="text-xs text-muted-foreground">Your weekly signal. Pick your next move.</p>
        </div>
        <div className="flex items-center gap-2">
          <SendPulseButton brandId={brandId} />
          <BrandInsightsGenerateButton
            brandId={brandId}
            lastGeneratedAt={lastGeneratedAt}
            subtle
            force
          />
        </div>
      </div>

      {metricStripSlot}

      {/* Two panes sharing one hairline: a vertical rule once they sit side by
          side, a horizontal one while they are stacked. Never both, never a gap. */}
      <div
        data-tour-id="dashboard-top-content"
        className="grid grid-cols-1 items-stretch divide-y divide-border border-y border-border lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:divide-x lg:divide-y-0"
      >
        {insightsSlot}
        {creativesSlot}
      </div>
    </section>
  );
}
