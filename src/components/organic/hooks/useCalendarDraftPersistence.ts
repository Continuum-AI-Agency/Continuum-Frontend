"use client"

import * as React from "react"

import {
  UNSCHEDULED_DAY_ID,
  buildScaffoldForRange,
  buildUnscheduledDay,
  formatDayId,
  startOfWeek,
} from "@/components/organic/primitives/calendar-utils"
import type { OrganicCalendarDay, OrganicCalendarDraft } from "@/components/organic/primitives/types"
import { request } from "@/lib/api/http"
import { getVisibleMonthRange } from "@/lib/organic/calendar-posts"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  buildPersistedDraftPayload,
  mapPersistedRowToCalendarEntry,
  mergeUnsavedLocalDrafts,
  resolvePersistedRowDayId,
  type PersistedOrganicDraftRow,
} from "@/lib/organic/calendar-draft-persistence"

type CalendarEntry = {
  dayId: string
  draft: OrganicCalendarDraft
}

type UseCalendarDraftPersistenceOptions = {
  brandProfileId?: string
  calendarDays: OrganicCalendarDay[]
  setCalendarDays: (days: OrganicCalendarDay[]) => void
  updateDraftById: (draftId: string, updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft) => void
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>
}

function parseUpdatedAt(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// The week a given day falls in — written as informational metadata into slot_data
// so a draft on any day records a correct (per-day) week, not one ambient week.
function weekStartIdForDay(dayId: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayId)
  if (!match) return ""
  return formatDayId(startOfWeek(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))))
}

function parseDayBoundary(dayId: string): Date {
  return new Date(`${dayId}T12:00:00`)
}

function serializeEntries(entries: CalendarEntry[]): string {
  const normalized = entries
    .map(({ dayId, draft }) => ({
      id: draft.id,
      dayId,
      status: draft.status,
      title: draft.title,
      summary: draft.summary,
      captionPreview: draft.captionPreview,
      platforms: draft.platforms,
      timeLabel: draft.timeLabel,
      mediaCount: draft.mediaCount,
      generationError: draft.generationError ?? null,
      instagram_post_id: draft.instagram_post_id ?? null,
    }))
    .sort((a, b) => `${a.dayId}:${a.id}`.localeCompare(`${b.dayId}:${b.id}`))

  return JSON.stringify(normalized)
}

