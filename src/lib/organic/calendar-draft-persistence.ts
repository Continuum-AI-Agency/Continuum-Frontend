import {
  applyPlannerFutureFloor,
  deriveOrganicMediaStage,
  formatPlannerTimeOfDay,
  type OrganicMediaStage,
  organicMediaStageSchema,
  organicUgcSpecSchema,
  PLANNER_DEFAULT_TIME_OF_DAY,
  parsePlannerTimeOfDay,
  parseSiblingClientKey,
  plannerCompositionSchema,
  plannerDraftHasCopy,
  plannerInstantFromDayTime,
  plannerTimeOfDayInZone,
  resolvePlannerTimeZone,
  toPlannerTimeLabel,
} from '@continuum/contracts';
import {
  makeCalendarDay,
  UNSCHEDULED_DAY_ID,
} from '@/components/organic/primitives/calendar-utils';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicDraftStatus,
} from '@/components/organic/primitives/types';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { isOrganicPlatformKey } from '@/lib/organic/platforms';

type PersistedDraftStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'placeholder';

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

type HyperframeMediaSuggestion = NonNullable<
  NonNullable<OrganicCalendarDraft['mediaSuggestion']>['hyperframe']
>;

function restoreHyperframe(value: unknown): HyperframeMediaSuggestion | undefined {
  const obj = asRecord(value);
  if (Object.keys(obj).length === 0) return undefined;
  const mp4StatusRaw = readString(obj.mp4Status);
  const mp4Status =
    mp4StatusRaw === 'pending' || mp4StatusRaw === 'ready' || mp4StatusRaw === 'failed'
      ? mp4StatusRaw
      : null;
  return {
    generated: typeof obj.generated === 'boolean' ? obj.generated : null,
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
  };
}

type ReelMediaSuggestion = NonNullable<
  NonNullable<OrganicCalendarDraft['mediaSuggestion']>['reel']
>;

function restoreReel(value: unknown): ReelMediaSuggestion | undefined {
  const obj = asRecord(value);
  if (Object.keys(obj).length === 0) return undefined;
  const roleOf = (raw: unknown): 'hook' | 'body' | 'cta' | null => {
    const r = readString(raw);
    return r === 'hook' || r === 'body' || r === 'cta' ? r : null;
  };
  return {
    generated: typeof obj.generated === 'boolean' ? obj.generated : null,
    url: readString(obj.url) ?? null,
    bucket: readString(obj.bucket) ?? null,
    signedUrl: readString(obj.signedUrl) ?? null,
    mimeType: readString(obj.mimeType) ?? null,
    durationSec: readNumber(obj.durationSec) ?? null,
    scenes: asArray(obj.scenes)
      .filter((s): s is Record<string, unknown> =>
        Boolean(s && typeof s === 'object' && !Array.isArray(s)),
      )
      .map((scene) => ({
        index: readNumber(scene.index) ?? null,
        role: roleOf(scene.role),
        prompt: readString(scene.prompt) ?? null,
        captionText: readString(scene.captionText) ?? null,
        durationSec: readNumber(scene.durationSec) ?? null,
        bucket: readString(scene.bucket) ?? null,
        clipUrl: readString(scene.clipUrl) ?? null,
        signedClipUrl: readString(scene.signedClipUrl) ?? null,
        assetId: readString(scene.assetId) ?? null,
        error: readString(scene.error) ?? null,
      })),
    composition: plannerCompositionSchema.safeParse(obj.composition).data ?? null,
    ugc: organicUgcSpecSchema.safeParse(obj.ugc).data ?? null,
    error: readString(obj.error) ?? null,
  };
}

function restoreStoryboard(
  value: unknown,
): NonNullable<OrganicCalendarDraft['mediaSuggestion']>['storyboard'] {
  const arr = asArray(value).filter((a): a is Record<string, unknown> =>
    Boolean(a && typeof a === 'object' && !Array.isArray(a)),
  );
  if (arr.length === 0) return undefined;
  return arr.map((item) => ({
    role: readString(item.role) ?? null,
    bucket: readString(item.bucket) ?? null,
    storagePath: readString(item.storagePath) ?? null,
    storageUrl: readString(item.storageUrl) ?? null,
    format: readString(item.format) ?? null,
    // Survives a reload: without it the join key is dropped on restore.
    sceneIndex: readNumber(item.sceneIndex) ?? null,
  }));
}

