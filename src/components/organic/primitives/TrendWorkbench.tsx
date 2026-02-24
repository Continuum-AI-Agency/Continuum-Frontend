"use client"

import * as React from "react"
import {
  CheckIcon,
  LightningBoltIcon,
  RocketIcon,
  RowsIcon,
} from "@radix-ui/react-icons"
import { FilterIcon, GripVerticalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { Trend } from "@/lib/organic/trends"
import { cn } from "@/lib/utils"

type TrendWorkbenchProps = {
  trends: Trend[]
  selectedTrendIds: string[]
  activePlatforms: OrganicPlatformKey[]
  maxSelections?: number
  isGenerating: boolean
  onToggleTrend: (trendId: string) => void
  onSeedSelected: () => void
  onSeedAndFill: () => void
  onSeedSingleTrend: (trend: Trend) => void
  onSeedAndFillFromTrend: (trend: Trend) => void
}

export function TrendWorkbench({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxSelections,
  isGenerating,
  onToggleTrend,
  onSeedSelected,
  onSeedAndFill,
  onSeedSingleTrend,
  onSeedAndFillFromTrend,
}: TrendWorkbenchProps) {
  const [query, setQuery] = React.useState("")

  const normalizedQuery = query.trim().toLowerCase()

  const filteredTrends = React.useMemo(() => {
    return trends
      .filter((trend) => {
        if (!normalizedQuery) return true
        return (
          trend.title.toLowerCase().includes(normalizedQuery) ||
          trend.summary.toLowerCase().includes(normalizedQuery)
        )
      })
      .sort((a, b) => {
        const aFit = a.platforms.filter((platform) => activePlatforms.includes(platform)).length
        const bFit = b.platforms.filter((platform) => activePlatforms.includes(platform)).length
        if (aFit !== bFit) return bFit - aFit

        return a.title.localeCompare(b.title)
      })
  }, [activePlatforms, normalizedQuery, trends])

  const selectedCount = selectedTrendIds.length
  const selectedLabel =
    typeof maxSelections === "number" ? `${selectedCount}/${maxSelections}` : `${selectedCount}`

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <section className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Trends Workbench
              </p>
              <p className="text-[11px] text-muted-foreground">
                Select, seed, and fill your week from clean trend topics.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {selectedLabel} selected
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="trend-workbench-seed"
                disabled={isGenerating || selectedCount === 0}
                onClick={onSeedSelected}
              >
                <RowsIcon className="mr-1 h-3.5 w-3.5" />
                Seed
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="trend-workbench-seed-fill"
                disabled={isGenerating || selectedCount === 0}
                className="bg-orange-500 text-white hover:bg-orange-500/90"
                onClick={onSeedAndFill}
              >
                {isGenerating ? (
                  <LightningBoltIcon className="mr-1 h-3.5 w-3.5 animate-pulse" />
                ) : (
                  <RocketIcon className="mr-1 h-3.5 w-3.5" />
                )}
                Seed / Fill
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="relative">
              <FilterIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search trends, events, and questions..."
                className="h-8 pl-7 text-xs"
              />
            </div>

            <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border bg-background/40">
              <div className="space-y-2 p-2">
                {filteredTrends.map((trend) => {
                  const isSelected = selectedTrendIds.includes(trend.id)

                    const handleDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
                      event.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({
                          type: "trend",
                          trendId: trend.id,
                          title: trend.title,
                        })
                      )
                      event.dataTransfer.effectAllowed = "copy"
                    }

                  return (
                    <ContextMenu key={trend.id}>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          draggable
                          onDragStart={handleDragStart}
                          onClick={() => onToggleTrend(trend.id)}
                          className={cn(
                            "group w-full rounded-md border border-border/80 bg-card p-2 text-left transition",
                            "hover:border-orange-300/70 hover:bg-orange-50/40 dark:hover:bg-orange-950/20",
                            isSelected && "border-orange-400 bg-orange-50/70 dark:bg-orange-950/30"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-foreground">{trend.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                                {trend.summary}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {isSelected ? (
                                <span className="rounded-full bg-orange-500/15 p-1 text-orange-600">
                                  <CheckIcon className="h-3 w-3" />
                                </span>
                              ) : null}
                              <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground/70" />
                            </div>
                          </div>
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        <ContextMenuLabel>{trend.title}</ContextMenuLabel>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => onToggleTrend(trend.id)}>
                          {isSelected ? "Remove from selected" : "Add to selected"}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => onSeedSingleTrend(trend)}>
                          Seed placeholder from trend
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => onSeedAndFillFromTrend(trend)}>
                          Seed + fill from this trend
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}

                {filteredTrends.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No trends match this search.
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>
        </section>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuLabel>Trend Workbench</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={isGenerating || selectedCount === 0}
          onSelect={onSeedSelected}
        >
          Seed selected trends
        </ContextMenuItem>
        <ContextMenuItem
          disabled={isGenerating || selectedCount === 0}
          onSelect={onSeedAndFill}
        >
          Seed and fill selected trends
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
