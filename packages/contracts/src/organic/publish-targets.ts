/**
 * Publish targets: WHO a post goes to (the brand's posting accounts), WHERE (one member row per
 * platform in a group) and WHETHER each platform can take it (the verdict).
 *
 * One model, shared by both sides. A multi-platform post is a GROUP: one
 * `organic_calendar_drafts` row per platform under a `group_id` (a lone draft is a group of one:
 * `group_id` null until its first fan-out, which writes it). Each member carries its own caption, media and ONE account stamp —
 * `platform_account_id` — and publishes to exactly that account. The browser never holds a
 * platform list of its own; it reads the group from the backend and writes membership through it.
 */
import { z } from 'zod';
import { type HashtagTiers, platformCaptionLength } from '../media/instagram-caption';
import {
  captionTooLongMessage,
  PUBLISH_PLATFORM_LABELS,
  type PublishAccountCandidate,
  publishAccountCandidateSchema,
} from './publish-plan';
import {
  captionLimits,
  type PublishFormat,
  type PublishPlatform,
  publishFormatSchema,
  publishPlatformSchema,
  supportsFormat,
} from './publishing';

/** THE platform order. Every selector, badge row and list renders platforms in this order. */
export const PUBLISH_PLATFORM_ORDER: readonly PublishPlatform[] = publishPlatformSchema.options;

// ── Candidates ────────────────────────────────────────────────────────────────
// `publishAccountCandidateSchema` lives in `publish-plan.ts`, beside the resolver that judges a
// stamp against it; it is re-exported from the package root like everything else.

/** GET /api/organic/publish-accounts?brandId=<uuid>[&platform=<platform>] */
export const publishAccountsQuerySchema = z.object({
  brandId: z.string().uuid(),
  platform: publishPlatformSchema.optional(),
});
export const publishAccountsResponseSchema = z.object({
  /** Every platform, in `PUBLISH_PLATFORM_ORDER`, the default first within a platform. */
  accounts: z.array(publishAccountCandidateSchema),
});
export type PublishAccountsResponse = z.infer<typeof publishAccountsResponseSchema>;

/** PUT /api/organic/publish-accounts/default → `publishAccountsResponseSchema` */
export const setDefaultPublishAccountRequestSchema = z.object({
  brandId: z.string().uuid(),
  platform: publishPlatformSchema,
  accountId: z.string().min(1),
});
export type SetDefaultPublishAccountRequest = z.infer<typeof setDefaultPublishAccountRequestSchema>;

// ── Verdict ───────────────────────────────────────────────────────────────────

export const publishTargetVerdictSchema = z.object({
  platform: publishPlatformSchema,
  /** Connected, format supported and caption fits: the selector may tick it. */
  available: z.boolean(),
  /** At least one candidate that does not need reconnecting. */
  connected: z.boolean(),
  /** Every candidate needs reconnecting (and there is at least one). */
  needsReauth: z.boolean(),
  formatSupported: z.boolean(),
  caption: z.object({ length: z.number(), maxLength: z.number(), fits: z.boolean() }),
  /** Why it is unavailable, in the words the user reads. Null when available. */
  reason: z.string().nullable(),
});
export type PublishTargetVerdict = z.infer<typeof publishTargetVerdictSchema>;

/**
 * Can `platform` take this post? Connected (a candidate that does not need reconnecting),
 * the format is one the platform publishes, and the caption AS SENT — body + `hashtags`, the
 * same `platformCaptionLength` the writers and the publish gate measure — fits its
 * `captionLimits`. A Story sends no caption, so it always fits.
 */
export function publishTargetVerdict(input: {
  platform: PublishPlatform;
  format: PublishFormat;
  caption: string | null;
  hashtags?: HashtagTiers | string[] | null;
  accounts: ReadonlyArray<Pick<PublishAccountCandidate, 'platform' | 'needsReauth'>>;
}): PublishTargetVerdict {
  const { platform, format } = input;
  const label = PUBLISH_PLATFORM_LABELS[platform];
  const own = input.accounts.filter((account) => account.platform === platform);
  const connected = own.some((account) => !account.needsReauth);
  const needsReauth = own.length > 0 && !connected;
  const formatSupported = supportsFormat(platform, format);
  const { maxLength } = captionLimits(platform);
  const isStory = format === 'STORY';
  const length = isStory ? 0 : platformCaptionLength(platform, input.caption, input.hashtags);
  const fits = isStory || length <= maxLength;
  const reason = !connected
    ? needsReauth
      ? `Reconnect ${label} to post here`
      : `Connect ${label} to post here`
    : !formatSupported
      ? `${label} cannot publish a ${format.toLowerCase()}`
      : !fits
        ? captionTooLongMessage(platform, maxLength, length)
        : null;
  return {
    platform,
    available: reason === null,
    connected,
    needsReauth,
    formatSupported,
    caption: { length, maxLength, fits },
    reason,
  };
}

/** One verdict per platform, in `PUBLISH_PLATFORM_ORDER`. */
export function publishTargetVerdicts(input: {
  format: PublishFormat;
  caption: string | null;
  hashtags?: HashtagTiers | string[] | null;
  accounts: ReadonlyArray<Pick<PublishAccountCandidate, 'platform' | 'needsReauth'>>;
}): PublishTargetVerdict[] {
  return PUBLISH_PLATFORM_ORDER.map((platform) => publishTargetVerdict({ ...input, platform }));
}

