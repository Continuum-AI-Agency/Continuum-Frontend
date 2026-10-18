import { z } from 'zod';
import { plannerDayIdSchema, plannerTimeOfDaySchema } from './planner-schedule';
import { publishOptionsByPlatformSchema } from './publish-body';
import { type PublishPlatform, publishPlatformSchema } from './publishing';

/**
 * A planner draft FIELD EDIT — the one shape a caption, format, hashtag, creative
 * direction, schedule or media change travels in, and the one mapping from that
 * shape onto `organic.organic_calendar_drafts.content_json`.
 *
 * Why it is shared rather than duplicated: `content_json` is the column the
 * publisher and the scheduled-publish worker read. An edit that lands anywhere
 * else (the browser's `slot_data.draftSnapshot`, a Zustand store) is invisible to
 * publish and is discarded by the next refetch. Both writers — the planner preview
 * panel and the MCP `planner_manage` umbrella — must therefore agree on which
 * `content_json` key each editable field owns. Encoding that agreement twice is
 * exactly the drift root AGENTS.md section 4 forbids.
 *
 * Everything here is pure. No IO, no clock, no zone resolution: composing a
 * schedule instant belongs to `planner-schedule.ts`, which both sides already use.
 */

export const plannerHashtagTiersSchema = z
  .object({
    high: z.array(z.string()).optional(),
    medium: z.array(z.string()).optional(),
    low: z.array(z.string()).optional(),
  })
  .strict();
export type PlannerHashtagTiers = z.infer<typeof plannerHashtagTiersSchema>;

/**
 * A media assignment. `publishingAssets` is what publish reads; `mediaSuggestion`
 * is what the calendar and preview render before realization. Both move together
 * because a placement whose assets and suggestion disagree renders one thing and
 * publishes another.
 *
 * Deliberately looser than `organicPublishingAssetSchema` / `organicMediaSuggestionSchema`:
 * this is a PASSTHROUGH of data that already came out of the generation pipeline or
 * the media library, round-tripped through a nullable database column, so the browser
 * legitimately holds `null` where the strict emit-side schema has `undefined`. The wire
 * checks the fields publish cannot do without and tolerates the rest; the strict
 * placement schema still governs what the pipeline emits and what publish reads.
 */
const plannerMediaAssetPassthroughSchema = z
  .object({
    role: z.string(),
    kind: z.enum(['image', 'video']),
    storagePath: z.string(),
    storageUrl: z.string(),
  })
  .passthrough();

