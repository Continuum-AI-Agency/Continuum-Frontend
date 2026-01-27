"use client"

import * as React from "react"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type WeekPickerProps = {
  value: Date
  rangeLabel: string
  onChange: (date: Date) => void
  onPreviousWeek: () => void
  onNextWeek: () => void
}

export function WeekPicker({
  value,
  rangeLabel,
  onChange,
  onPreviousWeek,
  onNextWeek,
}: WeekPickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" onClick={onPreviousWeek}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <CalendarIcon className="h-4 w-4 text-secondary" />
            <span className="text-sm font-medium text-primary">{rangeLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              if (!date) return
              onChange(date)
              setOpen(false)
            }}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon-sm" onClick={onNextWeek}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
