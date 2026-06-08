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

describe("mapPersistedRowToCalendarEntry — generated drafts (content_json shape)", () => {
  const days = buildWeekDays(new Date("2026-06-01T12:00:00"))

  const generatedRow = (): PersistedOrganicDraftRow => ({
    id: "row-1",
    status: "draft",
    scheduled_date: "2026-06-01 11:00:00+00",
    platform_account_id: "acct-1",
    content_plan_id: "11111111-1111-1111-1111-111111111111",
    slot_data: {
      slotId: "spec-1",
      schedule: { dayId: "2026-06-01", timeOfDay: "morning", postIndex: 0 },
      platform: { name: "instagram", accountId: "acct-1" },
      strategy: { objective: "save" },
      contentPlan: { titleTopic: "Glass skin", type: "Reel", format: "carousel" },
    },
    content_json: {
      placementId: "spec-1",
      schedule: { dayId: "2026-06-01", scheduledAt: "2026-06-01T11:00:00.000Z" },
      platform: { name: "instagram", accountId: "acct-1" },
      content: { titleTopic: "Glass skin routine", format: "carousel", objective: "save" },
      copy: { caption: "Your 3-step glass skin routine" },
      creative: { mediaSuggestion: { assetUrl: "https://signed/img.png", kind: "carousel" } },
    },
  })

  it("places a generated draft on the grid and reads content from content_json", () => {
    const entry = mapPersistedRowToCalendarEntry(generatedRow(), days)
    expect(entry).not.toBeNull()
    expect(entry?.dayId).toBe("2026-06-01")
    expect(entry?.draft.title).toBe("Glass skin routine")
    expect(entry?.draft.captionPreview).toBe("Your 3-step glass skin routine")
    expect(entry?.draft.format).toBe("carousel")
    expect(entry?.draft.platforms).toEqual(["instagram"])
    expect(entry?.draft.timeLabel).toBe("11:00 AM")
    expect(entry?.draft.contentPlanId).toBe("11111111-1111-1111-1111-111111111111")
    expect(entry?.draft.mediaSuggestion?.assetUrl).toBe("https://signed/img.png")
  })

  it("resolves the day from scheduled_date when no dayId is present", () => {
    const row = generatedRow()
    ;(row.slot_data as Record<string, unknown>).schedule = {}
    ;(row.content_json as Record<string, unknown>).schedule = {}
    const entry = mapPersistedRowToCalendarEntry(row, days)
    expect(entry?.dayId).toBe("2026-06-01")
  })

  it("leaves contentPlanId null for non-bulk (ad-hoc) drafts", () => {
    const row = generatedRow()
    row.content_plan_id = null
    const entry = mapPersistedRowToCalendarEntry(row, days)
    expect(entry?.draft.contentPlanId).toBeNull()
  })

  it("restores durable publishingAssets from content_json (no draftSnapshot)", () => {
    const row = generatedRow()
    ;(row.content_json as Record<string, unknown>).publishingAssets = [
      { role: "primary", kind: "image", assetId: "asset-1", bucket: "brand-profile-assets", storagePath: "b/p/1.png", storageUrl: "https://signed/1.png", slideIndex: 1 },
      { role: "slide_2", kind: "image", assetId: "asset-2", bucket: "brand-profile-assets", storagePath: "b/p/2.png", storageUrl: "https://signed/2.png", slideIndex: 2 },
    ]
    const entry = mapPersistedRowToCalendarEntry(row, days)
    expect(entry?.draft.publishingAssets).toHaveLength(2)
    expect(entry?.draft.publishingAssets?.[0].storageUrl).toBe("https://signed/1.png")
    expect(entry?.draft.publishingAssets?.[0].assetId).toBe("asset-1")
    expect(entry?.draft.publishingAssets?.[0].bucket).toBe("brand-profile-assets")
    expect(entry?.draft.publishingAssets?.[0].storagePath).toBe("b/p/1.png")
  })

  it("falls back to mediaSuggestion.url/signedUrl when assetUrl is absent", () => {
    const row = generatedRow()
    ;(row.content_json as Record<string, unknown>).creative = {
      mediaSuggestion: { kind: "static", signedUrl: "https://signed/legacy.png" },
    }
    const entry = mapPersistedRowToCalendarEntry(row, days)
    expect(entry?.draft.mediaSuggestion?.assetUrl).toBe("https://signed/legacy.png")
  })

  it("carries the hyperframe sub-object through from content_json", () => {
    const row = generatedRow()
    ;(row.content_json as Record<string, unknown>).content = {
      titleTopic: "Glass skin routine",
      format: "HyperFrame",
      objective: "save",
    }
    ;(row.content_json as Record<string, unknown>).creative = {
      mediaSuggestion: {
        mimeType: "text/html",
        url: "compositions/brand/hf_123/index.html",
        hyperframe: {
          generated: true,
          compositionId: "hf_123",
          bucket: "hyperframes-compositions",
          htmlPath: "compositions/brand/hf_123/index.html",
          coverImageUrl: "https://signed/cover.png",
          coverPath: "compositions/brand/hf_123/cover.png",
          mp4Status: "pending",
        },
      },
    }
    const entry = mapPersistedRowToCalendarEntry(row, days)
    expect(entry).not.toBeNull()
    expect(entry?.draft.format).toBe("HyperFrame")
    expect(entry?.draft.mediaSuggestion?.hyperframe?.compositionId).toBe("hf_123")
    expect(entry?.draft.mediaSuggestion?.hyperframe?.htmlPath).toBe(
      "compositions/brand/hf_123/index.html"
    )
    expect(entry?.draft.mediaSuggestion?.hyperframe?.coverImageUrl).toBe(
      "https://signed/cover.png"
    )
    expect(entry?.draft.mediaSuggestion?.hyperframe?.mp4Status).toBe("pending")
    expect(entry?.draft.mediaSuggestion?.hyperframe?.generated).toBe(true)
  })
})
