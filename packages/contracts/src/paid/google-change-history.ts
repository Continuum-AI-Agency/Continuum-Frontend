// What changed in a Google Ads account, as the paid-media-metrics `change_history` scope reads it
// from GAQL change_event: the edge's response, parsed by Jaina (Phase 2 item 5).
//
// change_event reaches back at most 30 days, today included, in the account's time zone, and
// refuses an open range. `coverage` says what was asked and what was read: a request reaching
// past the limit comes back truncated, and those days are UNREAD, never "no changes".

import { z } from 'zod';

const IsoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DayRangeSchema = z.object({ since: IsoDaySchema, until: IsoDaySchema });

/** A money amount in the account's currency, in ISO minor units (MXN 800.00 → 80000). */
const MoneySchema = z.object({ minor: z.number().int(), currency: z.string() });

/** The values a change set, on the side it is read from (before or after). Only what an answer
 *  needs; an ad's text is what changed, never how it performed. */
export const GoogleChangeValuesSchema = z.object({
  status: z.string().optional(),
  budget: MoneySchema.optional(),
  targetCpa: MoneySchema.optional(),
  /** A ratio: 3.5 = 350 %. */
  targetRoas: z.number().optional(),
  keyword: z.object({ text: z.string(), matchType: z.string() }).optional(),
  headlines: z.array(z.string()).optional(),
  descriptions: z.array(z.string()).optional(),
});
export type GoogleChangeValues = z.infer<typeof GoogleChangeValuesSchema>;

export const GoogleChangeSchema = z.object({
  /** When, ISO 8601 with the account's UTC offset. */
  at: z.string(),
  /** CAMPAIGN, CAMPAIGN_BUDGET, AD_GROUP, AD_GROUP_AD, AD_GROUP_CRITERION, CAMPAIGN_CRITERION,
   *  ASSET, … — Google's change_resource_type, verbatim. */
  resourceType: z.string(),
  operation: z.enum(['CREATE', 'UPDATE', 'REMOVE', 'UNKNOWN']),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  adGroupId: z.string().optional(),
  adGroupName: z.string().optional(),
  /** Native ad id from change_resource_name, never the containing ad-group id. */
  adId: z.string().optional(),
  /** The changed resource's exact Google resource name, when returned. */
  resourceName: z.string().optional(),
  changedFields: z.array(z.string()),
  /** Who, by channel, never by person: GOOGLE_ADS_WEB_CLIENT, GOOGLE_ADS_API,
   *  GOOGLE_ADS_AUTOMATED_RULE, GOOGLE_ADS_RECOMMENDATIONS, … */
  clientType: z.string(),
  before: GoogleChangeValuesSchema.optional(),
  after: GoogleChangeValuesSchema.optional(),
});
export type GoogleChange = z.infer<typeof GoogleChangeSchema>;

export const GOOGLE_CHANGE_HISTORY_MAX_DAYS = 30;

export const GoogleChangeHistorySchema = z.object({
  scope: z.literal('change_history'),
  customerId: z.string(),
  currency: z.string().nullable(),
  timeZone: z.string(),
  coverage: z.object({
    requested: DayRangeSchema,
    /** Null when nothing of the request is readable (it ends before the 30-day limit). */
    read: DayRangeSchema.nullable(),
    truncated: z.boolean(),
    reason: z.enum(['change_event_30_day_limit', 'row_limit']).optional(),
  }),
  /** Newest first. */
  changes: z.array(GoogleChangeSchema),
});
export type GoogleChangeHistory = z.infer<typeof GoogleChangeHistorySchema>;
