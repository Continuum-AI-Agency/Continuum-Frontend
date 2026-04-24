import { describe, expect, it } from "bun:test"

import { buildWeekDays } from "@/components/organic/primitives/calendar-utils"
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"
import {
  buildPersistedDraftPayload,
  isDayIdInWeekRange,
  mapPersistedRowToCalendarEntry,
  normalizePersistedStatus,
  type PersistedOrganicDraftRow,
} from "./calendar-draft-persistence"

function makeDraft(partial: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: "draft-1",
    title: "Draft title",
    summary: "Summary",
    timeLabel: "9:00 AM",
    dateLabel: "Mon, Apr 20",
    status: "draft",
    platforms: ["instagram"],
    format: "Post",
    objective: "Draft",
    captionPreview: "Caption",
    tags: [],
    mediaCount: 1,
    ...partial,
  }
}

describe("calendar draft persistence utils", () => {
  it("normalizes persisted statuses safely", () => {
    expect(normalizePersistedStatus("scheduled")).toBe("scheduled")
    expect(normalizePersistedStatus("published")).toBe("published")
    expect(normalizePersistedStatus("streaming")).toBe("draft")
    expect(normalizePersistedStatus(null)).toBe("draft")
  })

  it("builds persistence payload and normalizes transient status", () => {
    const payload = buildPersistedDraftPayload({
      brandId: "11111111-1111-4111-8111-111111111111",
      weekStartId: "2026-04-20",
      dayId: "2026-04-21",
      draft: makeDraft({ status: "streaming", timeLabel: "1:00 PM" }),
      platformAccountIds: { instagram: "acct-123" },
    })

    expect(payload.status).toBe("draft")
    expect(payload.platform_account_id).toBe("acct-123")
    expect(payload.scheduled_date).toBe("2026-04-21")
    expect(payload.slot_data.dayId).toBe("2026-04-21")
    expect(payload.slot_data.weekStart).toBe("2026-04-20")
    expect(payload.slot_data.timeLabel).toBe("1:00 PM")
  })

  it("maps persisted rows back into calendar entries", () => {
    const days = buildWeekDays(new Date("2026-04-20T12:00:00"))
    const row: PersistedOrganicDraftRow = {
      id: "backend-1",
      status: "scheduled",
      scheduled_date: "2026-04-21",
      platform_account_id: "acct-99",
      instagram_post_id: "ig-post-1",
      slot_data: {
        dayId: "2026-04-21",
        timeLabel: "5:00 PM",
        draftSnapshot: {
          id: "local-123",
          title: "Saved title",
          summary: "Saved summary",
          status: "scheduled",
          platforms: ["instagram"],
          format: "Carousel",
          objective: "Awareness",
          captionPreview: "Saved caption",
          tags: ["launch"],
          mediaCount: 2,
        },
      },
    }

    const mapped = mapPersistedRowToCalendarEntry(row, days)
    expect(mapped).not.toBeNull()
    expect(mapped?.dayId).toBe("2026-04-21")
    expect(mapped?.draft.id).toBe("local-123")
    expect(mapped?.draft.backendDraftId).toBe("backend-1")
    expect(mapped?.draft.status).toBe("scheduled")
    expect(mapped?.draft.timeLabel).toBe("5:00 PM")
    expect(mapped?.draft.mediaCount).toBe(2)
  })

  it("checks day id range within a week", () => {
    expect(isDayIdInWeekRange("2026-04-20", "2026-04-20")).toBe(true)
    expect(isDayIdInWeekRange("2026-04-26", "2026-04-20")).toBe(true)
    expect(isDayIdInWeekRange("2026-04-27", "2026-04-20")).toBe(false)
    expect(isDayIdInWeekRange("invalid", "2026-04-20")).toBe(false)
  })
})
