import { ChevronLeft, ChevronRight, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type PlannerViewMode = "day" | "week"

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
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/35 p-0.5">
          {VIEW_MODE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={viewMode === option.value ? "secondary" : "ghost"}
              className={cn(
                viewMode === option.value
                  ? "h-8 rounded-md px-3"
                  : "h-8 rounded-md px-3 text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={viewMode === option.value}
              onClick={() => onViewModeChange(option.value)}
            >
              {option.label}
            </Button>
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

        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="Add placeholder"
          onClick={() => onCreatePost({ status: "placeholder" })}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </header>
  )
}
