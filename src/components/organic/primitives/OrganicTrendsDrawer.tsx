"use client"

import { TrendWorkbench } from "./TrendWorkbench"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { Trend } from "@/lib/organic/trends"

type OrganicTrendsDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trends: Trend[]
  selectedTrendIds: string[]
  activePlatforms: OrganicPlatformKey[]
  maxSelections?: number
  onToggleTrend: (trendId: string) => void
  onFetch?: () => void
  isFetching?: boolean
}

export function OrganicTrendsDrawer({
  open,
  onOpenChange,
  trends,
  selectedTrendIds,
  activePlatforms,
  maxSelections,
  onToggleTrend,
  onFetch,
  isFetching,
}: OrganicTrendsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[420px] flex-col gap-0 p-0 sm:max-w-[420px]"
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
            onFetch={onFetch}
            isFetching={isFetching}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
