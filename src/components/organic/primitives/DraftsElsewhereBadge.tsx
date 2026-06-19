"use client"

import * as React from "react"
import { useShallow } from "zustand/react/shallow"
import { CalendarIcon } from "@radix-ui/react-icons"

import { useCalendarStore } from "@/lib/organic/store"
import type { DraftsElsewhereTarget } from "@/lib/organic/store"

/**
 * Lightweight nudge for drafts created (e.g. by the agent / claude.ai MCP) and
 * scheduled outside the week currently in view. The week-scoped refetch can't
 * surface them, so this pill tells the user something landed elsewhere. Clicking
 * acknowledges it and re-requests the canonical rows.
 */
export function DraftsElsewhereBadge({
  onJump,
}: {
  onJump?: (target: DraftsElsewhereTarget, view: "month" | "list") => void
}) {
  const { count, target, acknowledge, requestRefetch } = useCalendarStore(
    useShallow((state) => ({
      count: state.draftsElsewhere,
      target: state.draftsElsewhereTarget,
      acknowledge: state.acknowledgeDraftsElsewhere,
      requestRefetch: state.requestCalendarRefetch,
    })),
  )

  if (count <= 0) return null

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur"
    >
      <CalendarIcon className="h-3.5 w-3.5" />
      {count === 1
        ? "1 new draft scheduled in another week"
        : `${count} new drafts scheduled in other weeks`}
      {target && onJump ? (
        <>
          <button
            type="button"
            onClick={() => onJump(target, "month")}
            className="rounded px-1 text-[10px] font-semibold text-primary/80 transition hover:bg-primary/15 hover:text-primary"
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => onJump(target, "list")}
            className="rounded px-1 text-[10px] font-semibold text-primary/80 transition hover:bg-primary/15 hover:text-primary"
          >
            List
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => {
          requestRefetch()
          acknowledge()
        }}
        className="rounded px-1 text-[10px] font-normal text-primary/70 transition hover:bg-primary/15 hover:text-primary"
      >
        Dismiss
      </button>
    </div>
  )
}
