"use client"

// Wraps a disabled control and explains WHY it is disabled plus what unlocks it
// (base for BUG-013/014/015). Disabled controls do not fire hover/focus events,
// so the wrapper span is the tooltip trigger and stays focusable. The reason is
// always exposed to assistive tech via aria-describedby — not only on hover.

import { useId, type ReactNode } from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type DisabledReasonProps = {
  reason: string
  children: ReactNode
  unlocks?: string
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}

export function DisabledReason({
  reason,
  children,
  unlocks,
  side = "top",
  className,
}: DisabledReasonProps) {
  const descriptionId = useId()

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a disabled control is removed from the tab order and cannot receive focus/hover, so this wrapper must be focusable for keyboard users to reach the tooltip and discover why the control is disabled.
            tabIndex={0}
            aria-describedby={descriptionId}
            className={cn("inline-flex cursor-help", className)}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs">
          <p className="text-sm">{reason}</p>
          {unlocks !== undefined ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Unlocks {unlocks}
            </p>
          ) : null}
        </TooltipContent>
      </Tooltip>
      <span id={descriptionId} className="sr-only">
        {unlocks !== undefined ? `${reason} Unlocks ${unlocks}` : reason}
      </span>
    </TooltipProvider>
  )
}
