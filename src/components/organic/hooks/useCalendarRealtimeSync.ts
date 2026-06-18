"use client"

import * as React from "react"

import { useCalendarStore } from "@/lib/organic/store"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * Keeps the planner authoritative with the server: subscribes to Supabase
 * Realtime postgres_changes on organic.organic_calendar_drafts for the active
 * brand and nudges the existing nonce-refetch whenever a draft is written by
 * ANY path — including out-of-band agent writes (conversational tools, the
 * Stage-2 blueprint worker, scheduled jobs) that the run-stream isn't carrying.
 *
 * It does not mutate the store itself; it requests a refetch so the canonical
 * server rows (re-signed media, correct keying) win. Bursts (text -> blueprint
 * -> media on one draft) are coalesced by a short debounce.
 */
/**
 * A row written outside the currently-loaded calendar window won't surface via
 * the week-scoped refetch. When a brand-new draft (INSERT) is scheduled beyond
 * the loaded day range, flag it so the planner can nudge the user to navigate.
 * Non-fatal best-effort; reads store state non-reactively to avoid re-subscribing.
 */
export function noteIfDraftLandedOffWindow(payload: {
  eventType?: string
  new?: { scheduled_date?: string | null; status?: string | null } | null
}): void {
  try {
    if (payload.eventType !== "INSERT") return
    const row = payload.new
    const scheduledDate = row?.scheduled_date
    if (!scheduledDate || row?.status === "deleted") return

    const days = useCalendarStore.getState().days
    if (days.length === 0) return
    const dayIds = days.map((day) => day.id).filter(Boolean).sort()
    const date = scheduledDate.slice(0, 10)
    if (date < dayIds[0] || date > dayIds[dayIds.length - 1]) {
      useCalendarStore.getState().noteDraftElsewhere()
    }
  } catch {
    // Off-window detection is a nicety; never let it disrupt the refetch nudge.
  }
}

export function useCalendarRealtimeSync(args: { brandProfileId?: string }) {
  const { brandProfileId } = args
  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch)
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  React.useEffect(() => {
    if (!brandProfileId) return

    let debounce: ReturnType<typeof setTimeout> | null = null
    const handleChange = (payload: Parameters<typeof noteIfDraftLandedOffWindow>[0]) => {
      noteIfDraftLandedOffWindow(payload)
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => requestCalendarRefetch(), 400)
    }

    const channel = supabase
      .channel(`organic-calendar-drafts-${brandProfileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "organic",
          table: "organic_calendar_drafts",
          filter: `brand_id=eq.${brandProfileId}`,
        },
        handleChange,
      )
      .subscribe()

    return () => {
      if (debounce) clearTimeout(debounce)
      void supabase.removeChannel(channel)
    }
  }, [brandProfileId, requestCalendarRefetch, supabase])
}
