"use client"

import { Captions, CaptionsOff } from "lucide-react"

import { cn } from "@/lib/utils"

// Compact on/off toggle for burning word-synced captions into generated clips.
// Sits next to the clip-quality control; stopPropagation keeps the click off the
// card's hover/select surface.
export function ClipCaptionToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label="Burn captions into clips"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!value)
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50",
        value ? "bg-muted text-foreground" : "text-muted-foreground/70 hover:text-foreground",
      )}
      title={value ? "Captions on" : "Captions off"}
    >
      {value ? <Captions className="size-3" /> : <CaptionsOff className="size-3" />}
      CC
    </button>
  )
}