function restoreMediaSuggestion(value: unknown): OrganicCalendarDraft['mediaSuggestion'] {
  const obj = asRecord(value);
  if (Object.keys(obj).length === 0) return undefined;
  return {
    provider: readString(obj.provider) ?? null,
    model: readString(obj.model) ?? null,
    kind: readString(obj.kind) ?? null,
    prompt: readString(obj.prompt) ?? null,
    width: readNumber(obj.width) ?? null,
    height: readNumber(obj.height) ?? null,
    assetUrl: readString(obj.assetUrl) ?? readString(obj.url) ?? readString(obj.signedUrl) ?? null,
    // The durable pair (bucket + storage path). Keep them: they are what lets a scheduled
    // publish re-stage the media days later, long after any signed URL has expired.
    url: readString(obj.url) ?? null,
    bucket: readString(obj.bucket) ?? null,
    signedUrl: readString(obj.signedUrl) ?? null,
    // Preserve mediaStatus so a 'user_supplied' attach/apply survives the round-trip
    // — both the attach-wins guard and the refetch-merge protection key off it.
    mediaStatus: (readString(obj.mediaStatus) ?? undefined) as NonNullable<
      OrganicCalendarDraft['mediaSuggestion']
    >['mediaStatus'],
    textReady: typeof obj.textReady === 'boolean' ? obj.textReady : null,
    blueprintReady: typeof obj.blueprintReady === 'boolean' ? obj.blueprintReady : null,
    previewRevision: readString(obj.previewRevision) ?? null,
    ugc: organicUgcSpecSchema.safeParse(obj.ugc).data ?? null,
    alt: readString(obj.alt) ?? null,
    hyperframe: restoreHyperframe(obj.hyperframe) ?? null,
    reel: restoreReel(obj.reel) ?? null,
    storyboard: restoreStoryboard(obj.storyboard),
    // assetBase64 intentionally excluded — too large for Supabase round-trips
    assets: asArray(obj.assets)
      .filter((a): a is Record<string, unknown> =>
        Boolean(a && typeof a === 'object' && !Array.isArray(a)),
      )
      .map((item) => ({
        role: readString(item.role) ?? null,
        order: readNumber(item.order) ?? null,
        provider: readString(item.provider) ?? null,
        model: readString(item.model) ?? null,
        prompt: readString(item.prompt) ?? null,
        width: readNumber(item.width) ?? null,
        height: readNumber(item.height) ?? null,
        // Carry the slide's own URLs through. Dropping them left a refetched carousel with
        // slides that had no addressable media at all — the publish body could not name them,
        // so the post went out as a single image.
        url: readString(item.url) ?? null,
        assetUrl: readString(item.assetUrl) ?? null,
        signedUrl: readString(item.signedUrl) ?? null,
        bucket: readString(item.bucket) ?? null,
        // assetBase64 intentionally excluded — too large for Supabase round-trips
        mimeType: readString(item.mimeType) ?? null,
        error: readString(item.error) ?? null,
      })),
  };
}

function restorePublishingAssets(
  value: unknown,
  fallbackBucket: string | null,
): OrganicCalendarDraft['publishingAssets'] {
  const arr = asArray(value).filter((a): a is Record<string, unknown> =>
    Boolean(a && typeof a === 'object' && !Array.isArray(a)),
  );
  if (arr.length === 0) return undefined;
  return arr.map((item) => ({
    role: readString(item.role) ?? 'primary',
    kind: readString(item.kind) === 'video' ? ('video' as const) : ('image' as const),
    slideIndex: readNumber(item.slideIndex) ?? undefined,
    assetId: readString(item.assetId) ?? null,
    // Rows persisted without their own bucket (legacy single-image realizes,
    // restored with storageUrl: '') inherit the draft's durable mediaSuggestion
    // bucket so they can still enter the preview's re-sign filter.
    bucket: readString(item.bucket) ?? fallbackBucket,
    storagePath: readString(item.storagePath) ?? '',
    storageUrl: readString(item.storageUrl) ?? '',
    mimeType: readString(item.mimeType) ?? undefined,
    width: readNumber(item.width) ?? undefined,
    height: readNumber(item.height) ?? undefined,
  }));
}

