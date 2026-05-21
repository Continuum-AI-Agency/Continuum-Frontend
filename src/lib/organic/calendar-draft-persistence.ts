import type { OrganicCalendarDay, OrganicCalendarDraft, OrganicDraftStatus } from "@/components/organic/primitives/types"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import { isOrganicPlatformKey } from "@/lib/organic/platforms"

type PersistedDraftStatus = "draft" | "scheduled" | "published" | "failed" | "placeholder"

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function restoreMediaSuggestion(value: unknown): OrganicCalendarDraft["mediaSuggestion"] {
  const obj = asRecord(value)
  if (Object.keys(obj).length === 0) return undefined
  return {
    provider: readString(obj.provider) ?? null,
    model: readString(obj.model) ?? null,
    kind: readString(obj.kind) ?? null,
    prompt: readString(obj.prompt) ?? null,
    width: readNumber(obj.width) ?? null,
    height: readNumber(obj.height) ?? null,
    assetUrl: readString(obj.assetUrl) ?? null,
    alt: readString(obj.alt) ?? null,
    // assetBase64 intentionally excluded — too large for Supabase round-trips
    assets: asArray(obj.assets)
      .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === "object" && !Array.isArray(a)))
      .map((item) => ({
        role: readString(item.role) ?? null,
        order: readNumber(item.order) ?? null,
        provider: readString(item.provider) ?? null,
        model: readString(item.model) ?? null,
        prompt: readString(item.prompt) ?? null,
        width: readNumber(item.width) ?? null,
        height: readNumber(item.height) ?? null,
        // assetBase64 intentionally excluded
        mimeType: readString(item.mimeType) ?? null,
        error: readString(item.error) ?? null,
      })),
  }
}

function restorePublishingAssets(value: unknown): OrganicCalendarDraft["publishingAssets"] {
  const arr = asArray(value).filter(
    (a): a is Record<string, unknown> => Boolean(a && typeof a === "object" && !Array.isArray(a))
  )
  if (arr.length === 0) return undefined
  return arr.map((item) => ({
    role: readString(item.role) ?? "primary",
    kind: readString(item.kind) === "video" ? ("video" as const) : ("image" as const),
    slideIndex: readNumber(item.slideIndex) ?? undefined,
    storagePath: readString(item.storagePath) ?? "",
    storageUrl: readString(item.storageUrl) ?? "",
    mimeType: readString(item.mimeType) ?? undefined,
    width: readNumber(item.width) ?? undefined,
    height: readNumber(item.height) ?? undefined,
  }))
}

function restoreHashtags(value: unknown): OrganicCalendarDraft["hashtags"] {
  const obj = asRecord(value)
  if (Object.keys(obj).length === 0) return undefined
  const high = readStringArray(obj.high)
  const medium = readStringArray(obj.medium)
  const low = readStringArray(obj.low)
  if (high.length === 0 && medium.length === 0 && low.length === 0) return undefined
  return { high, medium, low }
}

function restoreAssetHints(value: unknown): OrganicCalendarDraft["assetHints"] {
  const arr = asArray(value).filter(
    (a): a is Record<string, unknown> => Boolean(a && typeof a === "object" && !Array.isArray(a))
  )
  if (arr.length === 0) return undefined
  return arr.map((item) => ({
    role: readString(item.role) ?? "",
    suggestion: readString(item.suggestion) ?? "",
  }))
}

export type PersistedOrganicDraftRow = {
  id: string
  status: string | null
  scheduled_date: string | null
  slot_data: unknown
  platform_account_id: string | null
  instagram_post_id?: string | null
  updated_at?: string | null
}

export type PersistedDraftWritePayload = {
  brand_id: string
  platform_account_id: string
  status: PersistedDraftStatus
  scheduled_date: string | null
  slot_data: Record<string, unknown>
}

export type PersistedCalendarEntry = {
  dayId: string
  draft: OrganicCalendarDraft
}

const FALLBACK_PLATFORM: OrganicPlatformKey = "instagram"
const UNASSIGNED_PLATFORM_ACCOUNT_ID = "unassigned"
const PERSISTABLE_STATUS_SET = new Set<PersistedDraftStatus>([
  "draft",
  "scheduled",
  "published",
  "failed",
  "placeholder",
])

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeLocalStatus(status: OrganicDraftStatus): PersistedDraftStatus {
  if (status === "streaming") return "draft"
  if (
    status === "draft" ||
    status === "scheduled" ||
    status === "published" ||
    status === "failed" ||
    status === "placeholder"
  ) {
    return status
  }
  return "draft"
}

export function normalizePersistedStatus(status: unknown): PersistedDraftStatus {
  if (typeof status === "string" && PERSISTABLE_STATUS_SET.has(status as PersistedDraftStatus)) {
    return status as PersistedDraftStatus
  }
  return "draft"
}

function normalizePlatform(value: unknown): OrganicPlatformKey {
  if (typeof value === "string" && isOrganicPlatformKey(value)) {
    return value
  }
  return FALLBACK_PLATFORM
}

