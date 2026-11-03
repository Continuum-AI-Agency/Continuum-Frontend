// The brand's organic week (H11, Organic Week): seven columns, Monday to Sunday of one ISO week in
// the caller's time zone. Each column holds what was PUBLISHED that day (with its latest measured
// reach), what is SCHEDULED, and what is still a DRAFT. Each account's best post of the week is
// held against that account's median reach over the 28 days before the week — the same
// reach ÷ median-reach lift organic_get_winners scores winners with.
//
// Served by the Backend at HOME_READ_PATHS.organicWeek: GET ?brandId=&weekStart=YYYY-MM-DD&timeZone=IANA.
// `weekStart` may be any day of the wanted week (default: today's week); `timeZone` defaults to UTC.
// The answer echoes the week and zone it actually read, so the tile never labels a different week.

import { z } from 'zod';
import { homeReadEnvelopeSchema, homeReadSourceSchema } from './envelope';

/** Days before the week whose posts set each account's reach bar. */
export const HOME_ORGANIC_WEEK_BASELINE_DAYS = 28;
/** Fewer baseline posts than this and the median is noise: the lift stays null. */
export const HOME_ORGANIC_WEEK_MIN_BASELINE_POSTS = 3;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoInstant = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();

export const homeOrganicPlatformSchema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'threads',
  'linkedin',
  'x',
]);
export type HomeOrganicPlatform = z.infer<typeof homeOrganicPlatformSchema>;

export const homeOrganicWeekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export type HomeOrganicWeekday = z.infer<typeof homeOrganicWeekdaySchema>;

/** A post that went live. One row per platform post id, however many snapshots it has. */
export const homeOrganicPublishedPostSchema = z.object({
  postId: z.string().min(1),
  platform: homeOrganicPlatformSchema,
  /** The platform's account id (e.g. the Instagram user id), not a Continuum row id. */
  accountId: z.string().min(1),
  publishedAt: isoInstant,
  /** The local day (in `week.timeZone`) the post went live. */
  day: isoDate,
  permalink: z.string().nullable(),
  mediaType: z.string().nullable(),
  /** Lifetime reach at the latest snapshot. Null until the post has been measured. */
  reach: count.nullable(),
  /** total_interactions, else likes + comments + shares + saves, at the same snapshot. */
  interactions: count.nullable(),
  /** interactions ÷ reach. Null without a positive reach. */
  engagementRate: z.number().nonnegative().nullable(),
  /** The day the reach was captured: a young post's reach is still climbing. */
  reachCapturedOn: isoDate.nullable(),
  /** reach ÷ the account's baseline median reach. Null without both. */
  reachLift: z.number().nonnegative().nullable(),
  /** An Instagram trial reel, shown to non-followers only: never a top post, never in a baseline. */
  isTrial: z.boolean(),
  /** Whether Continuum published it or the team posted it on the platform directly. */
  publishedThrough: z.enum(['continuum', 'external']),
});
export type HomeOrganicPublishedPost = z.infer<typeof homeOrganicPublishedPostSchema>;

const plannedFields = {
  draftId: z.string().min(1),
  platform: homeOrganicPlatformSchema.nullable(),
  /** The platform account id when the draft is bound to a known account, else the raw binding. */
  accountId: z.string().nullable(),
  scheduledAt: isoInstant,
  day: isoDate,
  format: z.string().nullable(),
  topic: z.string().nullable(),
};

/** A calendar slot that is approved or scheduled to go out — or failed to. */
export const homeOrganicScheduledPostSchema = z.object({
  ...plannedFields,
  status: z.enum(['approved', 'scheduled', 'failed']),
});
export type HomeOrganicScheduledPost = z.infer<typeof homeOrganicScheduledPostSchema>;

/** A calendar slot with content not yet approved. Empty placeholders are not drafts. */
export const homeOrganicDraftPostSchema = z.object({
  ...plannedFields,
  status: z.literal('draft'),
});
export type HomeOrganicDraftPost = z.infer<typeof homeOrganicDraftPostSchema>;

export const homeOrganicWeekDaySchema = z.object({
  date: isoDate,
  weekday: homeOrganicWeekdaySchema,
  published: z.array(homeOrganicPublishedPostSchema),
  scheduled: z.array(homeOrganicScheduledPostSchema),
  drafts: z.array(homeOrganicDraftPostSchema),
});
export type HomeOrganicWeekDay = z.infer<typeof homeOrganicWeekDaySchema>;

export const homeOrganicWeekAccountSchema = z.object({
  platform: homeOrganicPlatformSchema,
  accountId: z.string().min(1),
  name: z.string().nullable(),
  published: count,
  scheduled: count,
  drafts: count,
  /** Measured, non-trial posts published in the baseline window, and their median reach. */
  baseline: z.object({ posts: count, medianReach: z.number().nonnegative().nullable() }),
  /** The account's highest-reach non-trial post this week. */
  topPost: z
    .object({
      postId: z.string().min(1),
      reach: count,
      reachLift: z.number().nonnegative().nullable(),
    })
    .nullable(),
});
export type HomeOrganicWeekAccount = z.infer<typeof homeOrganicWeekAccountSchema>;

export const homeOrganicWeekDataSchema = z.object({
  week: z.object({ since: isoDate, until: isoDate, timeZone: z.string().min(1) }),
  baseline: z.object({
    since: isoDate,
    until: isoDate,
    days: z.literal(HOME_ORGANIC_WEEK_BASELINE_DAYS),
    statistic: z.literal('median'),
  }),
  days: z.array(homeOrganicWeekDaySchema).length(7),
  accounts: z.array(homeOrganicWeekAccountSchema),
  totals: z.object({ published: count, scheduled: count, drafts: count, withReach: count }),
  /**
   * The week's headline post: the highest reach lift across accounts (reach is not comparable
   * between accounts of different sizes); when no account has a baseline, the highest reach.
   */
  topPost: z
    .object({
      postId: z.string().min(1),
      platform: homeOrganicPlatformSchema,
      accountId: z.string().min(1),
      reach: count,
      reachLift: z.number().nonnegative().nullable(),
    })
    .nullable(),
  sources: z.array(homeReadSourceSchema),
});
export type HomeOrganicWeekData = z.infer<typeof homeOrganicWeekDataSchema>;

export const homeOrganicWeekReadSchema = homeReadEnvelopeSchema(homeOrganicWeekDataSchema);
export type HomeOrganicWeekRead = z.infer<typeof homeOrganicWeekReadSchema>;
