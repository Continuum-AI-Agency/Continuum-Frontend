"use client"

import * as React from "react"
import {
  CheckIcon,
  LightningBoltIcon,
  UpdateIcon,
} from "@radix-ui/react-icons"
import { GripVerticalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import type { Trend } from "@/lib/organic/trends"
import { cn } from "@/lib/utils"

const PLATFORM_DISPLAY_NAME: Record<OrganicPlatformKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  youtube: "YouTube",
}

type TrendWorkbenchProps = {
  trends: Trend[]
  selectedTrendIds: string[]
  activePlatforms: OrganicPlatformKey[]
  maxSelections?: number
  onToggleTrend: (trendId: string) => void
  onFetch?: () => void
  isFetching?: boolean
}

type TrendTypeFilter = "all" | "event" | "question" | "trend"
type TrendMomentumFilter = "all" | Trend["momentum"]
type TrendScopeFilter = "all" | "selected" | "active-platform"
type ResolvedTrendType = "event" | "question" | "trend"
type IndexedTrend = {
  trend: Trend
  trendType: ResolvedTrendType
  normalizedTitle: string
  normalizedSummary: string
  normalizedTags: string
}

type TrendTableRowProps = {
  trend: Trend
  isSelected: boolean
  trendType: ResolvedTrendType
  onToggleTrend: (trendId: string) => void
  resolveMomentumTone: (momentum: Trend["momentum"]) => string
}