export function useCalendarDraftPersistence({
  brandProfileId,
  calendarDays,
  setCalendarDays,
  updateDraftById,
  platformAccountIds = {},
}: UseCalendarDraftPersistenceOptions) {
  const hydratedKeyRef = React.useRef<string | null>(null)
  const knownBackendIdsRef = React.useRef<Set<string>>(new Set())
  // Rows THIS hook inserted in-session. The autosave may only delete drafts it
  // created itself — never agent-/server-created rows it merely fetched — so the
  // browser writer can't clobber what the organic agent persists server-side.
  const feCreatedIdsRef = React.useRef<Set<string>>(new Set())
  const lastSyncedSignatureRef = React.useRef<string>("")
  const syncInFlightRef = React.useRef(false)
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])
  // Live view of the current grid so a refetch can preserve in-flight local drafts
  // (manual constructions not yet autosaved) instead of clobbering them.
  const calendarDaysRef = React.useRef(calendarDays)
  calendarDaysRef.current = calendarDays

  const refetch = React.useCallback(async () => {
    if (!brandProfileId) return

    // Fetch ALL of the brand's drafts (no date window). The calendar is no longer
    // week-scoped: every draft is loaded once, and each view filters/derives its
    // own slice locally, so a draft can never be hidden by the fetch range again.
    const params = new URLSearchParams({ brandId: brandProfileId })
    const { drafts } = await request<{ drafts: PersistedOrganicDraftRow[] }>({
      path: `/api/organic/calendar/drafts?${params}`,
    })

    // Scaffold must contain a home day for every loaded draft (or the mapper drops
    // it), so pre-scan day ids before mapping. The visible month around today seeds
    // an always-paintable span even for a brand with no drafts there.
    const loadedDayIds = drafts.filter((row) => row?.id).map((row) => resolvePersistedRowDayId(row))
    const visibleMonth = getVisibleMonthRange(new Date())
    const days = buildScaffoldForRange(
      loadedDayIds,
      parseDayBoundary(visibleMonth.start),
      parseDayBoundary(visibleMonth.end)
    )
    if (loadedDayIds.includes(UNSCHEDULED_DAY_ID)) {
      days.push(buildUnscheduledDay())
    }

    const dedupedByDraftId = new Map<string, { updatedAt: number; entry: CalendarEntry }>()
    const knownIds = new Set<string>()

    for (const row of drafts) {
      if (!row?.id) continue

      const entry = mapPersistedRowToCalendarEntry(row, days)
      if (!entry) continue

      const updatedAt = parseUpdatedAt(row.updated_at)
      const existing = dedupedByDraftId.get(entry.draft.id)
      if (!existing || updatedAt >= existing.updatedAt) {
        dedupedByDraftId.set(entry.draft.id, { updatedAt, entry })
      }
      knownIds.add(row.id)
    }

    for (const { entry } of dedupedByDraftId.values()) {
      const day = days.find((item) => item.id === entry.dayId)
      if (!day) continue
      day.slots.push(entry.draft)
    }

    // Non-destructive reconcile: keep never-persisted local drafts that the server
    // hasn't echoed yet, so a refetch racing a fresh manual construction can't wipe it.
    setCalendarDays(mergeUnsavedLocalDrafts(days, calendarDaysRef.current))
    knownBackendIdsRef.current = knownIds
  }, [brandProfileId, setCalendarDays])

  React.useEffect(() => {
    if (!brandProfileId) return

    const key = brandProfileId
    hydratedKeyRef.current = null
    lastSyncedSignatureRef.current = ""
    knownBackendIdsRef.current = new Set()

    const load = async () => {
      try {
        await refetch()
      } catch {
        // Best-effort hydration; local cache remains usable.
      } finally {
        hydratedKeyRef.current = key
      }
    }

    void load()
  }, [brandProfileId, refetch])

  React.useEffect(() => {
    if (!brandProfileId) return
    if (hydratedKeyRef.current !== brandProfileId) return

    const rawPersistableEntries = calendarDays
      // The unscheduled sentinel is not a real date; its drafts are server-owned
      // and must never be written back with a bogus scheduled_date.
      .filter((day) => day.id !== UNSCHEDULED_DAY_ID)
      .flatMap((day) =>
        day.slots
          .filter((draft) => draft.status !== "streaming")
          // The browser autosave owns ONLY manually-authored drafts. Everything the
          // generation pipeline produces (agent posts, grid/trend seeds, "Generate
          // with AI" placeholders — all origin 'agent' or undefined) is server-owned
          // and persisted by the backend with a canonical client_key. A positive
          // allowlist (origin === 'manual') is the fix for duplicate posts: the old
          // denylist (origin !== 'agent') let undefined-origin generation drafts slip
          // through and get inserted a second time alongside the backend's own row.
          .filter((draft) => draft.origin === "manual")
          .map((draft) => ({ dayId: day.id, draft }))
      )
    // Collapse any same-clientKey entries (a store-level duplicate) so each logical
    // draft is written exactly once per tick.
    const seenClientKeys = new Set<string>()
    const persistableEntries = rawPersistableEntries.filter((entry) => {
      const key = entry.draft.clientKey ?? entry.draft.id
      if (seenClientKeys.has(key)) return false
      seenClientKeys.add(key)
      return true
    })
    const signature = serializeEntries(persistableEntries)
    if (signature === lastSyncedSignatureRef.current) return

    const allBackendIds = new Set<string>()
    calendarDays.forEach((day) => {
      day.slots.forEach((draft) => {
        if (draft.backendDraftId) allBackendIds.add(draft.backendDraftId)
      })
    })

    const timer = setTimeout(() => {
      if (syncInFlightRef.current) return
      syncInFlightRef.current = true

      const sync = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          const organicSchema = supabase.schema("organic" as never) as any
          // Only delete rows THIS hook created (and that are now gone locally) —
          // never agent-/server-created rows. Prevents the browser autosave from
          // racing the backend writer and removing agent-drafted posts.
          const idsToDelete = [...feCreatedIdsRef.current].filter((id) => !allBackendIds.has(id))
          for (const draftId of idsToDelete) {
            const { error } = await organicSchema
              .from("organic_calendar_drafts")
              .delete()
              .eq("id", draftId)
              .eq("user_id", user.id)
            if (!error) {
              knownBackendIdsRef.current.delete(draftId)
              feCreatedIdsRef.current.delete(draftId)
            }
          }

          for (const entry of persistableEntries) {
            const payload = buildPersistedDraftPayload({
              brandId: brandProfileId,
              weekStartId: weekStartIdForDay(entry.dayId),
              dayId: entry.dayId,
              draft: entry.draft,
              platformAccountIds,
            })

            if (!entry.draft.backendDraftId) {
              // UPSERT on the canonical (brand_id, client_key): if a refetch already
              // echoed this logical draft (or a write-back was missed), this updates
              // the existing row instead of minting a duplicate.
              const { data: created, error } = await organicSchema
                .from("organic_calendar_drafts")
                .upsert(
                  {
                    brand_id: payload.brand_id,
                    client_key: payload.client_key,
                    platform: payload.platform,
                    platform_account_id: payload.platform_account_id,
                    status: payload.status,
                    scheduled_date: payload.scheduled_date,
                    slot_data: payload.slot_data,
                    user_id: user.id,
                  },
                  { onConflict: "brand_id,client_key" },
                )
                .select("id")
                .single()
              if (error) continue
              if (!created.id) continue

              knownBackendIdsRef.current.add(created.id)
              feCreatedIdsRef.current.add(created.id)
              updateDraftById(entry.draft.id, (draft) => ({
                ...draft,
                backendDraftId: created.id,
              }))
              continue
            }

            const { error } = await organicSchema
              .from("organic_calendar_drafts")
              .update({
                brand_id: payload.brand_id,
                client_key: payload.client_key,
                platform: payload.platform,
                platform_account_id: payload.platform_account_id,
                status: payload.status,
                scheduled_date: payload.scheduled_date,
                slot_data: payload.slot_data,
                updated_at: new Date().toISOString(),
              })
              .eq("id", entry.draft.backendDraftId)
              .eq("user_id", user.id)
            if (!error) {
              knownBackendIdsRef.current.add(entry.draft.backendDraftId)
            }
          }

          lastSyncedSignatureRef.current = signature
          await refetch()
        } finally {
          syncInFlightRef.current = false
        }
      }

      void sync()
    }, 500)

    return () => clearTimeout(timer)
  }, [brandProfileId, calendarDays, platformAccountIds, refetch, supabase, updateDraftById])

  return { refetch }
}
