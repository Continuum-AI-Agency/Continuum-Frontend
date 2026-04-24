"use client"

import * as React from "react"

import { buildWeekDays } from "@/components/organic/primitives/calendar-utils"
import type { OrganicCalendarDay, OrganicCalendarDraft } from "@/components/organic/primitives/types"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import {
  buildPersistedDraftPayload,
  isDayIdInWeekRange,
  mapPersistedRowToCalendarEntry,
  type PersistedOrganicDraftRow,
} from "@/lib/organic/calendar-draft-persistence"

type CalendarEntry = {
  dayId: string
  draft: OrganicCalendarDraft
}

type UseCalendarDraftPersistenceOptions = {
  brandProfileId?: string
  weekStartId: string
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

function weekScaffold(weekStartId: string): OrganicCalendarDay[] {
  const [yearRaw, monthRaw, dayRaw] = weekStartId.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const fallback = new Date(`${weekStartId}T12:00:00`)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return buildWeekDays(fallback)
  }
  return buildWeekDays(new Date(year, month - 1, day, 12, 0, 0, 0))
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
  weekStartId,
  calendarDays,
  setCalendarDays,
  updateDraftById,
  platformAccountIds = {},
}: UseCalendarDraftPersistenceOptions) {
  const hydratedKeyRef = React.useRef<string | null>(null)
  const knownBackendIdsRef = React.useRef<Set<string>>(new Set())
  const lastSyncedSignatureRef = React.useRef<string>("")
  const syncInFlightRef = React.useRef(false)
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), [])

  React.useEffect(() => {
    if (!brandProfileId || !weekStartId) return

    const key = `${brandProfileId}:${weekStartId}`
    hydratedKeyRef.current = null
    lastSyncedSignatureRef.current = ""
    knownBackendIdsRef.current = new Set()

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const weekEnd = (() => {
          const [year, month, day] = weekStartId.split("-").map(Number)
          const next = new Date(Date.UTC(year, month - 1, day))
          next.setUTCDate(next.getUTCDate() + 6)
          const nextYear = next.getUTCFullYear()
          const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0")
          const nextDay = String(next.getUTCDate()).padStart(2, "0")
          return `${nextYear}-${nextMonth}-${nextDay}`
        })()

        const organicSchema = supabase.schema("organic" as never) as any
        const { data, error } = await organicSchema
          .from("organic_calendar_drafts")
          .select("id, status, scheduled_date, slot_data, platform_account_id, instagram_post_id, updated_at")
          .eq("brand_id", brandProfileId)
          .eq("user_id", user.id)
          .or(`and(scheduled_date.gte.${weekStartId},scheduled_date.lte.${weekEnd}),scheduled_date.is.null`)
          .order("updated_at", { ascending: false })

        if (error) return

        const rows = (data ?? []) as PersistedOrganicDraftRow[]

        const days = weekScaffold(weekStartId).map((day) => ({ ...day, slots: [] as OrganicCalendarDraft[] }))
        const dedupedByDraftId = new Map<string, { updatedAt: number; entry: CalendarEntry }>()
        const knownIds = new Set<string>()

        for (const row of rows) {
          if (!row?.id) continue

          const entry = mapPersistedRowToCalendarEntry(row, days)
          if (!entry) continue
          if (!isDayIdInWeekRange(entry.dayId, weekStartId)) continue

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

        setCalendarDays(days)
        knownBackendIdsRef.current = knownIds
      } catch {
        // Best-effort hydration; local cache remains usable.
      } finally {
        hydratedKeyRef.current = key
      }
    }

    void load()
  }, [brandProfileId, setCalendarDays, supabase, weekStartId])

  React.useEffect(() => {
    if (!brandProfileId) return
    const activeKey = `${brandProfileId}:${weekStartId}`
    if (hydratedKeyRef.current !== activeKey) return

    const persistableEntries = calendarDays
      .flatMap((day) =>
        day.slots
          .filter((draft) => draft.status !== "streaming")
          .map((draft) => ({ dayId: day.id, draft }))
      )
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
          const idsToDelete = [...knownBackendIdsRef.current].filter((id) => !allBackendIds.has(id))
          for (const draftId of idsToDelete) {
            const { error } = await organicSchema
              .from("organic_calendar_drafts")
              .delete()
              .eq("id", draftId)
              .eq("user_id", user.id)
            if (!error) {
              knownBackendIdsRef.current.delete(draftId)
            }
          }

          for (const entry of persistableEntries) {
            const payload = buildPersistedDraftPayload({
              brandId: brandProfileId,
              weekStartId,
              dayId: entry.dayId,
              draft: entry.draft,
              platformAccountIds,
            })

            if (!entry.draft.backendDraftId) {
              const { data: created, error } = await organicSchema
                .from("organic_calendar_drafts")
                .insert({
                  brand_id: payload.brand_id,
                  platform_account_id: payload.platform_account_id,
                  status: payload.status,
                  scheduled_date: payload.scheduled_date,
                  slot_data: payload.slot_data,
                  user_id: user.id,
                })
                .select("id")
                .single()
              if (error) continue
              if (!created.id) continue

              knownBackendIdsRef.current.add(created.id)
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
        } finally {
          syncInFlightRef.current = false
        }
      }

      void sync()
    }, 500)

    return () => clearTimeout(timer)
  }, [brandProfileId, calendarDays, platformAccountIds, supabase, updateDraftById, weekStartId])
}