const TrendTableRow = React.memo(function TrendTableRow({
  trend,
  isSelected,
  trendType,
  onToggleTrend,
  resolveMomentumTone,
}: TrendTableRowProps) {
  const handleDragStart = React.useCallback(
    (event: React.DragEvent<HTMLTableRowElement>) => {
      event.dataTransfer.setData(
        "application/json",
        JSON.stringify({
          type: trendType,
          trendId: trend.id,
          title: trend.title,
        })
      )
      event.dataTransfer.effectAllowed = "copy"
    },
    [trend.id, trend.title, trendType]
  )

  const handleClick = React.useCallback(
    () => onToggleTrend(trend.id),
    [onToggleTrend, trend.id]
  )

  return (
    <TableRow
      data-state={isSelected ? "selected" : undefined}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      className="cursor-pointer"
    >
      <TableCell>
        {isSelected ? (
          <span className="inline-flex rounded-full bg-primary/15 p-1 text-primary">
            <CheckIcon className="h-3 w-3" />
          </span>
        ) : (
          <span className="inline-flex h-5 w-5 rounded-full border border-border/70" />
        )}
      </TableCell>
      <TableCell className="align-top">
        <Badge
          variant="outline"
          className="h-5 px-2 text-[9px] uppercase tracking-wide"
        >
          {trendType}
        </Badge>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <p className="font-semibold text-foreground">{trend.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
          {trend.summary}
        </p>
      </TableCell>
      <TableCell className="align-top">
        <span
          className={cn(
            "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            resolveMomentumTone(trend.momentum)
          )}
        >
          {trend.momentum}
        </span>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <div className="flex flex-wrap gap-1">
          {trend.platforms.map((platform) => (
            <span
              key={`${trend.id}:${platform}`}
              className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium capitalize tracking-wide text-muted-foreground"
            >
              {PLATFORM_DISPLAY_NAME[platform] ?? platform}
            </span>
          ))}
        </div>
      </TableCell>
      <TableCell className="align-top whitespace-normal text-[11px] text-muted-foreground">
        {trend.tags.length > 0
          ? trend.tags.slice(0, 2).map((tag) => `#${tag}`).join(" ")
          : "\u2014"}
      </TableCell>
      <TableCell className="align-top text-right">
        <GripVerticalIcon className="ml-auto h-3.5 w-3.5 text-muted-foreground/70" />
      </TableCell>
    </TableRow>
  )
})

export function TrendWorkbench({
  trends,
  selectedTrendIds,
  activePlatforms,
  maxSelections,
  onToggleTrend,
  onFetch,
  isFetching = false,
}: TrendWorkbenchProps) {
  const [query, setQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<TrendTypeFilter>("all")
  const [momentumFilter, setMomentumFilter] = React.useState<TrendMomentumFilter>("all")
  const [scopeFilter, setScopeFilter] = React.useState<TrendScopeFilter>("all")

  const normalizedQuery = query.trim().toLowerCase()
  const isCommandMode = normalizedQuery.startsWith("/")
  const effectiveQuery = isCommandMode ? "" : normalizedQuery
  const commandNeedle = isCommandMode ? normalizedQuery.replace("/", "").trim() : ""
  const shouldShowCommandList = isCommandMode || effectiveQuery.length > 0
  const selectedTrendIdSet = React.useMemo(
    () => new Set(selectedTrendIds),
    [selectedTrendIds]
  )
  const activePlatformSet = React.useMemo(
    () => new Set(activePlatforms),
    [activePlatforms]
  )

  const resolveTrendType = React.useCallback(
    (trend: Trend): "event" | "question" | "trend" => {
      const normalizedTags = trend.tags.map((tag) => tag.toLowerCase())
      const normalizedTitle = trend.title.toLowerCase()
      const normalizedSummary = trend.summary.toLowerCase()

      if (
        normalizedTags.includes("question") ||
        normalizedTitle.includes("?") ||
        normalizedSummary.includes("q&a")
      ) {
        return "question"
      }

      if (
        normalizedTags.includes("event") ||
        normalizedTitle.includes("event") ||
        normalizedSummary.includes("event")
      ) {
        return "event"
      }

      return "trend"
    },
    []
  )

  const indexedTrends = React.useMemo<IndexedTrend[]>(
    () =>
      trends.map((trend) => ({
        trend,
        trendType: resolveTrendType(trend),
        normalizedTitle: trend.title.toLowerCase(),
        normalizedSummary: trend.summary.toLowerCase(),
        normalizedTags: trend.tags.map((tag) => tag.toLowerCase()).join(" "),
      })),
    [resolveTrendType, trends]
  )

  const filteredTrends = React.useMemo(() => {
    const typeRank: Record<"event" | "question" | "trend", number> = {
      event: 0,
      question: 1,
      trend: 2,
    }

    return indexedTrends
      .map((item) => ({
        ...item,
        isSelected: selectedTrendIdSet.has(item.trend.id),
        platformFit: item.trend.platforms.reduce(
          (count, platform) => (activePlatformSet.has(platform) ? count + 1 : count),
          0
        ),
      }))
      .filter((item) => {
        const { trend, trendType, isSelected } = item
        const matchesType = typeFilter === "all" || trendType === typeFilter
        const matchesMomentum =
          momentumFilter === "all" || trend.momentum === momentumFilter
        const matchesScope =
          scopeFilter === "all" ||
          (scopeFilter === "selected" && isSelected) ||
          (scopeFilter === "active-platform" && item.platformFit > 0)

        if (!matchesType || !matchesMomentum || !matchesScope) {
          return false
        }

        if (!effectiveQuery) return true
        return (
          item.normalizedTitle.includes(effectiveQuery) ||
          item.normalizedSummary.includes(effectiveQuery) ||
          item.normalizedTags.includes(effectiveQuery)
        )
      })
      .sort((a, b) => {
        if (a.trendType !== b.trendType) return typeRank[a.trendType] - typeRank[b.trendType]
        if (a.platformFit !== b.platformFit) return b.platformFit - a.platformFit
        return a.trend.title.localeCompare(b.trend.title)
      })
      .map((item) => item.trend)
  }, [
    activePlatformSet,
    effectiveQuery,
    indexedTrends,
    momentumFilter,
    scopeFilter,
    selectedTrendIdSet,
    typeFilter,
  ])

  const trendTypeById = React.useMemo(() => {
    const map = new Map<string, ResolvedTrendType>()
    indexedTrends.forEach((item) => {
      map.set(item.trend.id, item.trendType)
    })
    return map
  }, [indexedTrends])

  const commandSuggestions = React.useMemo(() => {
    const base = isCommandMode ? trends : filteredTrends
    return base.slice(0, 10)
  }, [filteredTrends, isCommandMode, trends])

  const presetCommands = React.useMemo(
    () =>
      [
        {
          key: "all",
          label: "Preset: show all",
          shortcut: "/all",
          apply: () => {
            setTypeFilter("all")
            setMomentumFilter("all")
            setScopeFilter("all")
            setQuery("")
          },
        },
        {
          key: "selected",
          label: "Preset: selected only",
          shortcut: "/selected",
          apply: () => {
            setScopeFilter("selected")
            setQuery("")
          },
        },
        {
          key: "fit",
          label: "Preset: active platform fit",
          shortcut: "/fit",
          apply: () => {
            setScopeFilter("active-platform")
            setQuery("")
          },
        },
        {
          key: "events",
          label: "Preset: events",
          shortcut: "/events",
          apply: () => {
            setTypeFilter("event")
            setQuery("")
          },
        },
        {
          key: "questions",
          label: "Preset: questions",
          shortcut: "/questions",
          apply: () => {
            setTypeFilter("question")
            setQuery("")
          },
        },
        {
          key: "rising",
          label: "Preset: rising momentum",
          shortcut: "/rising",
          apply: () => {
            setMomentumFilter("rising")
            setQuery("")
          },
        },
      ] as const,
    []
  )

  const filteredPresetCommands = React.useMemo(() => {
    if (!isCommandMode) return presetCommands
    if (!commandNeedle) return presetCommands
    return presetCommands.filter(
      (command) =>
        command.label.toLowerCase().includes(commandNeedle) ||
        command.shortcut.includes(commandNeedle)
    )
  }, [commandNeedle, isCommandMode, presetCommands])

  const selectedCount = selectedTrendIds.length
  const selectedLabel =
    typeof maxSelections === "number" ? `${selectedCount}/${maxSelections}` : `${selectedCount}`

  const activePlatformLabel = React.useMemo(() => {
    if (activePlatforms.length === 0) return "none"
    return activePlatforms.join(", ")
  }, [activePlatforms])

  const resolveMomentumTone = React.useCallback((momentum: Trend["momentum"]) => {
    if (momentum === "rising") {
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    }
    if (momentum === "cooling") {
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300"
    }
    return "bg-sky-500/10 text-sky-700 dark:text-sky-300"
  }, [])

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg bg-card/70 p-2.5 ring-1 ring-border/40">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Trends Workbench
          </p>
          <p className="text-[11px] text-muted-foreground">
            Context: {activePlatformLabel} • type `{typeFilter}` • signal `{momentumFilter}` • type `/` for presets
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onFetch ? (
            <Button
              type="button"
              variant={trends.length === 0 ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={onFetch}
              disabled={isFetching}
            >
              {isFetching ? (
                <UpdateIcon className="mr-1 h-3 w-3 animate-spin" />
              ) : trends.length === 0 ? (
                <LightningBoltIcon className="mr-1 h-3 w-3" />
              ) : (
                <UpdateIcon className="mr-1 h-3 w-3" />
              )}
              {isFetching ? "Generating…" : trends.length === 0 ? "Generate Trends" : "Refresh"}
            </Button>
          ) : null}
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
            {selectedLabel}
          </Badge>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="rounded-md border border-border/60 bg-background/70">
          <Command className="bg-transparent">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search trends • type / for presets"
              className="text-xs"
            />
            {shouldShowCommandList ? (
              <CommandList className="max-h-[clamp(120px,40dvh,280px)]">
                <CommandEmpty>No matching commands or trends.</CommandEmpty>
                {isCommandMode ? (
                  <CommandGroup heading="Presets">
                    {filteredPresetCommands.map((command) => (
                      <CommandItem key={command.key} onSelect={command.apply}>
                        <span>{command.label}</span>
                        <CommandShortcut>{command.shortcut}</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : (
                  <>
                    <CommandGroup heading="Contextual picks">
                      {commandSuggestions.map((trend) => {
                        const isSelected = selectedTrendIdSet.has(trend.id)
                        return (
                          <CommandItem
                            key={`command-trend-${trend.id}`}
                            value={`${trend.title} ${trend.summary} ${trend.tags.join(" ")}`}
                            onSelect={() => onToggleTrend(trend.id)}
                          >
                            <span className="truncate">{trend.title}</span>
                            {isSelected ? (
                              <CheckIcon className="ml-auto h-3.5 w-3.5 text-primary" />
                            ) : null}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Tip">
                      <CommandItem onSelect={() => setQuery("/")}>
                        Type `/` to apply preset filters
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            ) : null}
          </Command>
        </div>

        <ScrollArea className="min-h-0 flex-1 rounded-md bg-background/45 ring-1 ring-border/35">
          <div className="px-2 pb-2">
            {filteredTrends.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No trends match this search.
              </div>
            ) : (
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <TableRow>
                      <TableHead className="w-8"><span className="sr-only">Selected</span></TableHead>
                      <TableHead className="w-24">Type</TableHead>
                      <TableHead>Trend</TableHead>
                      <TableHead className="w-28">Momentum</TableHead>
                      <TableHead className="w-44">Platforms</TableHead>
                      <TableHead className="w-32">Tags</TableHead>
                      <TableHead className="w-12 text-right"><span className="sr-only">Drag</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {filteredTrends.map((trend) => (
                    <TrendTableRow
                      key={trend.id}
                      trend={trend}
                      isSelected={selectedTrendIdSet.has(trend.id)}
                      trendType={trendTypeById.get(trend.id) ?? "trend"}
                      onToggleTrend={onToggleTrend}
                      resolveMomentumTone={resolveMomentumTone}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </ScrollArea>
      </div>
    </section>
  )
}
