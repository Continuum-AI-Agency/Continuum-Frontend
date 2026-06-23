import type { OrganicCalendarDay, OrganicCalendarDraft, OrganicDraftStatus } from "@/components/organic/primitives/types"
import { UNSCHEDULED_DAY_ID, makeCalendarDay } from "@/components/organic/primitives/calendar-utils"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"
import { isOrganicPlatformKey } from "@/lib/organic/platforms"
import { deriveOrganicMediaStage, organicMediaStageSchema, type OrganicMediaStage } from "@continuum/contracts"

type PersistedDraftStatus = "draft" | "scheduled" | "published" | "failed" | "placeholder"

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

type HyperframeMediaSuggestion = NonNullable<
  NonNullable<OrganicCalendarDraft["mediaSuggestion"]>["hyperframe"]
>

function restoreHyperframe(value: unknown): HyperframeMediaSuggestion | undefined {
  const obj = asRecord(value)
  if (Object.keys(obj).length === 0) return undefined
  const mp4StatusRaw = readString(obj.mp4Status)
  const mp4Status =
    mp4StatusRaw === "pending" || mp4StatusRaw === "ready" || mp4StatusRaw === "failed"
      ? mp4StatusRaw
      : null
  return {
    generated: typeof obj.generated === "boolean" ? obj.generated : null,
    compositionId: readString(obj.compositionId) ?? null,
    bucket: readString(obj.bucket) ?? null,
    htmlPath: readString(obj.htmlPath) ?? null,
    coverImageUrl: readString(obj.coverImageUrl) ?? null,
    coverPath: readString(obj.coverPath) ?? null,
    coverBase64: readString(obj.coverBase64) ?? null,
    mp4Bucket: readString(obj.mp4Bucket) ?? null,
    mp4Path: readString(obj.mp4Path) ?? null,
    mp4Url: readString(obj.mp4Url) ?? null,
    mp4Status,
    error: readString(obj.error) ?? null,
    spec: obj.spec ?? null,
  }
}

type ReelMediaSuggestion = NonNullable<NonNullable<OrganicCalendarDraft["mediaSuggestion"]>["reel"]>

function restoreReel(value: unknown): ReelMediaSuggestion | undefined {
  const obj = asRecord(value)
  if (Object.keys(obj).length === 0) return undefined
  const roleOf = (raw: unknown): "hook" | "body" | "cta" | null => {
    const r = readString(raw)
    return r === "hook" || r === "body" || r === "cta" ? r : null
  }
  return {
    generated: typeof obj.generated === "boolean" ? obj.generated : null,
    url: readString(obj.url) ?? null,
    bucket: readString(obj.bucket) ?? null,
    signedUrl: readString(obj.signedUrl) ?? null,
    mimeType: readString(obj.mimeType) ?? null,
    durationSec: readNumber(obj.durationSec) ?? null,
    scenes: asArray(obj.scenes)
      .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object" && !Array.isArray(s)))
      .map((scene) => ({
        index: readNumber(scene.index) ?? null,
        role: roleOf(scene.role),
        prompt: readString(scene.prompt) ?? null,
        captionText: readString(scene.captionText) ?? null,
        durationSec: readNumber(scene.durationSec) ?? null,
        clipUrl: readString(scene.clipUrl) ?? null,
        signedClipUrl: readString(scene.signedClipUrl) ?? null,
        error: readString(scene.error) ?? null,
      })),
    error: readString(obj.error) ?? null,
  }
}

function restoreStoryboard(
  value: unknown,
): NonNullable<OrganicCalendarDraft["mediaSuggestion"]>["storyboard"] {
  const arr = asArray(value).filter(
    (a): a is Record<string, unknown> => Boolean(a && typeof a === "object" && !Array.isArray(a)),
  )
  if (arr.length === 0) return undefined
  return arr.map((item) => ({
    role: readString(item.role) ?? null,
    bucket: readString(item.bucket) ?? null,
    storagePath: readString(item.storagePath) ?? null,
    storageUrl: readString(item.storageUrl) ?? null,
    format: readString(item.format) ?? null,
  }))
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
    assetUrl: readString(obj.assetUrl) ?? readString(obj.url) ?? readString(obj.signedUrl) ?? null,
    alt: readString(obj.alt) ?? null,
    hyperframe: restoreHyperframe(obj.hyperframe) ?? null,
    reel: restoreReel(obj.reel) ?? null,
    storyboard: restoreStoryboard(obj.storyboard),
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
    assetId: readString(item.assetId) ?? null,
    bucket: readString(item.bucket) ?? null,
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
  // Backend-generated drafts (createPost + bulk) carry the rich content here
  // (the CalendarPlacement) rather than in slot_data.draftSnapshot.
  content_json?: unknown
  // Non-null for drafts that belong to a bulk plan — the "planned" provenance tag.
  content_plan_id?: string | null
  // Authoritative enrichment ladder stamped by the backend on every persist.
  // Legacy rows (pre-column) are null; we derive a fallback from content_json.
  media_stage?: string | null
  // Immutable per-brand identity (UNIQUE (brand_id, client_key)). Legacy rows are
  // null; we fall back to the snapshot/row id when mapping.
  client_key?: string | null
}

