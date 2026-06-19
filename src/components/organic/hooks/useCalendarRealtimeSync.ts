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
 * -> media on one draft) are coalesced by a short debounce. The fetch-all reload
 * pulls in the draft wherever it landed, so no off-window nudge is needed.
 */
export function useCalendarRealtimeSync(args: { brandProfileId?: string }) {
  const { brandProfileId } = args
  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch)
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  React.useEffect(() => {
    if (!brandProfileId) return

    let debounce: ReturnType<typeof setTimeout> | null = null
    const handleChange = () => {
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
