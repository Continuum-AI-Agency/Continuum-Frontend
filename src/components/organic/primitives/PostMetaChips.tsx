"use client"

import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import { normalizeTimeLabel } from "@/lib/organic/scheduling"

const PLATFORM_OPTIONS: { value: OrganicPlatformKey; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
]

const FORMAT_OPTIONS = ["Post", "Carousel", "Reel", "HyperFrame"] as const
const QUICK_TIME_OPTIONS = ["9:00 AM", "1:00 PM", "5:00 PM"] as const

const PLATFORM_DOT: Record<string, string> = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  linkedin: "#0A66C2",
}

const chipClass =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-foreground/90 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"

function Sep() {
  return <span className="select-none text-muted-foreground/40">·</span>
}

function platformLabel(platform: OrganicPlatformKey): string {
  return PLATFORM_OPTIONS.find((p) => p.value === platform)?.label ?? "Instagram"
}

function TimeChip({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(value)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setPending(value)
      setError(null)
    }
  }, [open, value])

  const commit = (raw: string) => {
    const normalized = normalizeTimeLabel(raw.trim())
    if (!normalized) {
      setError("Use 9:00 AM or 14:00")
      return
    }
    onChange(normalized)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={chipClass} aria-label="Edit posting time">
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-56 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Posting time
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK_TIME_OPTIONS.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => commit(time)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition-colors duration-150",
                time === value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {time}
            </button>
          ))}
        </div>
        <Input
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commit(pending)
            }
            if (event.key === "Escape") setOpen(false)
          }}
          placeholder="Custom — 9:00 AM"
          className="h-8 text-xs"
          autoFocus
        />
        {error && <p className="mt-1 text-[10px] text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The slim, glanceable metadata strip atop the previewer: platform · format ·
 * time as compact chips that open their picker on click, with a trailing slot
 * for the ⋯ command menu. Replaces the always-on select header.
 */
export function PostMetaChips({
  platform,
  format,
  timeLabel,
  onPlatformChange,
  onFormatChange,
  onTimeChange,
  actions,
}: {
  platform: OrganicPlatformKey
  format: string
  timeLabel: string
  onPlatformChange: (next: OrganicPlatformKey) => void
  onFormatChange: (next: string) => void
  onTimeChange: (next: string) => void
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border/60 bg-muted/40 px-2 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={chipClass} aria-label="Change platform">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: PLATFORM_DOT[platform] ?? "#7C6FFF" }}
            />
            {platformLabel(platform)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {PLATFORM_OPTIONS.map((option) => (
            <DropdownMenuItem key={option.value} onSelect={() => onPlatformChange(option.value)}>
              <span
                className="mr-2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: PLATFORM_DOT[option.value] ?? "#7C6FFF" }}
              />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sep />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={chipClass} aria-label="Change format">
            {format}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {FORMAT_OPTIONS.map((option) => (
            <DropdownMenuItem key={option} onSelect={() => onFormatChange(option)}>
              {option}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sep />

      <TimeChip value={timeLabel} onChange={onTimeChange} />

      {actions ? <div className="ml-auto">{actions}</div> : null}
    </div>
  )
}
