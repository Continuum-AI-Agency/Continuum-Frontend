import { z } from 'zod';

/** Server-owned labels for immutable attempts within a calendar-week collection. */
export const trendsGenerationKindSchema = z.enum(['initial', 'regeneration']);
export type TrendsGenerationKind = z.infer<typeof trendsGenerationKindSchema>;

/**
 * The Monday 00:00 UTC that anchors a trends generation's calendar week.
 *
 * Every producer of `brand_trends.generations.week_start_date` — the web app,
 * the MCP `trends_manage` tool, and the cron warmer — MUST derive the bucket from
 * this one function. Divergent conventions (e.g. a rolling "now − 7 days" date)
 * land generations under a week_start_date that week-scoped reads never match,
 * causing false-negative "no trends" results and breaking the
 * (brand_id, week_start_date) dedup.
 */
export function currentWeekStartUtc(now: Date = new Date()): Date {
  const offsetToMonday = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - offsetToMonday);
  return monday;
}

/** The same UTC-Monday bucket as a `YYYY-MM-DD` string, ready for `week_start_date`. */
export function currentWeekStartDateUtc(now: Date = new Date()): string {
  return currentWeekStartUtc(now).toISOString().slice(0, 10);
}

/** Compact browse metadata; individual insight rows remain generation-scoped. */
export const trendsWeekSummarySchema = z.object({
  weekStartDate: z.string().date(),
  generationCount: z.number().int().positive(),
  regenerationCount: z.number().int().nonnegative(),
  latestGenerationId: z.string().uuid(),
  latestCompletedAt: z.string().datetime().nullable(),
});
export type TrendsWeekSummary = z.infer<typeof trendsWeekSummarySchema>;