function mapSlotDataDraftId(slotData: Record<string, unknown>, rowId: string): string {
  return (
    readString(slotData.placementId) ??
    readString(asRecord(slotData.draftSnapshot).id) ??
    rowId
  )
}

export function isDayIdInWeekRange(dayId: string, weekStartId: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayId) || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartId)) {
    return false
  }

  const [year, month, day] = dayId.split("-").map(Number)
  const [weekYear, weekMonth, weekDay] = weekStartId.split("-").map(Number)
  const currentUtc = Date.UTC(year, month - 1, day)
  const weekUtc = Date.UTC(weekYear, weekMonth - 1, weekDay)
  const diffDays = Math.floor((currentUtc - weekUtc) / 86_400_000)
  return diffDays >= 0 && diffDays <= 6
}

export function buildPersistedDraftPayload(args: {
  brandId: string
  weekStartId: string
  dayId: string
  draft: OrganicCalendarDraft
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>
}): PersistedDraftWritePayload {
  const { brandId, weekStartId, dayId, draft, platformAccountIds = {} } = args
  const primaryPlatform = normalizePlatform(draft.platforms[0])
  const platformAccountId =
    draft.targetAccountId ??
    platformAccountIds[primaryPlatform] ??
    UNASSIGNED_PLATFORM_ACCOUNT_ID

  const status = normalizeLocalStatus(draft.status)
  const snapshot: OrganicCalendarDraft = {
    ...draft,
    status,
    backendDraftId: undefined,
  }

  return {
    brand_id: brandId,
    platform_account_id: platformAccountId,
    status,
    scheduled_date: dayId,
    slot_data: {
      placementId: draft.id,
      weekStart: weekStartId,
      dayId,
      timeLabel: draft.timeLabel,
      platform: primaryPlatform,
      draftSnapshot: snapshot,
      caption: draft.captionPreview,
      title: draft.title,
    },
  }
}

export function mapPersistedRowToCalendarEntry(
  row: PersistedOrganicDraftRow,
  days: OrganicCalendarDay[]
): PersistedCalendarEntry | null {
  if (!row.id) return null

  const slotData = asRecord(row.slot_data)
  const snapshot = asRecord(slotData.draftSnapshot)

  const dayId = readString(slotData.dayId) ?? readString(row.scheduled_date)
  if (!dayId) return null
  const day = days.find((item) => item.id === dayId)
  if (!day) return null

  const snapshotPlatforms = readStringArray(snapshot.platforms)
  const platforms =
    snapshotPlatforms.length > 0
      ? snapshotPlatforms.map((platform) => normalizePlatform(platform))
      : [normalizePlatform(slotData.platform)]

  const draftId = mapSlotDataDraftId(slotData, row.id)

  const draft: OrganicCalendarDraft = {
    id: draftId,
    backendDraftId: row.id,
    title: readString(snapshot.title) ?? readString(slotData.title) ?? "Saved draft",
    summary: readString(snapshot.summary) ?? "",
    timeLabel: readString(slotData.timeLabel) ?? readString(snapshot.timeLabel) ?? day.suggestedTimes[0] ?? "9:00 AM",
    dateLabel: `${day.label}, ${day.dateLabel}`,
    status: normalizePersistedStatus(row.status),
    platforms,
    format: readString(snapshot.format) ?? "Post",
    objective: readString(snapshot.objective) ?? "Draft",
    captionPreview:
      readString(snapshot.captionPreview) ??
      readString(slotData.caption) ??
      "",
    tags: readStringArray(snapshot.tags),
    mediaCount: readNumber(snapshot.mediaCount) ?? 1,
    seedTrendId: readString(snapshot.seedTrendId) ?? undefined,
    targetAccountId: readString(snapshot.targetAccountId) ?? readString(row.platform_account_id) ?? undefined,
    creativeIdea: readString(snapshot.creativeIdea) ?? undefined,
    titleTopic: readString(snapshot.titleTopic) ?? undefined,
    target: readString(snapshot.target) ?? undefined,
    tone: readString(snapshot.tone) ?? undefined,
    cta: readString(snapshot.cta) ?? undefined,
    generationError: readString(snapshot.generationError) ?? undefined,
    instagram_post_id: readString(snapshot.instagram_post_id) ?? readString(row.instagram_post_id) ?? null,
    creativeDirectionPrompt: readString(snapshot.creativeDirectionPrompt) ?? undefined,
    thumbnailPrompt: readString(snapshot.thumbnailPrompt) ?? undefined,
    location: readString(snapshot.location) ?? undefined,
    slideCount: readNumber(snapshot.slideCount) ?? undefined,
    adjusted: typeof snapshot.adjusted === "boolean" ? snapshot.adjusted : undefined,
    generationAttempts: readNumber(snapshot.generationAttempts) ?? undefined,
    mediaSuggestion: restoreMediaSuggestion(snapshot.mediaSuggestion),
    publishingAssets: restorePublishingAssets(snapshot.publishingAssets),
    hashtags: restoreHashtags(snapshot.hashtags),
    assetHints: restoreAssetHints(snapshot.assetHints),
  }

  return { dayId, draft }
}
