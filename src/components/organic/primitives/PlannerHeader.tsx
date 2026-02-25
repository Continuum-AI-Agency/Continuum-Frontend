import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from "@/lib/utils"

type PlannerViewMode = "day" | "week" | "month"

type PlannerHeaderProps = {
  title: string
  subtitle?: string
  viewMode: PlannerViewMode
  onViewModeChange: (mode: PlannerViewMode) => void
  onPreviousWeek: () => void
  onNextWeek: () => void
  onCreatePost: (options?: { status?: "draft" | "scheduled" | "placeholder" }) => void
}

const VIEW_MODE_OPTIONS: Array<{ value: PlannerViewMode; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
]

export function PlannerHeader({
  title,
  subtitle,
  viewMode,
  onViewModeChange,
  onPreviousWeek,
  onNextWeek,
  onCreatePost,
}: PlannerHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 pb-1">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
          {VIEW_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={viewMode === option.value}
              onClick={() => onViewModeChange(option.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                viewMode === option.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onPreviousWeek}
          aria-label="Previous week"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onNextWeek}
          aria-label="Next week"
        >
          <ChevronRight className="size-4" />
        </Button>

        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              className="bg-orange-500 text-white hover:bg-orange-500/90"
              onClick={() => onCreatePost({ status: "draft" })}
            >
              <Plus className="size-4" />
              Create Post
            </Button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel>Quick Add</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onCreatePost({ status: "draft" })}>
              Add draft
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCreatePost({ status: "scheduled" })}>
              Add scheduled post
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCreatePost({ status: "placeholder" })}>
              Add idea placeholder
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </header>
  )
}