function restoreHashtags(value: unknown): OrganicCalendarDraft['hashtags'] {
  const obj = asRecord(value);
  if (Object.keys(obj).length === 0) return undefined;
  const high = readStringArray(obj.high);
  const medium = readStringArray(obj.medium);
  const low = readStringArray(obj.low);
  if (high.length === 0 && medium.length === 0 && low.length === 0) return undefined;
  return { high, medium, low };
}

function restoreAssetHints(value: unknown): OrganicCalendarDraft['assetHints'] {
  const arr = asArray(value).filter((a): a is Record<string, unknown> =>
    Boolean(a && typeof a === 'object' && !Array.isArray(a)),
  );
  if (arr.length === 0) return undefined;
  return arr.map((item) => ({
    role: readString(item.role) ?? '',
    suggestion: readString(item.suggestion) ?? '',
  }));
}

export type PersistedOrganicDraftRow = {
  id: string;
  status: string | null;
  scheduled_date: string | null;
  slot_data: unknown;
  platform_account_id: string | null;
  instagram_post_id?: string | null;
  updated_at?: string | null;
  // Backend-generated drafts (createPost + bulk) carry the rich content here
  // (the CalendarPlacement) rather than in slot_data.draftSnapshot.
  content_json?: unknown;
  // Non-null for drafts that belong to a bulk plan — the "planned" provenance tag.
  content_plan_id?: string | null;
  // Authoritative enrichment ladder stamped by the backend on every persist.
  // Legacy rows (pre-column) are null; we derive a fallback from content_json.
  media_stage?: string | null;
  // Immutable per-brand identity (UNIQUE (brand_id, client_key)). Legacy rows are
  // null; we fall back to the snapshot/row id when mapping.
  client_key?: string | null;
  // Shared by every sibling row of a fanned-out multi-platform post. Null for the
  // ordinary single-platform case — a group of one.
  group_id?: string | null;
};

export type PersistedDraftWritePayload = {
  brand_id: string;
  // First-class platform keying column (mirrors the backend persist path) so the
  // planner can key drafts by (brand_id, platform, scheduled_date).
  platform: string;
  platform_account_id: string;
  status: PersistedDraftStatus;
  scheduled_date: string | null;
  slot_data: Record<string, unknown>;
  // Canonical per-brand identity for UPSERT (brand_id, client_key) — keeps the
  // autosave from inserting a second row for the same logical draft.
  client_key: string;
};

export type PersistedCalendarEntry = {
  dayId: string;
  draft: OrganicCalendarDraft;
};

const FALLBACK_PLATFORM: OrganicPlatformKey = 'instagram';
const UNASSIGNED_PLATFORM_ACCOUNT_ID = 'unassigned';
const PERSISTABLE_STATUS_SET = new Set<PersistedDraftStatus>([
  'draft',
  'scheduled',
  'published',
  'failed',
  'placeholder',
]);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeLocalStatus(status: OrganicDraftStatus): PersistedDraftStatus {
  if (status === 'streaming') return 'draft';
  if (
    status === 'draft' ||
    status === 'scheduled' ||
    status === 'published' ||
    status === 'failed' ||
    status === 'placeholder'
  ) {
    return status;
  }
  return 'draft';
}

export function normalizePersistedStatus(status: unknown): PersistedDraftStatus {
  if (typeof status === 'string' && PERSISTABLE_STATUS_SET.has(status as PersistedDraftStatus)) {
    return status as PersistedDraftStatus;
  }
  return 'draft';
}

function normalizePlatform(value: unknown): OrganicPlatformKey {
  if (typeof value === 'string' && isOrganicPlatformKey(value)) {
    return value;
  }
  return FALLBACK_PLATFORM;
}

/**
 * The chip label a stored instant reads as, in the viewer's zone.
 *
 * This replaces a regex that sliced the ISO string's literal `HH:MM` — i.e. read a
 * UTC wall clock — so every draft stored as a `+00` timestamptz rendered in the
 * wrong zone, and a midnight one rendered as the reported "12:00 AM".
 */