// ── Group ─────────────────────────────────────────────────────────────────────

/**
 * A group's status, from its members'. All alike → that status; some published and some not →
 * `partial`; anything else → `mixed`.
 */
export const draftGroupStatusSchema = z.enum([
  'placeholder',
  'draft',
  'approved',
  'scheduled',
  'published',
  'failed',
  'partial',
  'mixed',
]);
export type DraftGroupStatus = z.infer<typeof draftGroupStatusSchema>;

export function summarizeDraftGroupStatus(statuses: ReadonlyArray<string>): DraftGroupStatus {
  const distinct = [...new Set(statuses)];
  if (distinct.length === 1) {
    const only = draftGroupStatusSchema.safeParse(distinct[0]);
    if (only.success) return only.data;
  }
  return distinct.includes('published') ? 'partial' : 'mixed';
}

export const draftGroupMemberSchema = z.object({
  id: z.string(),
  platform: publishPlatformSchema,
  status: z.string(),
  /** The one stamp, `platform_account_id`. Null when no account is chosen. */
  accountId: z.string().nullable(),
  /** The stamp described, when it is one of the brand's candidates for this platform. */
  account: publishAccountCandidateSchema.nullable(),
  /** `content_json.copy.caption`, verbatim — what this member's frame edits. */
  caption: z.string().nullable(),
  scheduledDate: z.string().nullable(),
  updatedAt: z.string().nullable(),
  platformPostId: z.string().nullable(),
  /** The row the group was fanned out from. Exactly one member is the source. */
  isSource: z.boolean(),
});
export type DraftGroupMember = z.infer<typeof draftGroupMemberSchema>;

/** GET /api/organic/calendar/drafts/:id/group — `:id` is any member. */
export const draftGroupResponseSchema = z.object({
  /** Null for a draft never fanned out (a group of one). */
  groupId: z.string().nullable(),
  sourceId: z.string(),
  format: publishFormatSchema,
  status: draftGroupStatusSchema,
  /** In `PUBLISH_PLATFORM_ORDER`. */
  members: z.array(draftGroupMemberSchema),
  /** Every platform's verdict for this post (the source's format and caption). */
  verdicts: z.array(publishTargetVerdictSchema),
});
export type DraftGroupResponse = z.infer<typeof draftGroupResponseSchema>;

/** One member's outcome in a group action. */
export const draftGroupActionResultSchema = z.object({
  id: z.string(),
  platform: publishPlatformSchema,
  /** `held`: this member passed its gate, but another member is blocked, so none moved. */
  outcome: z.enum(['approved', 'already_approved', 'blocked', 'held', 'published', 'failed']),
  /** The blocker or provider reason; null on success and on `held`. */
  reason: z.string().nullable(),
  message: z.string().nullable(),
  /** On an account blocker: the candidates the user can choose from. */
  accounts: z.array(publishAccountCandidateSchema).optional(),
});
export type DraftGroupActionResult = z.infer<typeof draftGroupActionResultSchema>;

/**
 * POST /api/organic/calendar/drafts/:id/group/approve — `:id` is any member. All or nothing:
 * every member is gated first; one blocked member approves none (HTTP 422, `status: 'blocked'`).
 */
export const draftGroupApproveResponseSchema = z.object({
  groupId: z.string().nullable(),
  status: z.enum(['approved', 'blocked']),
  results: z.array(draftGroupActionResultSchema),
});
export type DraftGroupApproveResponse = z.infer<typeof draftGroupApproveResponseSchema>;

/** The `complete` SSE event of POST /api/organic/calendar/drafts/bulk-publish. */
export const bulkPublishCompleteEventSchema = z.object({
  type: z.literal('complete'),
  total: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  /** `published` = every item, `failed` = none, `partial` = some. */
  groupStatus: z.enum(['published', 'partial', 'failed']),
  results: z.array(
    z.union([
      z.object({
        id: z.string(),
        status: z.literal('published'),
        postId: z.string(),
        platform: publishPlatformSchema,
        format: publishFormatSchema,
        accountId: z.string(),
      }),
      z.object({
        id: z.string(),
        status: z.literal('failed'),
        platform: publishPlatformSchema.nullable(),
        error: z.string(),
        code: z.string(),
      }),
    ]),
  ),
});
export type BulkPublishCompleteEvent = z.infer<typeof bulkPublishCompleteEventSchema>;

export function bulkPublishGroupStatus(
  succeeded: number,
  total: number,
): BulkPublishCompleteEvent['groupStatus'] {
  if (succeeded === total && total > 0) return 'published';
  return succeeded === 0 ? 'failed' : 'partial';
}

// ── Caption adaptation ────────────────────────────────────────────────────────

/**
 * POST /api/organic/calendar/drafts/:id/adapt-caption — rewrite `:id`'s caption in `platform`'s
 * voice and save it on the group's `platform` member. Explicit only: fan-out never adapts.
 */
export const adaptCaptionRequestSchema = z.object({ platform: publishPlatformSchema });
export type AdaptCaptionRequest = z.infer<typeof adaptCaptionRequestSchema>;

export const adaptCaptionResponseSchema = z.object({
  memberId: z.string(),
  platform: publishPlatformSchema,
  caption: z.string(),
  /** The member's caption before the rewrite — what an undo writes back. */
  previousCaption: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type AdaptCaptionResponse = z.infer<typeof adaptCaptionResponseSchema>;
