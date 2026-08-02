'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { Trend } from '@/lib/organic/trends';
import { TrendWorkbench } from './TrendWorkbench';

type OrganicTrendsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trends: Trend[];
  selectedTrendIds: string[];
  activePlatforms: OrganicPlatformKey[];
  maxSelections?: number;
  onToggleTrend: (trendId: string) => void;
  onGenerateFromTrend?: (trend: Trend) => void;
  onFetch?: () => void;
  isFetching?: boolean;
  /** Set when the server-side trend fetch failed, so the workbench can say so. */
  insightsError?: string | null;
  /** Required by the workbench's per-trend citations query; without it, it stays disabled. */
  brandProfileId?: string;
};

export function OrganicTrendsDrawer({
  open,
  onOpenChange,
  trends,
  selectedTrendIds,
  activePlatforms,
  maxSelections,
  onToggleTrend,
  onGenerateFromTrend,
  onFetch,
  isFetching,
  insightsError,
  brandProfileId,
}: OrganicTrendsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[clamp(320px,80vw,480px)] flex-col gap-0 p-0 sm:max-w-[clamp(320px,80vw,480px)]"
      >
        <SheetHeader className="shrink-0 border-b border-border/50 px-4 py-3">
          <SheetTitle className="text-sm font-semibold">Trends &amp; Signals</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <TrendWorkbench
            trends={trends}
            selectedTrendIds={selectedTrendIds}
            activePlatforms={activePlatforms}
            maxSelections={maxSelections}
            onToggleTrend={onToggleTrend}
            onGenerateFromTrend={onGenerateFromTrend}
            onFetch={onFetch}
            isFetching={isFetching}
            insightsError={insightsError}
            brandProfileId={brandProfileId}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
