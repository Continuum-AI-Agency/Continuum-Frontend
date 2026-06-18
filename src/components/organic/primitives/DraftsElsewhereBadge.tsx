"use client"

import * as React from "react"
import { useShallow } from "zustand/react/shallow"
import { CalendarIcon } from "@radix-ui/react-icons"

import { useCalendarStore } from "@/lib/organic/store"

/**
 * Lightweight nudge for drafts created (e.g. by the agent / claude.ai MCP) and
 * scheduled outside the week currently in view. The week-scoped refetch can't
 * surface them, so this pill tells the user something landed elsewhere. Clicking
 * acknowledges it and re-requests the canonical rows.
 */
export function DraftsElsewhereBadge() {
  const { count, acknowledge, requestRefetch } = useCalendarStore(
    useShallow((state) => ({
      count: state.draftsElsewhere,
      acknowledge: state.acknowledgeDraftsElsewhere,
      requestRefetch: state.requestCalendarRefetch,
    })),
  )

  if (count <= 0) return null

  return (
    <button
      type="button"
      onClick={() => {
        requestRefetch()
        acknowledge()
      }}
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur transition hover:bg-primary/20"
    >
      <CalendarIcon className="h-3.5 w-3.5" />
      {count === 1
        ? "1 new draft scheduled in another week"
        : `${count} new drafts scheduled in other weeks`}
      <span className="text-[10px] font-normal text-primary/70">Dismiss</span>
    </button>
  )
}
