"use client"

import { useRouter } from "next/navigation"
import {
  CheckIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  LightningBoltIcon,
  PlusIcon,
  RocketIcon,
  TrashIcon,
} from "@radix-ui/react-icons"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

type CalendarToolbarProps = {
  viewMode: "week" | "month" | "list"
  onViewModeChange: (mode: "week" | "month" | "list") => void
  selectedTrendCount: number
  maxTrendSelections?: number
  seededDraftCount: number
  isGenerating: boolean
  onOpenTrends: () => void
  onAddPlaceholder: () => void
  onGenerate: () => void
  onClear: () => void
  draftsCount: number
  slotProgress: { completed: number; total: number; failed: number } | null
  gridProgress: { percent: number; message?: string; stage?: string }
  gridStatus: string
  gridError: string | null
  onRetryGeneration?: () => void
  postedContentCount?: number
  isFetchingPostedContent?: boolean
  onFetchPostedContent?: () => void
}

export function CalendarToolbar({
  viewMode,
  onViewModeChange,
  selectedTrendCount,
  maxTrendSelections,
  seededDraftCount,
  isGenerating,
  onOpenTrends,
  onAddPlaceholder,
  onGenerate,
  onClear,
  draftsCount,
  slotProgress,
  gridProgress,
  gridStatus,
  gridError,
  onRetryGeneration,
  postedContentCount = 0,
  isFetchingPostedContent = false,
  onFetchPostedContent,
}: CalendarToolbarProps) {
  const router = useRouter()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="rounded-lg bg-card/70 px-2.5 py-1.5 ring-1 ring-border/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-border bg-muted/35 p-0.5">
                {(["week", "month", "list"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={viewMode === mode ? "secondary" : "ghost"}
                    className={viewMode === mode
                      ? "h-7 rounded px-2.5 text-xs"
                      : "h-7 rounded px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    }
                    aria-pressed={viewMode === mode}
                    onClick={() => {
                      onViewModeChange(mode)
                      const next = new URLSearchParams(window.location.search)
                      next.set("view", mode)
                      router.replace(`?${next.toString()}`, { scroll: false })
                    }}
                  >
                    {mode === "week" ? "Week" : mode === "month" ? "Month" : "List"}
                  </Button>
                ))}
              </div>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {selectedTrendCount}
                {typeof maxTrendSelections === "number"
                  ? `/${maxTrendSelections}`
                  : ""}{" "}
                trends
              </Badge>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {seededDraftCount} placeholders
              </Badge>
              {postedContentCount > 0 ? (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                  {postedContentCount} posted
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {onFetchPostedContent ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label="Fetch third-party posted content"
                  disabled={isFetchingPostedContent}
                  onClick={onFetchPostedContent}
                  title="Fetch third-party posted content"
                >
                  <RefreshCw className={isFetchingPostedContent ? "mr-1 h-3.5 w-3.5 animate-spin" : "mr-1 h-3.5 w-3.5"} />
                  Posts
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Open trends"
                onClick={onOpenTrends}
              >
                <LightningBoltIcon className="mr-1 h-3.5 w-3.5" />
                Trends
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Add placeholder"
                disabled={isGenerating}
                onClick={onAddPlaceholder}
              >
                <PlusIcon className={isGenerating ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"} />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={isGenerating || seededDraftCount === 0}
                onClick={onGenerate}
              >
                {isGenerating ? (
                  <LightningBoltIcon className="mr-1 h-3.5 w-3.5 animate-pulse" />
                ) : (
                  <RocketIcon className="mr-1 h-3.5 w-3.5" />
                )}
                Generate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isGenerating || draftsCount === 0}
                onClick={onClear}
              >
                <TrashIcon className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>

          {slotProgress ? (
            <div className="mt-2 space-y-1">
              <div className="space-y-0.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {slotProgress.completed}/{slotProgress.total} completed
                  {slotProgress.failed > 0 ? ` • ${slotProgress.failed} failed` : ""}
                </p>
                {gridProgress.stage ? (
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    {gridProgress.stage}
                  </p>
                ) : null}
                {gridProgress.message ? (
                  <p className="line-clamp-2 text-[11px] text-muted-foreground/80">
                    {gridProgress.message}
                  </p>
                ) : null}
              </div>
              <Progress value={gridProgress.percent} className="h-1.5 bg-muted/70" />
            </div>
          ) : null}

          {/* Grid status banners */}
          {gridStatus === "complete" && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="h-3.5 w-3.5" />
              All {slotProgress?.total ?? 0} posts generated
            </div>
          )}
          {gridStatus === "complete_with_errors" && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              {slotProgress?.completed ?? 0} of {slotProgress?.total ?? 0} generated. {slotProgress?.failed ?? 0} failed
              {onRetryGeneration && (
                <button type="button" onClick={onRetryGeneration} className="ml-1 underline underline-offset-2 hover:text-amber-700">
                  — retry
                </button>
              )}
            </div>
          )}
          {gridStatus === "error" && gridError && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-red-500/5 px-3 py-1.5 text-[11px] text-red-600 dark:text-red-400">
              <Cross2Icon className="h-3.5 w-3.5" />
              Generation failed: {gridError}
              {onRetryGeneration && (
                <button type="button" onClick={onRetryGeneration} className="ml-1 underline underline-offset-2 hover:text-red-700">
                  — retry
                </button>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>Weekly Actions</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onAddPlaceholder}>
          Plus
        </ContextMenuItem>
        <ContextMenuItem
          disabled={seededDraftCount === 0}
          onSelect={onGenerate}
        >
          Generate placeholders
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={onClear}
        >
          <TrashIcon className="mr-2 h-3.5 w-3.5" />
          Clear current week
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