function timeLabelFromInstant(iso: string | null, timeZone?: string | null): string | null {
  if (!iso) return null;
  const timeOfDay = plannerTimeOfDayInZone(iso, timeZone);
  return timeOfDay ? toPlannerTimeLabel(timeOfDay) : null;
}

/** A stored canonical `HH:mm` as the chip label, or null when there isn't one. */
function toPlannerTimeLabelOrNull(timeOfDay: string | null): string | null {
  if (!timeOfDay) return null;
  return parsePlannerTimeOfDay(timeOfDay) ? toPlannerTimeLabel(timeOfDay) : null;
}

function mapSlotDataDraftId(slotData: Record<string, unknown>, rowId: string): string {
  return (
    readString(slotData.placementId) ?? readString(asRecord(slotData.draftSnapshot).id) ?? rowId
  );
}

/**
 * Resolve the calendar day a persisted row belongs on, across every persist
 * shape (manual slot_data, generated content_json, raw scheduled_date). Rows with
 * no resolvable date (a null scheduled_date from an agent/bulk write) collapse to
 * the UNSCHEDULED sentinel so they surface in the list instead of vanishing.
 */
export function resolvePersistedRowDayId(row: PersistedOrganicDraftRow): string {
  const slotData = asRecord(row.slot_data);
  const scheduleData = asRecord(slotData.schedule);
  const placementSchedule = asRecord(asRecord(row.content_json).schedule);
  const scheduledIso = readString(row.scheduled_date);
  return (
    readString(slotData.dayId) ??
    readString(scheduleData.dayId) ??
    readString(placementSchedule.dayId) ??
    (scheduledIso ? scheduledIso.slice(0, 10) : null) ??
    UNSCHEDULED_DAY_ID
  );
}

export function isDayIdInWeekRange(dayId: string, weekStartId: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayId) || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartId)) {
    return false;
  }

  const [year, month, day] = dayId.split('-').map(Number);
  const [weekYear, weekMonth, weekDay] = weekStartId.split('-').map(Number);
  const currentUtc = Date.UTC(year, month - 1, day);
  const weekUtc = Date.UTC(weekYear, weekMonth - 1, weekDay);
  const diffDays = Math.floor((currentUtc - weekUtc) / 86_400_000);
  return diffDays >= 0 && diffDays <= 6;
}

/**
 * The instant a draft's `(day, chip time)` pair names — never a bare calendar day.
 *
 * `scheduled_date` is a full `timestamptz` written verbatim. Writing `dayId` alone
 * let Postgres coerce it to midnight UTC, which discarded the time the user chose
 * on every autosave tick and made the panel render the draft back as "12:00 AM".
 * Composing here, with the same contracts function the reschedule gesture uses,
 * makes the two writers idempotent with respect to each other.
 */
function persistedScheduledDate(args: {
  dayId: string;
  timeLabel?: string | null;
  timeZone?: string | null;
  status: PersistedDraftStatus;
}): string {
  const timeOfDay = parsePlannerTimeOfDay(args.timeLabel);
  const composed = plannerInstantFromDayTime({
    dayId: args.dayId,
    timeOfDay: timeOfDay ? formatPlannerTimeOfDay(timeOfDay) : PLANNER_DEFAULT_TIME_OF_DAY,
    timeZone: args.timeZone,
  });
  // An unparseable day id is not a schedule we can improve on; keep the old
  // behaviour rather than inventing an instant.
  if (!composed) return args.dayId;
  // The future floor exists to stop the publish poller firing the instant a row
  // lands, so it applies ONLY to a status that arms the poller. Flooring a plain
  // draft would silently relocate every past-dated draft to today — a user
  // backfilling last month's calendar would watch their work jump forward.
  return args.status === 'scheduled' ? applyPlannerFutureFloor(composed) : composed;
}