export const plannerDraftMediaPatchSchema = z
  .object({
    publishingAssets: z.array(plannerMediaAssetPassthroughSchema),
    mediaSuggestion: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type PlannerDraftMediaPatch = z.infer<typeof plannerDraftMediaPatchSchema>;

/** Fields a planner edit may name. The patch must carry at least one. */
export const PLANNER_EDITABLE_FIELDS = [
  'caption',
  'hashtags',
  'format',
  'titleTopic',
  'creativeDirection',
  'dayId',
  'timeOfDay',
  'media',
  'publishOptions',
  'platform',
] as const;
export type PlannerEditableField = (typeof PLANNER_EDITABLE_FIELDS)[number];

/**
 * Instagram's cap is the tightest of the platforms the planner publishes to, and a
 * caption longer than this is rejected at the Graph boundary — so it is rejected
 * here rather than persisted and failed at publish time.
 */
export const PLANNER_CAPTION_MAX_LENGTH = 2200;

export const plannerDraftFieldPatchSchema = z
  .object({
    caption: z.string().max(PLANNER_CAPTION_MAX_LENGTH).optional(),
    hashtags: plannerHashtagTiersSchema.optional(),
    format: z.string().min(1).optional(),
    titleTopic: z.string().optional(),
    creativeDirection: z.string().optional(),
    dayId: plannerDayIdSchema.optional(),
    timeOfDay: plannerTimeOfDaySchema.optional(),
    media: plannerDraftMediaPatchSchema.optional(),
    /**
     * The whole per-platform options map, replacing the saved one. Sent whole rather
     * than per platform so clearing a field is expressible: the absent key IS the clear.
     */
    publishOptions: publishOptionsByPlatformSchema.optional(),
    /**
     * Move the draft to another network: the `platform` column, `platform_account_id` and every
     * `slot_data` key the planner reads a row's platform from. Persisted here, beside every other
     * edit, rather than written to Supabase from the browser.
     */
    platform: publishPlatformSchema.optional(),
    /**
     * The account bound with that platform; null when none is chosen yet. Required whenever
     * `platform` is named, so a retarget can never keep the previous network's account.
     */
    accountId: z.string().min(1).nullable().optional(),
    /**
     * Optimistic-concurrency token: the `updated_at` the caller last saw. The
     * write RPC fails the item with `stale_state` when the row has moved on, so a
     * stale browser tab cannot silently overwrite a teammate's or the agent's edit.
     */
    expected_updated_at: z.string().nullable().optional(),
  })
  .strict()
  .refine((patch) => PLANNER_EDITABLE_FIELDS.some((field) => patch[field] !== undefined), {
    message: 'patch must name at least one editable field',
  })
  .refine((patch) => (patch.platform === undefined) === (patch.accountId === undefined), {
    message: 'platform and accountId travel together (accountId may be null)',
    path: ['accountId'],
  });
export type PlannerDraftFieldPatch = z.infer<typeof plannerDraftFieldPatchSchema>;

/** A `timeOfDay` without a `dayId` cannot be composed into an instant. */
export function plannerFieldPatchTouchesSchedule(patch: PlannerDraftFieldPatch): boolean {
  return patch.dayId !== undefined || patch.timeOfDay !== undefined;
}

/**
 * The `content_json` FRAGMENT a field patch means — a partial, for the merge, never
 * a replacement. Keys mirror `organicCalendarPlacementSchema`, so a patched row
 * still parses as a placement.
 *
 * `creativeDirection` writes BOTH `creative.creativeIdea` (what the generation
 * pipeline reads as the brief) and `creative.creativeDirectionPrompt` (what the
 * preview panel renders back). They are the same user intent stored under two
 * names; writing one and not the other is why an edited direction used to vanish
 * from the panel while still steering generation.
 */
export function plannerFieldPatchToContentJson(
  patch: PlannerDraftFieldPatch,
): Record<string, unknown> {
  const contentJson: Record<string, unknown> = {};

  const copy: Record<string, unknown> = {};
  if (patch.caption !== undefined) copy.caption = patch.caption;
  if (patch.hashtags !== undefined) copy.hashtags = patch.hashtags;
  if (Object.keys(copy).length > 0) contentJson.copy = copy;

  const content: Record<string, unknown> = {};
  if (patch.format !== undefined) content.format = patch.format;
  if (patch.titleTopic !== undefined) content.titleTopic = patch.titleTopic;
  if (Object.keys(content).length > 0) contentJson.content = content;

  const creative: Record<string, unknown> = {};
  if (patch.creativeDirection !== undefined) {
    creative.creativeIdea = patch.creativeDirection;
    creative.creativeDirectionPrompt = patch.creativeDirection;
  }
  if (patch.media?.mediaSuggestion !== undefined) {
    creative.mediaSuggestion = patch.media.mediaSuggestion;
  }
  if (Object.keys(creative).length > 0) contentJson.creative = creative;

  if (patch.media !== undefined) {
    contentJson.publishingAssets = patch.media.publishingAssets;
  }

  if (patch.publishOptions !== undefined) contentJson.publishOptions = patch.publishOptions;

  return contentJson;
}

const UNASSIGNED_ACCOUNT_ID = 'unassigned';

/**
 * The row columns a platform edit rewrites: every place a draft's platform is stamped. The
 * publisher reads the `platform` column, but the planner maps a row back from
 * `slot_data.draftSnapshot` and then `slot_data.platform`, so writing only the column puts the
 * card back on its old row at the next refetch.
 *
 * Merged onto the current `slot_data`, never rebuilt: an agent row carries no draftSnapshot (none
 * is invented) and may store `slot_data.platform` as `{ name, accountId }` — whose `accountId`
 * is replaced too, because it outranks the column when the publisher resolves the account.
 */
export function retargetDraftPlatformRow(
  slotData: unknown,
  platform: PublishPlatform,
  accountId: string | null,
): { platform: PublishPlatform; platform_account_id: string; slot_data: Record<string, unknown> } {
  const current = readRecord(slotData);
  const slotPlatform = current.platform;
  const snapshot = current.draftSnapshot;
  const platformObject = withoutKey(readRecord(slotPlatform), 'accountId');
  return {
    platform,
    platform_account_id: accountId ?? UNASSIGNED_ACCOUNT_ID,
    slot_data: {
      ...current,
      platform:
        slotPlatform && typeof slotPlatform === 'object'
          ? { ...platformObject, name: platform, ...(accountId ? { accountId } : {}) }
          : platform,
      ...(snapshot && typeof snapshot === 'object'
        ? {
            draftSnapshot: {
              ...withoutKey(readRecord(snapshot), 'targetAccountId'),
              platforms: [platform],
              ...(accountId ? { targetAccountId: accountId } : {}),
            },
          }
        : {}),
    },
  };
}

function withoutKey(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Does this draft have copy? A CAPTION exists — not "the row has a `content_json`".
 *
 * The distinction is load-bearing in two directions. The frontend's COPY
 * completion chip used to read "is `content_json` non-empty", so a hand-typed
 * caption left it unchecked while the caption rendered everywhere. The backend's
 * `/generate-copy` gate used the same predicate, so once ANY `content_json` existed
 * — a media-only attach, for instance — copy generation started refusing with
 * `already_has_copy` on drafts that had never been written. One predicate, defined
 * here, is what keeps the chip and the gate from disagreeing.
 */
export function plannerDraftHasCopy(contentJson: unknown): boolean {
  const copy = readRecord(readRecord(contentJson).copy);
  const caption = copy.caption;
  return typeof caption === 'string' && caption.trim().length > 0;
}
