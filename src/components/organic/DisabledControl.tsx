"use client"

// Wraps an organic control (planner Generate/Clear/Add, metrics Refresh/Export,
// agent starters) so the disabled reason surfaces on hover/focus and to assistive
// tech, but ONLY when the control is actually blocked. When `hint` is null the
// children render bare, so enabled controls keep their normal cursor and tab
// order. Composes the Phase-B DisabledReason primitive.

import type { ReactNode } from "react"

import { DisabledReason } from "@/components/shared/state"
import type { DisabledHint } from "./disabledReasons"

type DisabledControlProps = {
  hint: DisabledHint | null
  children: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  className?: string
}

export function DisabledControl({
  hint,
  children,
  side,
  className,
}: DisabledControlProps) {
  if (!hint) return <>{children}</>
  return (
    <DisabledReason
      reason={hint.reason}
      unlocks={hint.unlocks}
      side={side}
      className={className}
    >
      {children}
    </DisabledReason>
  )
}