export function buildPersistedDraftPayload(args: {
  brandId: string;
  weekStartId: string;
  dayId: string;
  draft: OrganicCalendarDraft;
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>;
  /** IANA zone the chip's time-of-day is read in. Defaults to the browser's. */
  timeZone?: string | null;
}): PersistedDraftWritePayload {
  const { brandId, weekStartId, dayId, draft, platformAccountIds = {}, timeZone } = args;
  const primaryPlatform = normalizePlatform(draft.platforms[0]);
  const platformAccountId =
    draft.targetAccountId ?? platformAccountIds[primaryPlatform] ?? UNASSIGNED_PLATFORM_ACCOUNT_ID;

  const status = normalizeLocalStatus(draft.status);
  const snapshot: OrganicCalendarDraft = {
    ...draft,
    status,
    backendDraftId: undefined,
  };
  const resolvedTimeZone = resolvePlannerTimeZone(timeZone);
  const timeOfDay = parsePlannerTimeOfDay(draft.timeLabel);

  return {
    brand_id: brandId,
    platform: primaryPlatform,
    platform_account_id: platformAccountId,
    status,
    scheduled_date: persistedScheduledDate({
      dayId,
      timeLabel: draft.timeLabel,
      timeZone: resolvedTimeZone,
      status,
    }),
    // Stable identity == the draft's minted clientKey (fallback to its local id for
    // legacy drafts created before clientKey existed).
    client_key: draft.clientKey ?? draft.id,
    slot_data: {
      placementId: draft.id,
      weekStart: weekStartId,
      dayId,
      timeLabel: draft.timeLabel,
      // Canonical HH:mm beside the display label, so a re-read never has to infer
      // the time by slicing an ISO string (which reads a UTC wall clock).
      timeOfDay: timeOfDay ? formatPlannerTimeOfDay(timeOfDay) : null,
      timeZone: resolvedTimeZone,
      platform: primaryPlatform,
      // First-class: the enrichment ladder's generate-copy route grounds generation on
      // this trend. It must not have to reach into draftSnapshot, a frontend blob.
      trendId: draft.seedTrendId ?? null,
      draftSnapshot: snapshot,
      caption: draft.captionPreview,
      title: draft.title,
    },
  };
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
  localDays: OrganicCalendarDay[],
): OrganicCalendarDay[] {
  // Index server rows on EVERY identity axis. A logical draft can appear locally
  // as an optimistic copy whose `id` differs from the server row's mapped id; the
  // canonical link is `clientKey`. Deduping by id alone let the optimistic copy
  // survive and the autosave re-INSERT it — the duplicate-posts bug.
  const serverDraftIds = new Set<string>();
  const serverBackendIds = new Set<string>();
  const serverClientKeys = new Set<string>();
  serverDays.forEach((day) =>
    day.slots.forEach((slot) => {
      serverDraftIds.add(slot.id);
      if (slot.backendDraftId) serverBackendIds.add(slot.backendDraftId);
      if (slot.clientKey) serverClientKeys.add(slot.clientKey);
    }),
  );

  // A draft the user gave their own creative (AI Studio apply / manual attach) is
  // marked 'user_supplied'. The server row for an agent draft still carries the
  // OLD generated creative, so a refetch would clobber the applied one. Keep the
  // local user-supplied media (keyed on every identity axis) and splice it back
  // onto the matching server slot so the applied creative does not flicker away.
  const userSuppliedLocal = new Map<string, OrganicCalendarDraft>();
  for (const localDay of localDays) {
    for (const draft of localDay.slots) {
      if (draft.mediaSuggestion?.mediaStatus !== 'user_supplied') continue;
      if (draft.backendDraftId) userSuppliedLocal.set(draft.backendDraftId, draft);
      if (draft.clientKey) userSuppliedLocal.set(draft.clientKey, draft);
    }
  }
  const preserveUserSuppliedMedia = (slot: OrganicCalendarDraft): OrganicCalendarDraft => {
    const local =
      (slot.backendDraftId ? userSuppliedLocal.get(slot.backendDraftId) : undefined) ??
      (slot.clientKey ? userSuppliedLocal.get(slot.clientKey) : undefined);
    if (!local) return slot;
    return {
      ...slot,
      mediaSuggestion: local.mediaSuggestion,
      publishingAssets: local.publishingAssets,
      mediaCount: local.mediaCount,
    };
  };
  const serverDaysWithLocalMedia =
    userSuppliedLocal.size === 0
      ? serverDays
      : serverDays.map((day) => ({ ...day, slots: day.slots.map(preserveUserSuppliedMedia) }));

  const unsavedByDayId = new Map<string, OrganicCalendarDraft[]>();
  for (const localDay of localDays) {
    for (const draft of localDay.slots) {
      if (draft.backendDraftId) continue;
      if (serverDraftIds.has(draft.id)) continue;
      // Already represented server-side under the canonical key — not unsaved.
      if (draft.clientKey && serverClientKeys.has(draft.clientKey)) continue;
      if (draft.clientKey && serverBackendIds.has(draft.clientKey)) continue;
      const pending = unsavedByDayId.get(localDay.id) ?? [];
      pending.push(draft);
      unsavedByDayId.set(localDay.id, pending);
    }
  }

  if (unsavedByDayId.size === 0) return serverDaysWithLocalMedia;

  const serverDayIds = new Set(serverDaysWithLocalMedia.map((day) => day.id));
  const merged = serverDaysWithLocalMedia.map((day) => {
    const pending = unsavedByDayId.get(day.id);
    return pending ? { ...day, slots: [...day.slots, ...pending] } : day;
  });

  const localById = new Map(localDays.map((day) => [day.id, day]));
  for (const [dayId, pending] of unsavedByDayId) {
    if (serverDayIds.has(dayId)) continue;
    const base = localById.get(dayId);
    merged.push(
      base ? { ...base, slots: [...pending] } : { ...makeCalendarDay(dayId), slots: [...pending] },
    );
  }
  return merged;
}

