// A brand's learned best posting times — the jsonb returned by the SQL function
// public.organic_best_times(brand_id, platform, window_days). Read by the Backend
// bulk scheduler; the organic dashboard's Best time / Posting frequency tiles
// read the same shape.

import { z } from 'zod';

/**
 * Below this many posts in the window the slots are noise: bulk plans keep the static
 * times, and the dashboard says so beside the slots it shows.
 */
export const ORGANIC_BEST_TIMES_MIN_POSTS = 20;

/** Where a scheduled slot's time came from: the brand's own posts, or the static table. */
export const bestTimeSourceSchema = z.enum(['learned', 'default']);
export type BestTimeSource = z.infer<typeof bestTimeSourceSchema>;

export const organicBestTimeSlotSchema = z.object({
  /** 0 = Sunday … 6 = Saturday, in the brand's timezone. */
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  /** `HH:00`, local to the brand's timezone. */
  time: z.string().regex(/^\d{2}:\d{2}$/),
  /** 1 = best slot of that weekday, 2 = runner-up. */
  rank: z.number().int().min(1),
  /** `weekday`: that weekday × hour bucket. `all_days`: the hour pooled across weekdays. */
  basis: z.enum(['weekday', 'all_days']),
  postCount: z.number().int().min(3),
  medianInteractions: z.number(),
  medianReach: z.number().nullable(),
});
export type OrganicBestTimeSlot = z.infer<typeof organicBestTimeSlotSchema>;

export const organicBestTimesSchema = z.object({
  platform: z.string(),
  timeZone: z.string(),
  windowDays: z.number().int(),
  postsAnalyzed: z.number().int(),
  postsPerWeek: z.number(),
  slots: z.array(organicBestTimeSlotSchema),
});
export type OrganicBestTimes = z.infer<typeof organicBestTimesSchema>;