export type PersistedDraftWritePayload = {
  brand_id: string
  // First-class platform keying column (mirrors the backend persist path) so the
  // planner can key drafts by (brand_id, platform, scheduled_date).
  platform: string
  platform_account_id: string
  status: PersistedDraftStatus
  scheduled_date: string | null
  slot_data: Record<string, unknown>
  // Canonical per-brand identity for UPSERT (brand_id, client_key) — keeps the
  // autosave from inserting a second row for the same logical draft.
  client_key: string
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

/** Derive a "h:mm AM/PM" label from an ISO/timestamptz string's time part. */
function formatIsoTimeLabel(iso: string | null): string | null {
  if (!iso) return null
  const match = iso.match(/[T ](\d{2}):(\d{2})/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = match[2]
  const meridiem = hour >= 12 ? "PM" : "AM"
  hour = hour % 12 || 12
  return `${hour}:${minute} ${meridiem}`
}

function mapSlotDataDraftId(slotData: Record<string, unknown>, rowId: string): string {
  return (
    readString(slotData.placementId) ??
    readString(asRecord(slotData.draftSnapshot).id) ??
    rowId
  )
}

/**
 * Resolve the calendar day a persisted row belongs on, across every persist
 * shape (manual slot_data, generated content_json, raw scheduled_date). Rows with
 * no resolvable date (a null scheduled_date from an agent/bulk write) collapse to
 * the UNSCHEDULED sentinel so they surface in the list instead of vanishing.
 */
export function resolvePersistedRowDayId(row: PersistedOrganicDraftRow): string {
  const slotData = asRecord(row.slot_data)
  const scheduleData = asRecord(slotData.schedule)
  const placementSchedule = asRecord(asRecord(row.content_json).schedule)
  const scheduledIso = readString(row.scheduled_date)
  return (
    readString(slotData.dayId) ??
    readString(scheduleData.dayId) ??
    readString(placementSchedule.dayId) ??
    (scheduledIso ? scheduledIso.slice(0, 10) : null) ??
    UNSCHEDULED_DAY_ID
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
    platform: primaryPlatform,
    platform_account_id: platformAccountId,
    status,
    scheduled_date: dayId,
    // Stable identity == the draft's minted clientKey (fallback to its local id for
    // legacy drafts created before clientKey existed).
    client_key: draft.clientKey ?? draft.id,
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

/**
 * Reconcile a server-authoritative day set with the local one WITHOUT dropping
 * in-flight local drafts. A freshly-constructed manual draft lives only in the
 * local store until the debounced autosave inserts it (~500ms); a refetch in that
 * window must not wipe it. We preserve only NEVER-persisted local drafts (no
 * backendDraftId) that the server hasn't echoed yet — a draft that already has a
 * backendDraftId but is absent from the server was deleted/out-of-range, so it is
 * intentionally NOT resurrected. A never-persisted draft on a day the server
 * scaffold doesn't yet cover (e.g. a manual draft on a far day, created before
 * its autosave landed) carries over on a re-created day so the refetch can't wipe
 * in-flight work.
 */
export function mergeUnsavedLocalDrafts(
  serverDays: OrganicCalendarDay[],
  localDays: OrganicCalendarDay[]
): OrganicCalendarDay[] {
  // Index server rows on EVERY identity axis. A logical draft can appear locally
  // as an optimistic copy whose `id` differs from the server row's mapped id; the
  // canonical link is `clientKey`. Deduping by id alone let the optimistic copy
  // survive and the autosave re-INSERT it — the duplicate-posts bug.
  const serverDraftIds = new Set<string>()
  const serverBackendIds = new Set<string>()
  const serverClientKeys = new Set<string>()
  serverDays.forEach((day) =>
    day.slots.forEach((slot) => {
      serverDraftIds.add(slot.id)
      if (slot.backendDraftId) serverBackendIds.add(slot.backendDraftId)
      if (slot.clientKey) serverClientKeys.add(slot.clientKey)
    }),
  )

  const unsavedByDayId = new Map<string, OrganicCalendarDraft[]>()
  for (const localDay of localDays) {
    for (const draft of localDay.slots) {
      if (draft.backendDraftId) continue
      if (serverDraftIds.has(draft.id)) continue
      // Already represented server-side under the canonical key — not unsaved.
      if (draft.clientKey && serverClientKeys.has(draft.clientKey)) continue
      if (draft.clientKey && serverBackendIds.has(draft.clientKey)) continue
      const pending = unsavedByDayId.get(localDay.id) ?? []
      pending.push(draft)
      unsavedByDayId.set(localDay.id, pending)
    }
  }

  if (unsavedByDayId.size === 0) return serverDays

  const serverDayIds = new Set(serverDays.map((day) => day.id))
  const merged = serverDays.map((day) => {
    const pending = unsavedByDayId.get(day.id)
    return pending ? { ...day, slots: [...day.slots, ...pending] } : day
  })

  const localById = new Map(localDays.map((day) => [day.id, day]))
  for (const [dayId, pending] of unsavedByDayId) {
    if (serverDayIds.has(dayId)) continue
    const base = localById.get(dayId)
    merged.push(base ? { ...base, slots: [...pending] } : { ...makeCalendarDay(dayId), slots: [...pending] })
  }
  return merged
}

// Server-owned provenance. The agent/MCP pre-mint writes origin at slot_data.origin
// (top level); the manual flow writes it under draftSnapshot.origin. 'mcp' collapses
// to 'agent' — both are server-owned (the browser autosave must never write them).
function resolveDraftOrigin(value: unknown): OrganicCalendarDraft["origin"] {
  if (value === "manual") return "manual"
  if (value === "agent" || value === "mcp") return "agent"
  return undefined
}

function resolveMediaStage(
  columnValue: string | null | undefined,
  placement: Record<string, unknown>,
): OrganicMediaStage {
  const parsed = organicMediaStageSchema.safeParse(columnValue)
  if (parsed.success) return parsed.data
  // Legacy rows predate the column: derive from the durable placement signals.
  return deriveOrganicMediaStage(placement as Parameters<typeof deriveOrganicMediaStage>[0])
}

export function mapPersistedRowToCalendarEntry(
  row: PersistedOrganicDraftRow,
  days: OrganicCalendarDay[]
): PersistedCalendarEntry | null {
  if (!row.id) return null

  const slotData = asRecord(row.slot_data)
  const snapshot = asRecord(slotData.draftSnapshot)
  // Backend-generated drafts (createPost + bulk) have no draftSnapshot; their
  // content lives in content_json (the CalendarPlacement). Resolve from both
  // shapes so generated content places on the grid instead of being dropped.
  const placement = asRecord(row.content_json)
  const placementContent = asRecord(placement.content)
  const placementCopy = asRecord(placement.copy)
  const placementPlatform = asRecord(placement.platform)
  const placementCreative = asRecord(placement.creative)
  const scheduledIso = readString(row.scheduled_date)

  const dayId = resolvePersistedRowDayId(row)
  const day = days.find((item) => item.id === dayId)
  if (!day) return null
  const isUnscheduled = dayId === UNSCHEDULED_DAY_ID

  const snapshotPlatforms = readStringArray(snapshot.platforms)
  const platforms =
    snapshotPlatforms.length > 0
      ? snapshotPlatforms.map((platform) => normalizePlatform(platform))
      : [
          normalizePlatform(
            readString(asRecord(slotData.platform).name) ??
              slotData.platform ??
              placementPlatform.name,
          ),
        ]

  const draftId = mapSlotDataDraftId(slotData, row.id)

  const draft: OrganicCalendarDraft = {
    id: draftId,
    backendDraftId: row.id,
    // Canonical identity from the column (fallback: snapshot, else the local id).
    clientKey: readString(row.client_key) ?? readString(snapshot.clientKey) ?? draftId,
    title:
      readString(snapshot.title) ??
      readString(slotData.title) ??
      readString(placementContent.titleTopic) ??
      "Saved draft",
    summary: readString(snapshot.summary) ?? "",
    timeLabel:
      readString(slotData.timeLabel) ??
      readString(snapshot.timeLabel) ??
      formatIsoTimeLabel(scheduledIso) ??
      day.suggestedTimes[0] ??
      "9:00 AM",
    dateLabel: isUnscheduled ? "" : `${day.label}, ${day.dateLabel}`,
    status: normalizePersistedStatus(row.status),
    mediaStage: resolveMediaStage(row.media_stage, placement),
    platforms,
    contentPlanId: readString(row.content_plan_id) ?? null,
    format: readString(snapshot.format) ?? readString(placementContent.format) ?? "Post",
    objective: readString(snapshot.objective) ?? readString(placementContent.objective) ?? "Draft",
    captionPreview:
      readString(snapshot.captionPreview) ??
      readString(slotData.caption) ??
      readString(placementCopy.caption) ??
      "",
    tags: readStringArray(snapshot.tags),
    mediaCount: readNumber(snapshot.mediaCount) ?? 1,
    seedTrendId: readString(snapshot.seedTrendId) ?? undefined,
    origin: resolveDraftOrigin(snapshot.origin ?? slotData.origin),
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
    mediaSuggestion: restoreMediaSuggestion(
      Object.keys(asRecord(snapshot.mediaSuggestion)).length > 0
        ? snapshot.mediaSuggestion
        : placementCreative.mediaSuggestion,
    ),
    publishingAssets: restorePublishingAssets(
      asArray(snapshot.publishingAssets).length > 0
        ? snapshot.publishingAssets
        : placement.publishingAssets,
    ),
    hashtags: restoreHashtags(snapshot.hashtags),
    assetHints: restoreAssetHints(snapshot.assetHints),
  }

  return { dayId, draft }
}