// Server-owned provenance. The agent/MCP pre-mint writes origin at slot_data.origin
// (top level); the manual flow writes it under draftSnapshot.origin. 'mcp' collapses
// to 'agent' — both are server-owned (the browser autosave must never write them).
function resolveDraftOrigin(value: unknown): OrganicCalendarDraft['origin'] {
  if (value === 'manual') return 'manual';
  if (value === 'agent' || value === 'mcp') return 'agent';
  return undefined;
}

function resolveMediaStage(
  columnValue: string | null | undefined,
  placement: Record<string, unknown>,
): OrganicMediaStage {
  const parsed = organicMediaStageSchema.safeParse(columnValue);
  if (parsed.success) return parsed.data;
  // Legacy rows predate the column: derive from the durable placement signals.
  return deriveOrganicMediaStage(placement as Parameters<typeof deriveOrganicMediaStage>[0]);
}

// Canonical platform order for a collapsed group. Fixed rather than
// insertion-ordered so a card's badges do not reshuffle between refetches
// (Supabase does not promise a stable row order).
const CANONICAL_GROUP_PLATFORM_ORDER: readonly OrganicPlatformKey[] = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
];

function canonicalPlatformRank(platform: OrganicPlatformKey): number {
  const index = CANONICAL_GROUP_PLATFORM_ORDER.indexOf(platform);
  return index === -1 ? CANONICAL_GROUP_PLATFORM_ORDER.length : index;
}

/**
 * The source row of a group, if it can be identified.
 *
 * Fan-out gives siblings a derived key (`<sourceClientKey>::<platform>`) and leaves the
 * source's bare — so the member whose key carries no sibling suffix IS the source. It is
 * the right representative: the frontend autosave keys on the source's client_key, so
 * collapsing onto a sibling would make every autosave write to the wrong row.
 */
function findGroupSourceEntry(entries: PersistedCalendarEntry[]): PersistedCalendarEntry {
  const source = entries.find(
    (entry) => !entry.draft.clientKey || parseSiblingClientKey(entry.draft.clientKey) === null,
  );
  return source ?? entries[0];
}

/**
 * Collapse fanned-out sibling rows into ONE calendar entry per group.
 *
 * A multi-platform post is N rows sharing a `group_id`; without this the planner renders
 * N identical cards. The renderers already map over `draft.platforms`, so the whole fix
 * is upstream: union the members' platforms onto the source row and carry the per-row
 * identities in `groupMembers` for publish/approve.
 *
 * Grouping is keyed on `(dayId, groupId)`, never `groupId` alone. Siblings can be
 * rescheduled apart, and a group spanning two days is genuinely two cards — merging them
 * would make one of the days silently lose its post.
 */
