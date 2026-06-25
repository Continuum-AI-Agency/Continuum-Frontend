"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { startOfWeek, formatDayId } from "./calendar-utils"

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

type DuplicateDayPickerProps = {
  onSelect: (dayId: string) => void
  onCancel: () => void
}

export function DuplicateDayPicker({ onSelect, onCancel }: DuplicateDayPickerProps) {
  const [weekOffset, setWeekOffset] = React.useState(0)

  const weekStart = React.useMemo(() => {
    const base = startOfWeek(new Date())
    base.setDate(base.getDate() + weekOffset * 7)
    return base
  }, [weekOffset])

  const days = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + i)
      return {
        id: formatDayId(date),
        label: DAY_LABELS[i],
        date: date.getDate(),
        month: date.toLocaleString("en-US", { month: "short" }),
        isPast: date < new Date(new Date().setHours(0, 0, 0, 0)),
      }
    })
  }, [weekStart])

  const [selectedDayId, setSelectedDayId] = React.useState<string | null>(null)

  const weekLabel = React.useMemo(() => {
    const end = new Date(weekStart)
    end.setDate(weekStart.getDate() + 6)
    const startMonth = weekStart.toLocaleString("en-US", { month: "short" })
    const endMonth = end.toLocaleString("en-US", { month: "short" })
    if (startMonth === endMonth) {
      return `${startMonth} ${weekStart.getDate()}–${end.getDate()}`
    }
    return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}`
  }, [weekStart])

  return (
    <div className="w-56 space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setWeekOffset((o) => o - 1)}
          aria-label="Previous week"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-semibold text-muted-foreground">{weekLabel}</span>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setWeekOffset((o) => o + 1)}
          aria-label="Next week"
        >
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => (
          <button
            key={day.id}
            type="button"
            disabled={day.isPast}
            onClick={() => setSelectedDayId(day.id)}
            className={cn(
              "flex flex-col items-center rounded px-1 py-1.5 text-2xs transition-colors",
              day.isPast && "cursor-not-allowed opacity-40",
              selectedDayId === day.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="font-semibold">{day.label}</span>
            <span>{day.date}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="default"
          className="flex-1 h-7 text-xs"
          disabled={!selectedDayId}
          onClick={() => selectedDayId && onSelect(selectedDayId)}
        >
          Clone
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