export function collapseDraftGroups(entries: PersistedCalendarEntry[]): PersistedCalendarEntry[] {
  const groups = new Map<string, PersistedCalendarEntry[]>();
  for (const entry of entries) {
    const groupId = entry.draft.groupId;
    if (!groupId) continue;
    const key = `${entry.dayId}::${groupId}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }

  const collapsedByEntry = new Map<PersistedCalendarEntry, PersistedCalendarEntry>();
  const absorbed = new Set<PersistedCalendarEntry>();

  for (const members of groups.values()) {
    if (members.length < 2) continue;

    const source = findGroupSourceEntry(members);
    const groupMembers = members
      .flatMap((entry) => entry.draft.groupMembers ?? [])
      .sort((a, b) => canonicalPlatformRank(a.platform) - canonicalPlatformRank(b.platform));

    const platforms: OrganicPlatformKey[] = [];
    for (const member of groupMembers) {
      if (!platforms.includes(member.platform)) platforms.push(member.platform);
    }

    collapsedByEntry.set(source, {
      dayId: source.dayId,
      draft: { ...source.draft, platforms, groupMembers },
    });
    for (const entry of members) {
      if (entry !== source) absorbed.add(entry);
    }
  }

  return entries
    .filter((entry) => !absorbed.has(entry))
    .map((entry) => collapsedByEntry.get(entry) ?? entry);
}

export function mapPersistedRowToCalendarEntry(
  row: PersistedOrganicDraftRow,
  days: OrganicCalendarDay[],
): PersistedCalendarEntry | null {
  if (!row.id) return null;

  const slotData = asRecord(row.slot_data);
  const snapshot = asRecord(slotData.draftSnapshot);
  // Backend-generated drafts (createPost + bulk) have no draftSnapshot; their
  // content lives in content_json (the CalendarPlacement). Resolve from both
  // shapes so generated content places on the grid instead of being dropped.
  const placement = asRecord(row.content_json);
  const placementContent = asRecord(placement.content);
  const placementCopy = asRecord(placement.copy);
  const placementPlatform = asRecord(placement.platform);
  const placementCreative = asRecord(placement.creative);
  const placementSchedule = asRecord(placement.schedule);
  const scheduledIso = readString(row.scheduled_date);

  const dayId = resolvePersistedRowDayId(row);
  const day = days.find((item) => item.id === dayId);
  if (!day) return null;
  const isUnscheduled = dayId === UNSCHEDULED_DAY_ID;

  const snapshotPlatforms = readStringArray(snapshot.platforms);
  const platforms =
    snapshotPlatforms.length > 0
      ? snapshotPlatforms.map((platform) => normalizePlatform(platform))
      : [
          normalizePlatform(
            readString(asRecord(slotData.platform).name) ??
              slotData.platform ??
              placementPlatform.name,
          ),
        ];

  const draftId = mapSlotDataDraftId(slotData, row.id);
  const status = normalizePersistedStatus(row.status);
  const clientKey = readString(row.client_key) ?? readString(snapshot.clientKey) ?? draftId;
  const groupId = readString(row.group_id) ?? null;

  const mediaSuggestion = restoreMediaSuggestion(
    Object.keys(asRecord(snapshot.mediaSuggestion)).length > 0
      ? snapshot.mediaSuggestion
      : placementCreative.mediaSuggestion,
  );

  const draft: OrganicCalendarDraft = {
    id: draftId,
    backendDraftId: row.id,
    updatedAt: readString(row.updated_at) ?? null,
    // Canonical identity from the column (fallback: snapshot, else the local id).
    clientKey,
    groupId,
    // A group of one until collapseDraftGroups merges the siblings. Stamping it here
    // (rather than only on grouped rows) is what lets every consumer read groupMembers
    // without a "not grouped" branch.
    groupMembers: [{ backendDraftId: row.id, platform: platforms[0], status, clientKey }],
    title:
      readString(snapshot.title) ??
      readString(slotData.title) ??
      readString(placementContent.titleTopic) ??
      'Saved draft',
    summary: readString(snapshot.summary) ?? '',
    // content_json-first, matching the caption's ordering and for the same reason:
    // it is the column the field-edit route writes, so it is where a user's chosen
    // time actually lives. The slot/snapshot values are older browser-authored
    // echoes; the instant is the last resort and is read in the viewer's zone.
    timeLabel:
      toPlannerTimeLabelOrNull(readString(placementSchedule.timeOfDay)) ??
      toPlannerTimeLabelOrNull(readString(slotData.timeOfDay)) ??
      readString(slotData.timeLabel) ??
      readString(snapshot.timeLabel) ??
      timeLabelFromInstant(scheduledIso, readString(slotData.timeZone)) ??
      day.suggestedTimes[0] ??
      toPlannerTimeLabel(PLANNER_DEFAULT_TIME_OF_DAY),
    dateLabel: isUnscheduled ? '' : `${day.label}, ${day.dateLabel}`,
    status,
    mediaStage: resolveMediaStage(row.media_stage, placement),
    // "Does a caption exist", not "does content_json exist". The old predicate was
    // the latter, so a hand-typed caption (which lands in slot_data on a legacy
    // manual row) left the COPY chip unchecked, while a media-only attach checked it
    // with no copy written at all. The second clause covers those legacy rows.
    hasCopy: plannerDraftHasCopy(placement) || readString(slotData.caption) !== null,
    platforms,
    contentPlanId: readString(row.content_plan_id) ?? null,
    // content_json-first for the same reason as the caption: the field-edit route
    // writes there, so a user's chosen format lives there. A stale draftSnapshot
    // format is what made a Reel-to-Carousel change revert on reload.
    format: readString(placementContent.format) ?? readString(snapshot.format) ?? 'Post',
    objective: readString(snapshot.objective) ?? readString(placementContent.objective) ?? 'Draft',
    // content_json-first: it is canonical for copy — the publisher and the
    // scheduled worker read it, and planner manual edits persist there. The
    // snapshot/slot values are older echoes kept only as fallbacks.
    captionPreview:
      readString(placementCopy.caption) ??
      readString(snapshot.captionPreview) ??
      readString(slotData.caption) ??
      '',
    tags: readStringArray(snapshot.tags),
    mediaCount: readNumber(snapshot.mediaCount) ?? 1,
    seedTrendId: readString(snapshot.seedTrendId) ?? undefined,
    origin: resolveDraftOrigin(snapshot.origin ?? slotData.origin),
    targetAccountId:
      readString(snapshot.targetAccountId) ?? readString(row.platform_account_id) ?? undefined,
    creativeIdea: readString(snapshot.creativeIdea) ?? undefined,
    titleTopic: readString(snapshot.titleTopic) ?? undefined,
    target: readString(snapshot.target) ?? undefined,
    tone: readString(snapshot.tone) ?? undefined,
    cta: readString(snapshot.cta) ?? undefined,
    generationError: readString(snapshot.generationError) ?? undefined,
    instagram_post_id:
      readString(snapshot.instagram_post_id) ?? readString(row.instagram_post_id) ?? null,
    creativeDirectionPrompt:
      readString(placementCreative.creativeDirectionPrompt) ??
      readString(snapshot.creativeDirectionPrompt) ??
      undefined,
    thumbnailPrompt: readString(snapshot.thumbnailPrompt) ?? undefined,
    location: readString(snapshot.location) ?? undefined,
    slideCount: readNumber(snapshot.slideCount) ?? undefined,
    adjusted: typeof snapshot.adjusted === 'boolean' ? snapshot.adjusted : undefined,
    generationAttempts: readNumber(snapshot.generationAttempts) ?? undefined,
    mediaSuggestion,
    publishingAssets: restorePublishingAssets(
      asArray(snapshot.publishingAssets).length > 0
        ? snapshot.publishingAssets
        : placement.publishingAssets,
      mediaSuggestion?.bucket ?? null,
    ),
    // Agent drafts have no draftSnapshot — their copy lives in content_json. Reading only the
    // snapshot is why they published with a caption but no hashtag block.
    hashtags: restoreHashtags(placementCopy.hashtags) ?? restoreHashtags(snapshot.hashtags),
    assetHints: restoreAssetHints(snapshot.assetHints),
  };

  return { dayId, draft };
}
